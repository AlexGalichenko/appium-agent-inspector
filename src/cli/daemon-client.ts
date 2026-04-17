import { DaemonNotRunningError } from '../shared/errors.js';
import type {
  ApiResponse,
  ClickRequest,
  ElementReference,
  FindElementRequest,
  FindElementResponse,
  PageSourceResponse,
  StartSessionRequest,
  StartSessionResponse,
  TypeRequest,
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

  async getPageSource(): Promise<PageSourceResponse> {
    return this.request<PageSourceResponse>('GET', '/actions/page-source');
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
