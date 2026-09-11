import { z } from 'zod';
import {
  APPIUM_DEFAULT_HOST,
  APPIUM_DEFAULT_PATH,
  APPIUM_DEFAULT_PORT,
  DEFAULT_SCROLL_DURATION_MS,
  DEFAULT_SCROLL_MAX_SWIPES,
  DEFAULT_WAIT_TIMEOUT_MS,
} from './constants.js';

// ---------------------------------------------------------------------------
// Locator strategies
// ---------------------------------------------------------------------------

export const LocatorStrategySchema = z.enum([
  'accessibility id',
  'id',
  'xpath',
  'class name',
  '-android uiautomator',
  '-ios predicate string',
  '-ios class chain',
  'css selector',
]);

export type LocatorStrategy = z.infer<typeof LocatorStrategySchema>;

// ---------------------------------------------------------------------------
// Appium capabilities
// ---------------------------------------------------------------------------

/**
 * Appium matches these names case-insensitively, so `"ios"` or `"UIAutomator2"`
 * must not be rejected here. Known names are rewritten to their canonical
 * spelling; anything else is passed through untouched.
 */
function canonicalName(known: readonly string[]) {
  return (value: unknown) =>
    typeof value === 'string'
      ? (known.find((name) => name.toLowerCase() === value.toLowerCase()) ?? value)
      : value;
}

const PLATFORM_NAMES = ['iOS', 'Android'] as const;
const KNOWN_AUTOMATION_NAMES = [
  'XCUITest',
  'UiAutomator2',
  'Espresso',
  'Mac2',
  'Flutter',
  'Chromium',
  'Gecko',
  'Safari',
  'Windows',
] as const;

export const AppiumCapabilitiesSchema = z
  .object({
    platformName: z.preprocess(canonicalName(PLATFORM_NAMES), z.enum(PLATFORM_NAMES)),
    // Third-party drivers register their own names, so only require one is given.
    'appium:automationName': z.preprocess(
      canonicalName(KNOWN_AUTOMATION_NAMES),
      z.string().min(1),
    ),
    'appium:deviceName': z.string().optional(),
    'appium:udid': z.string().optional(),
    'appium:app': z.string().optional(),
    'appium:bundleId': z.string().optional(),
    'appium:appPackage': z.string().optional(),
    'appium:appActivity': z.string().optional(),
    'appium:platformVersion': z.string().optional(),
    'appium:noReset': z.boolean().optional(),
    'appium:fullReset': z.boolean().optional(),
  })
  .loose();

export type AppiumCapabilities = z.infer<typeof AppiumCapabilitiesSchema>;

// ---------------------------------------------------------------------------
// Appium server config
// ---------------------------------------------------------------------------

export const AppiumServerConfigSchema = z.object({
  hostname: z.string().default(APPIUM_DEFAULT_HOST),
  port: z.number().int().positive().default(APPIUM_DEFAULT_PORT),
  path: z.string().default(APPIUM_DEFAULT_PATH),
});

export type AppiumServerConfig = z.infer<typeof AppiumServerConfigSchema>;

// ---------------------------------------------------------------------------
// Session requests / responses
// ---------------------------------------------------------------------------

export const StartSessionRequestSchema = z.object({
  capabilities: AppiumCapabilitiesSchema,
  server: AppiumServerConfigSchema.partial().optional(),
});

export type StartSessionRequest = z.infer<typeof StartSessionRequestSchema>;

export interface StartSessionResponse {
  sessionId: string;
  capabilities: Record<string, unknown>;
  startedAt: string;
}

// ---------------------------------------------------------------------------
// Context (native / webview) switching
// ---------------------------------------------------------------------------

export const SwitchContextRequestSchema = z.object({
  name: z.string().min(1),
});

export type SwitchContextRequest = z.infer<typeof SwitchContextRequestSchema>;

export interface ContextsResponse {
  current: string | null;
  contexts: string[];
}

// ---------------------------------------------------------------------------
// Device info
// ---------------------------------------------------------------------------

