import type { z } from 'zod';
import {
  CLI_LONG_REQUEST_TIMEOUT_MS,
  CLI_REQUEST_TIMEOUT_MS,
  DEFAULT_SCROLL_DURATION_MS,
  DEFAULT_SCROLL_MAX_SWIPES,
  DEFAULT_WAIT_TIMEOUT_MS,
  SCROLL_CHECK_ALLOWANCE_MS,
} from './constants.js';
import {
  AppIdRequestSchema,
  ElementTargetSchema,
  ExecuteCommandRequestSchema,
  FindElementRequestSchema,
  GetAttributeRequestSchema,
  InstallAppRequestSchema,
  PerformActionRequestSchema,
  ScrollRequestSchema,
  StartSessionRequestSchema,
  SwitchContextRequestSchema,
  TypeRequestSchema,
  WaitRequestSchema,
} from './types.js';
import type {
  ContextsResponse,
  DeviceInfoResponse,
  ElementRectResponse,
  ElementReference,
  ExecuteCommandResponse,
  FindElementResponse,
  FindElementsResponse,
  GetAttributeResponse,
  GetTextResponse,
  MessageResponse,
  PageSourceResponse,
  ScreenshotResponse,
  ScrollInput,
  ScrollResponse,
  SessionStatusResponse,
  StartSessionResponse,
  VideoStopResponse,
  WaitInput,
  WaitResponse,
} from './types.js';

export type HttpMethod = 'GET' | 'POST' | 'DELETE';

/**
 * One daemon endpoint, described once for both sides: the daemon registers it
 * and validates `body` against it, and the CLI's client calls it. `Res` is a
 * type-only marker for the response, so the two cannot disagree on a path,
 * a method or a payload shape.
 */
export interface Route<S extends z.ZodType | undefined, Res> {
  method: HttpMethod;
  path: string;
  body: S;
  /** The CLI's request timeout; a function when it scales with the request. */
  timeoutMs: number | ((input: S extends z.ZodType ? z.input<S> : never) => number);
  /** Never set at runtime; carries the response type. */
  readonly _res?: Res;
}

function route<Res, S extends z.ZodType | undefined = undefined>(
  method: HttpMethod,
  path: string,
  body?: S,
  timeoutMs: Route<S, Res>['timeoutMs'] = CLI_REQUEST_TIMEOUT_MS,
): Route<S, Res> {
  return { method, path, body: body as S, timeoutMs };
}

/**
 * Scrolling to an element swipes and re-checks up to `maxSwipes` times, so a
 * fixed timeout would abort a scroll the daemon is still legitimately running.
 */
export function scrollTimeoutMs(req: ScrollInput): number {
  const swipes =
    req.toElement === undefined ? 1 : (req.maxSwipes ?? DEFAULT_SCROLL_MAX_SWIPES);
  const perSwipeMs =
    (req.duration ?? DEFAULT_SCROLL_DURATION_MS) + SCROLL_CHECK_ALLOWANCE_MS;
  return CLI_REQUEST_TIMEOUT_MS + swipes * perSwipeMs;
}

/** The daemon is already bounded by the wait's own timeout; give it slack. */
function waitTimeoutMs(req: WaitInput): number {
  return (req.timeout ?? DEFAULT_WAIT_TIMEOUT_MS) + CLI_REQUEST_TIMEOUT_MS;
}

const LONG = CLI_LONG_REQUEST_TIMEOUT_MS;

