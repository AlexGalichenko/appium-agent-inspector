import { AppiumAgentError, DaemonNotRunningError } from '../shared/errors.js';
import type {
  ApiResponse,
  ElementReference,
  FindElementInput,
  FindElementResponse,
  FindElementsResponse,
} from '../shared/types.js';
import {
  CLI_REQUEST_TIMEOUT_MS,
  DAEMON_TOKEN_HEADER,
  DEFAULT_DAEMON_PORT,
} from '../shared/constants.js';
import { ROUTES } from '../shared/routes.js';
import type {
  AnyRoute,
  HttpMethod,
  RouteInput,
  RouteName,
  RouteResponse,
  Routes,
} from '../shared/routes.js';
import { findRunningDaemon } from '../shared/state-file.js';

/**
 * Reads a daemon reply, insisting on our `{ ok, … }` envelope. Anything else —
 * a non-JSON body, another service's error page — would otherwise surface as a
 * crash or an `Error [undefined]` the user cannot act on.
 */
async function readEnvelope<T>(
  response: Response,
  method: string,
  path: string,
): Promise<ApiResponse<T>> {
  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }

  if (isEnvelope(json)) return json as ApiResponse<T>;

  throw new AppiumAgentError(
    'UNEXPECTED_RESPONSE',
    `The daemon sent an unexpected HTTP ${response.status} reply to ${method} ${path}. It may be a different version than this CLI — restart it with: appium-agent daemon:kill && appium-agent daemon:start`,
    response.status,
    text.slice(0, 500),
  );
}

function isEnvelope(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || !('ok' in value)) return false;
  if (value.ok === true) return 'data' in value;
  if (value.ok !== false || !('error' in value)) return false;
  const { error } = value;
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

interface RequestOptions {
  body?: unknown;
  /** Overrides the default per-request timeout. */
  timeoutMs?: number;
}

/** A route with no body becomes a no-argument method. */
type RouteMethod<R> = [RouteInput<R>] extends [never]
  ? () => Promise<RouteResponse<R>>
  : (body: RouteInput<R>) => Promise<RouteResponse<R>>;

/** `findElement` is typed by hand below: its reply depends on `all`. */
type GeneratedMethods = {
  [K in Exclude<RouteName, 'findElement'>]: RouteMethod<Routes[K]>;
};

// The route methods are attached to the prototype from the shared table (end of
// file); this interface tells TypeScript they are there.
// oxlint-disable-next-line typescript/no-unsafe-declaration-merging -- see above
export interface DaemonClient extends GeneratedMethods {}

// oxlint-disable-next-line typescript/no-unsafe-declaration-merging -- see above
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

  /** Calls a route from the shared table with its own method, path and timeout. */
  call<R extends AnyRoute>(route: R, body?: unknown): Promise<RouteResponse<R>>;
  call(route: AnyRoute, body?: unknown): Promise<unknown> {
    const { timeoutMs } = route;
    return this.request(route.method, route.path, {
      ...(body !== undefined && { body }),
      timeoutMs:
        typeof timeoutMs === 'function'
          ? (timeoutMs as (input: unknown) => number)(body)
          : timeoutMs,
    });
  }

  private async request<T>(
    method: HttpMethod,
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

    const json = await readEnvelope<T>(response, method, path);

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

  /** With `all: true` the daemon stores and returns every match. */
  async findElement(req: FindElementInput & { all: true }): Promise<FindElementsResponse>;
  async findElement(
    req: FindElementInput & { all?: false },
  ): Promise<FindElementResponse>;
  async findElement(
    req: FindElementInput,
  ): Promise<FindElementResponse | FindElementsResponse> {
    return this.call(ROUTES.findElement, req);
  }

  /** The one route with a path parameter, so it is not in the shared table. */
  async getElement(id: string): Promise<ElementReference> {
    return this.request<ElementReference>('GET', `/elements/${encodeURIComponent(id)}`);
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

for (const name of Object.keys(ROUTES) as RouteName[]) {
  if (name === 'findElement') continue;
  const route = ROUTES[name] as AnyRoute;
  Object.defineProperty(DaemonClient.prototype, name, {
    value(this: DaemonClient, body?: unknown) {
      return this.call(route, body);
    },
  });
}