export interface DeviceInfoResponse {
  platformName: string | null;
  platformVersion: string | null;
  deviceName: string | null;
  window: { width: number; height: number };
  orientation: string | null;
  context: string | null;
}

// ---------------------------------------------------------------------------
// Element reference
// ---------------------------------------------------------------------------

export interface ElementReference {
  id: string;
  selector: string;
  strategy: LocatorStrategy;
  /** Position among all matches for the selector. 0 for a unique match. */
  index: number;
  foundAt: string;
  sessionId: string;
  /**
   * The element's text when it was found, recorded only for positional
   * references (an ambiguous selector). Positions shift as lists scroll and
   * recycle, so rehydration checks this to avoid silently acting on a
   * different element.
   */
  fingerprint?: string;
}

// ---------------------------------------------------------------------------
// Element requests / responses
// ---------------------------------------------------------------------------

export const FindElementRequestSchema = z.object({
  strategy: LocatorStrategySchema,
  selector: z.string().min(1),
  /** Which match to store when the selector is ambiguous. */
  index: z.number().int().nonnegative().default(0),
  /** Store a reference for every match instead of just one. */
  all: z.boolean().default(false),
});

export type FindElementRequest = z.infer<typeof FindElementRequestSchema>;
/** What a caller may send: `index` and `all` fall back to their defaults. */
export type FindElementInput = z.input<typeof FindElementRequestSchema>;

export interface FindElementResponse {
  elementId: string;
  selector: string;
  strategy: LocatorStrategy;
  index: number;
  foundAt: string;
  /** Total matches for the selector, so callers can detect ambiguity. */
  matchCount: number;
}

export interface FindElementsResponse {
  matchCount: number;
  elements: FindElementResponse[];
}

export const WaitConditionSchema = z.enum(['existing', 'displayed', 'gone', 'enabled']);
export type WaitCondition = z.infer<typeof WaitConditionSchema>;

// ---------------------------------------------------------------------------
// Action requests
// ---------------------------------------------------------------------------

const ElementTargetSchema = z.union([
  z.object({ elementId: z.string().min(1) }),
  z.object({
    strategy: LocatorStrategySchema,
    selector: z.string().min(1),
    index: z.number().int().nonnegative().default(0),
  }),
]);

export type ElementTarget = z.infer<typeof ElementTargetSchema>;

export const ClickRequestSchema = ElementTargetSchema;
export type ClickRequest = z.infer<typeof ClickRequestSchema>;

export const GetLocationRequestSchema = ElementTargetSchema;
export type GetLocationRequest = z.infer<typeof GetLocationRequestSchema>;

