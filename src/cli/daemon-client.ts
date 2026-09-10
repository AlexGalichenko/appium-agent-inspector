import { AppiumAgentError, DaemonNotRunningError } from '../shared/errors.js';
import type {
  ActivateAppRequest,
  ApiResponse,
  ClickRequest,
  ContextsResponse,
  DeviceInfoResponse,
  ElementRectResponse,
  ElementReference,
  ExecuteCommandRequest,
  ExecuteCommandResponse,
  FindElementInput,
  FindElementResponse,
  FindElementsResponse,
  GetAttributeRequest,
  GetAttributeResponse,
  GetLocationRequest,
  GetTextRequest,
  GetTextResponse,
  InstallAppRequest,
  PageSourceResponse,
  PerformActionResponse,
  ScreenshotResponse,
  ScrollInput,
  ScrollResponse,
  StartSessionRequest,
  StartSessionResponse,
  TerminateAppRequest,
  TypeRequest,
  VideoStopResponse,
  WaitInput,
  WaitResponse,
} from '../shared/types.js';
import {
  CLI_LONG_REQUEST_TIMEOUT_MS,
  CLI_REQUEST_TIMEOUT_MS,
  DAEMON_TOKEN_HEADER,
  DEFAULT_WAIT_TIMEOUT_MS,
  DEFAULT_DAEMON_PORT,
} from '../shared/constants.js';
import { findRunningDaemon } from '../shared/state-file.js';

interface RequestOptions {
  body?: unknown;
  /** Overrides the default per-request timeout. */
  timeoutMs?: number;
}

