import { DaemonNotRunningError } from '../shared/errors.js';
import type {
  ActivateAppRequest,
  ApiResponse,
  ClickRequest,
  ElementRectResponse,
  ElementReference,
  ExecuteCommandRequest,
  ExecuteCommandResponse,
  FindElementRequest,
  FindElementResponse,
  GetLocationRequest,
  InstallAppRequest,
  PageSourceResponse,
  PerformActionResponse,
  ScreenshotResponse,
  StartSessionRequest,
  StartSessionResponse,
  TerminateAppRequest,
  TypeRequest,
  VideoStopResponse,
} from '../shared/types.js';
import { DAEMON_PORT } from '../shared/constants.js';
import { isDaemonProcessAlive, readDaemonState } from '../daemon/pid-file.js';

export class DaemonClient {
  constructor(private readonly baseUrl: string) {}

  static async fromDaemonState(): Promise<DaemonClient> {
    const state = await readDaemonState();
    if (state === null || !isDaemonProcessAlive(state.pid)) {
      throw new DaemonNotRunningError();
    }
    return new DaemonClient(`http://127.0.0.1:${state.port}`);
  }

  static default(): DaemonClient {
    return new DaemonClient(`http://127.0.0.1:${DAEMON_PORT}`);
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });

    const json = (await response.json()) as ApiResponse<T>;

    if (!json.ok) {
      const err = new Error(json.error.message);
      (err as NodeJS.ErrnoException).code = json.error.code;
      throw err;
    }

    return json.data as T;
  }

  async startSession(req: StartSessionRequest): Promise<StartSessionResponse> {
    return this.request<StartSessionResponse>('POST', '/session', req);
  }

  async endSession(): Promise<void> {
    await this.request<{ message: string }>('DELETE', '/session');
  }

  async getSessionStatus() {
    return this.request<{ active: boolean } & Partial<StartSessionResponse>>('GET', '/session');
  }

  async findElement(req: FindElementRequest): Promise<FindElementResponse> {
    return this.request<FindElementResponse>('POST', '/elements/find', req);
  }

  async listElements(): Promise<{ elements: ElementReference[] }> {
    return this.request<{ elements: ElementReference[] }>('GET', '/elements');
  }

  async click(req: ClickRequest): Promise<void> {
    await this.request<{ message: string }>('POST', '/actions/click', req);
  }

  async type(req: TypeRequest): Promise<void> {
    await this.request<{ message: string }>('POST', '/actions/type', req);
  }

  async activateApp(req: ActivateAppRequest): Promise<void> {
    await this.request<{ message: string }>('POST', '/actions/activate-app', req);
  }

  async installApp(req: InstallAppRequest): Promise<void> {
    await this.request<{ message: string }>('POST', '/actions/install-app', req);
  }

  async terminateApp(req: TerminateAppRequest): Promise<boolean> {
    const result = await this.request<{ terminated: boolean }>('POST', '/actions/terminate-app', req);
    return result.terminated;
  }

  async executeCommand(req: ExecuteCommandRequest): Promise<ExecuteCommandResponse> {
    return this.request<ExecuteCommandResponse>('POST', '/actions/execute', req);
  }

  async takeScreenshot(): Promise<ScreenshotResponse> {
    return this.request<ScreenshotResponse>('GET', '/actions/screenshot');
  }

  async getPageSource(): Promise<PageSourceResponse> {
    return this.request<PageSourceResponse>('GET', '/actions/page-source');
  }

  async getElementLocation(req: GetLocationRequest): Promise<ElementRectResponse> {
    return this.request<ElementRectResponse>('POST', '/actions/location', req);
  }

  async performAction(body: unknown): Promise<PerformActionResponse> {
    return this.request<PerformActionResponse>('POST', '/actions/perform', body);
  }

  async startVideoRecording(): Promise<void> {
    await this.request<{ message: string; startedAt: string }>('POST', '/actions/video-start');
  }

  async stopVideoRecording(): Promise<VideoStopResponse> {
    return this.request<VideoStopResponse>('POST', '/actions/video-stop');
  }

  async shutdown(): Promise<void> {
    await this.request<{ message: string }>('POST', '/daemon/shutdown');
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.request('GET', '/health');
      return true;
    } catch {
      return false;
    }
  }
}