export interface ElementRectResponse {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const TypeRequestSchema = ElementTargetSchema.and(
  z.object({
    text: z.string(),
    clearFirst: z.boolean().default(false),
  }),
);
export type TypeRequest = z.infer<typeof TypeRequestSchema>;

export const GetTextRequestSchema = ElementTargetSchema;
export type GetTextRequest = z.infer<typeof GetTextRequestSchema>;

export interface GetTextResponse {
  text: string;
}

export const WaitRequestSchema = z.object({
  strategy: LocatorStrategySchema,
  selector: z.string().min(1),
  condition: WaitConditionSchema.default('displayed'),
  timeout: z.number().int().positive().max(600_000).default(DEFAULT_WAIT_TIMEOUT_MS),
});

export type WaitRequest = z.infer<typeof WaitRequestSchema>;
export type WaitInput = z.input<typeof WaitRequestSchema>;

export interface WaitResponse {
  condition: WaitCondition;
  selector: string;
  waitedMs: number;
}

// ---------------------------------------------------------------------------
// Scrolling
// ---------------------------------------------------------------------------

export const ScrollDirectionSchema = z.enum(['up', 'down', 'left', 'right']);
export type ScrollDirection = z.infer<typeof ScrollDirectionSchema>;

export const ScrollRequestSchema = z.object({
  direction: ScrollDirectionSchema.default('down'),
  /** Fraction of the screen to travel per swipe. */
  percent: z.number().positive().max(0.95).default(0.6),
  /** Repeat the swipe until this element appears (bounded by maxSwipes). */
  toElement: z
    .object({
      strategy: LocatorStrategySchema,
      selector: z.string().min(1),
    })
    .optional(),
  maxSwipes: z.number().int().positive().max(50).default(DEFAULT_SCROLL_MAX_SWIPES),
  duration: z.number().int().nonnegative().default(DEFAULT_SCROLL_DURATION_MS),
});

export type ScrollRequest = z.infer<typeof ScrollRequestSchema>;
export type ScrollInput = z.input<typeof ScrollRequestSchema>;

export interface ScrollResponse {
  direction: ScrollDirection;
  swipes: number;
  found: boolean | null;
}

// ---------------------------------------------------------------------------
// App management requests
// ---------------------------------------------------------------------------

export const ActivateAppRequestSchema = z.object({
  appId: z.string().min(1),
});

export type ActivateAppRequest = z.infer<typeof ActivateAppRequestSchema>;

export const TerminateAppRequestSchema = z.object({
  appId: z.string().min(1),
});

export type TerminateAppRequest = z.infer<typeof TerminateAppRequestSchema>;

export const InstallAppRequestSchema = z.object({
  appPath: z.string().min(1),
});

export type InstallAppRequest = z.infer<typeof InstallAppRequestSchema>;

export const GetAttributeRequestSchema = ElementTargetSchema.and(
  z.object({ attribute: z.string().min(1) }),
);

export type GetAttributeRequest = z.infer<typeof GetAttributeRequestSchema>;

export interface GetAttributeResponse {
  attribute: string;
  value: string | null;
}

// ---------------------------------------------------------------------------
// Execute command request / response
// ---------------------------------------------------------------------------

export const ExecuteCommandRequestSchema = z.object({
  command: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});

export type ExecuteCommandRequest = z.infer<typeof ExecuteCommandRequestSchema>;

export interface ExecuteCommandResponse {
  result: unknown;
}

// ---------------------------------------------------------------------------
// Perform action request / response
// ---------------------------------------------------------------------------

// High-level gesture shortcuts
export const GestureActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('tap'),
    x: z.number(),
    y: z.number(),
    duration: z.number().int().nonnegative().default(0),
  }),
  z.object({
    type: z.literal('swipe'),
    startX: z.number(),
    startY: z.number(),
    endX: z.number(),
    endY: z.number(),
    duration: z.number().int().nonnegative().default(1000),
  }),
  z.object({
    type: z.literal('long-press'),
    x: z.number(),
    y: z.number(),
    duration: z.number().int().nonnegative().default(1500),
  }),
]);

// Raw W3C Actions API — array of action source objects
export const RawActionsSchema = z.array(z.record(z.string(), z.unknown()));

export const PerformActionRequestSchema = z.union([
  GestureActionSchema,
  RawActionsSchema,
]);

export type PerformActionRequest = z.infer<typeof PerformActionRequestSchema>;

export interface PerformActionResponse {
  message: string;
}

// ---------------------------------------------------------------------------
// Page source response
// ---------------------------------------------------------------------------

export interface PageSourceResponse {
  source: string;
  capturedAt: string;
}

// ---------------------------------------------------------------------------
// Screenshot response
// ---------------------------------------------------------------------------

export interface ScreenshotResponse {
  data: string; // base64-encoded PNG
  capturedAt: string;
}

// ---------------------------------------------------------------------------
// Video recording response
// ---------------------------------------------------------------------------

export interface VideoStopResponse {
  data: string; // base64-encoded MP4
  stoppedAt: string;
}

// ---------------------------------------------------------------------------
// Daemon state (persisted to disk)
// ---------------------------------------------------------------------------

export interface DaemonState {
  pid: number;
  port: number;
  startedAt: string;
  /** Shared secret the CLI sends back on every request. */
  token?: string;
  logFile?: string;
}

// ---------------------------------------------------------------------------
// HTTP response envelope
// ---------------------------------------------------------------------------

export interface OkResponse<T = unknown> {
  ok: true;
  data: T;
}

export interface ErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T = unknown> = OkResponse<T> | ErrorResponse;