export class DaemonClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token?: string,
  ) {}

  static async fromDaemonState(): Promise<DaemonClient> {
    const state = await findRunningDaemon();
    if (state === null) {
      throw new DaemonNotRunningError();
    }
    return new DaemonClient(`http://127.0.0.1:${state.port}`, state.token);
  }

  static default(port = DEFAULT_DAEMON_PORT, token?: string): DaemonClient {
    return new DaemonClient(`http://127.0.0.1:${port}`, token);
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const { body, timeoutMs = CLI_REQUEST_TIMEOUT_MS } = options;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(this.token !== undefined && { [DAEMON_TOKEN_HEADER]: this.token }),
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
        // Without this the CLI hangs forever whenever the daemon wedges — for
        // example while blocked on an unresponsive Appium call.
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (
        err instanceof Error &&
        (err.name === 'TimeoutError' || err.name === 'AbortError')
      ) {
        throw new AppiumAgentError(
          'DAEMON_TIMEOUT',
          `Daemon did not respond within ${timeoutMs}ms (${method} ${path}). It may be stuck on a device call — check the daemon log, or restart it with: appium-agent daemon:kill && appium-agent daemon:start`,
        );
      }
      throw new DaemonNotRunningError();
    }

    const json = (await response.json()) as ApiResponse<T>;

    if (!json.ok) {
      throw new AppiumAgentError(
        json.error.code,
        json.error.message,
        response.status,
        json.error.details,
      );
    }

    return json.data as T;
  }

  // --- session ------------------------------------------------------------

  async startSession(req: StartSessionRequest): Promise<StartSessionResponse> {
    return this.request<StartSessionResponse>('POST', '/session', {
      body: req,
      timeoutMs: CLI_LONG_REQUEST_TIMEOUT_MS,
    });
  }

  async endSession(): Promise<void> {
    await this.request<{ message: string }>('DELETE', '/session', {
      timeoutMs: CLI_LONG_REQUEST_TIMEOUT_MS,
    });
  }

  async getSessionStatus() {
    return this.request<{ active: boolean } & Partial<StartSessionResponse>>(
      'GET',
      '/session',
    );
  }

  async getContexts(): Promise<ContextsResponse> {
    return this.request<ContextsResponse>('GET', '/session/contexts');
  }

  async switchContext(name: string): Promise<ContextsResponse> {
    return this.request<ContextsResponse>('POST', '/session/context', { body: { name } });
  }

  async getDeviceInfo(): Promise<DeviceInfoResponse> {
    return this.request<DeviceInfoResponse>('GET', '/session/device');
  }

  // --- elements -----------------------------------------------------------

  async findElement(req: FindElementInput): Promise<FindElementResponse> {
    return this.request<FindElementResponse>('POST', '/elements/find', { body: req });
  }

  async findElements(req: FindElementInput): Promise<FindElementsResponse> {
    return this.request<FindElementsResponse>('POST', '/elements/find', { body: req });
  }

  async waitForElement(req: WaitInput): Promise<WaitResponse> {
    return this.request<WaitResponse>('POST', '/elements/wait', {
      body: req,
      // The daemon is already bounded by the wait's own timeout; give it slack.
      timeoutMs: (req.timeout ?? DEFAULT_WAIT_TIMEOUT_MS) + CLI_REQUEST_TIMEOUT_MS,
    });
  }

  async listElements(): Promise<{ elements: ElementReference[] }> {
    return this.request<{ elements: ElementReference[] }>('GET', '/elements');
  }

  // --- actions ------------------------------------------------------------

  async click(req: ClickRequest): Promise<void> {
    await this.request<{ message: string }>('POST', '/actions/click', { body: req });
  }

  async type(req: TypeRequest): Promise<void> {
    await this.request<{ message: string }>('POST', '/actions/type', { body: req });
  }

  async getText(req: GetTextRequest): Promise<GetTextResponse> {
    return this.request<GetTextResponse>('POST', '/actions/text', { body: req });
  }

  async scroll(req: ScrollInput): Promise<ScrollResponse> {
    return this.request<ScrollResponse>('POST', '/actions/scroll', {
      body: req,
      timeoutMs: CLI_LONG_REQUEST_TIMEOUT_MS,
    });
  }

  async activateApp(req: ActivateAppRequest): Promise<void> {
    await this.request<{ message: string }>('POST', '/actions/activate-app', {
      body: req,
    });
  }

  async installApp(req: InstallAppRequest): Promise<void> {
    await this.request<{ message: string }>('POST', '/actions/install-app', {
      body: req,
      timeoutMs: CLI_LONG_REQUEST_TIMEOUT_MS,
    });
  }

  async terminateApp(req: TerminateAppRequest): Promise<boolean> {
    const result = await this.request<{ terminated: boolean }>(
      'POST',
      '/actions/terminate-app',
      { body: req },
    );
    return result.terminated;
  }

  async executeCommand(req: ExecuteCommandRequest): Promise<ExecuteCommandResponse> {
    return this.request<ExecuteCommandResponse>('POST', '/actions/execute', {
      body: req,
      timeoutMs: CLI_LONG_REQUEST_TIMEOUT_MS,
    });
  }

  async takeScreenshot(): Promise<ScreenshotResponse> {
    return this.request<ScreenshotResponse>('GET', '/actions/screenshot');
  }

  async getPageSource(): Promise<PageSourceResponse> {
    return this.request<PageSourceResponse>('GET', '/actions/page-source');
  }

  async getAttribute(req: GetAttributeRequest): Promise<GetAttributeResponse> {
    return this.request<GetAttributeResponse>('POST', '/actions/attribute', {
      body: req,
    });
  }

  async getElementLocation(req: GetLocationRequest): Promise<ElementRectResponse> {
    return this.request<ElementRectResponse>('POST', '/actions/location', { body: req });
  }

  async performAction(body: unknown): Promise<PerformActionResponse> {
    return this.request<PerformActionResponse>('POST', '/actions/perform', { body });
  }

  async startVideoRecording(): Promise<void> {
    await this.request<{ message: string; startedAt: string }>(
      'POST',
      '/actions/video-start',
    );
  }

  async stopVideoRecording(): Promise<VideoStopResponse> {
    return this.request<VideoStopResponse>('POST', '/actions/video-stop', {
      timeoutMs: CLI_LONG_REQUEST_TIMEOUT_MS,
    });
  }

  // --- daemon -------------------------------------------------------------

  async shutdown(): Promise<void> {
    await this.request<{ message: string }>('POST', '/daemon/shutdown');
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.request('GET', '/health', { timeoutMs: 2000 });
      return true;
    } catch {
      return false;
    }
  }
}