export const ROUTES = {
  // session
  startSession: route<StartSessionResponse, typeof StartSessionRequestSchema>(
    'POST',
    '/session',
    StartSessionRequestSchema,
    LONG,
  ),
  endSession: route<MessageResponse>('DELETE', '/session', undefined, LONG),
  getSessionStatus: route<SessionStatusResponse>('GET', '/session'),
  getContexts: route<ContextsResponse>('GET', '/session/contexts'),
  switchContext: route<ContextsResponse, typeof SwitchContextRequestSchema>(
    'POST',
    '/session/context',
    SwitchContextRequestSchema,
  ),
  getDeviceInfo: route<DeviceInfoResponse>('GET', '/session/device'),

  // elements
  findElement: route<
    FindElementResponse | FindElementsResponse,
    typeof FindElementRequestSchema
  >('POST', '/elements/find', FindElementRequestSchema),
  waitForElement: route<WaitResponse, typeof WaitRequestSchema>(
    'POST',
    '/elements/wait',
    WaitRequestSchema,
    waitTimeoutMs,
  ),
  listElements: route<{ elements: ElementReference[] }>('GET', '/elements'),

  // actions on an element
  click: route<MessageResponse, typeof ElementTargetSchema>(
    'POST',
    '/actions/click',
    ElementTargetSchema,
  ),
  type: route<MessageResponse, typeof TypeRequestSchema>(
    'POST',
    '/actions/type',
    TypeRequestSchema,
  ),
  getText: route<GetTextResponse, typeof ElementTargetSchema>(
    'POST',
    '/actions/text',
    ElementTargetSchema,
  ),
  getAttribute: route<GetAttributeResponse, typeof GetAttributeRequestSchema>(
    'POST',
    '/actions/attribute',
    GetAttributeRequestSchema,
  ),
  getElementLocation: route<ElementRectResponse, typeof ElementTargetSchema>(
    'POST',
    '/actions/location',
    ElementTargetSchema,
  ),

  // screen-wide actions
  scroll: route<ScrollResponse, typeof ScrollRequestSchema>(
    'POST',
    '/actions/scroll',
    ScrollRequestSchema,
    scrollTimeoutMs,
  ),
  performAction: route<MessageResponse, typeof PerformActionRequestSchema>(
    'POST',
    '/actions/perform',
    PerformActionRequestSchema,
  ),
  getPageSource: route<PageSourceResponse>('GET', '/actions/page-source'),
  takeScreenshot: route<ScreenshotResponse>('GET', '/actions/screenshot'),
  startVideoRecording: route<MessageResponse>('POST', '/actions/video-start'),
  stopVideoRecording: route<VideoStopResponse>(
    'POST',
    '/actions/video-stop',
    undefined,
    LONG,
  ),
  executeCommand: route<ExecuteCommandResponse, typeof ExecuteCommandRequestSchema>(
    'POST',
    '/actions/execute',
    ExecuteCommandRequestSchema,
    LONG,
  ),

  // apps
  activateApp: route<MessageResponse, typeof AppIdRequestSchema>(
    'POST',
    '/actions/activate-app',
    AppIdRequestSchema,
  ),
  terminateApp: route<{ terminated: boolean }, typeof AppIdRequestSchema>(
    'POST',
    '/actions/terminate-app',
    AppIdRequestSchema,
  ),
  installApp: route<MessageResponse, typeof InstallAppRequestSchema>(
    'POST',
    '/actions/install-app',
    InstallAppRequestSchema,
    LONG,
  ),

  // daemon
  shutdown: route<MessageResponse>('POST', '/daemon/shutdown'),
} as const;

export type Routes = typeof ROUTES;
export type RouteName = keyof Routes;

/** The body a route accepts, as a caller may send it (defaults optional). */
export type RouteInput<R> =
  R extends Route<infer S, unknown> ? (S extends z.ZodType ? z.input<S> : never) : never;
/** The body a route handler receives, after validation and defaults. */
export type RouteBody<R> =
  R extends Route<infer S, unknown> ? (S extends z.ZodType ? z.output<S> : never) : never;
export type RouteResponse<R> = R extends { readonly _res?: infer Res } ? Res : never;

/** Any route, as the client sees it: only where to send it and how long to wait. */
export interface AnyRoute {
  method: HttpMethod;
  path: string;
  timeoutMs: number | ((input: never) => number);
  readonly _res?: unknown;
}
