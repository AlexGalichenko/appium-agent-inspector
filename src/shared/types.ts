import { z } from 'zod';

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

export const AppiumCapabilitiesSchema = z
  .object({
    platformName: z.enum(['iOS', 'Android']),
    'appium:automationName': z.enum(['XCUITest', 'UiAutomator2', 'Espresso']),
    'appium:deviceName': z.string(),
    'appium:udid': z.string().optional(),
    'appium:app': z.string().optional(),
    'appium:bundleId': z.string().optional(),
    'appium:appPackage': z.string().optional(),
    'appium:appActivity': z.string().optional(),
    'appium:platformVersion': z.string().optional(),
    'appium:noReset': z.boolean().optional(),
    'appium:fullReset': z.boolean().optional(),
  })
  .passthrough();

export type AppiumCapabilities = z.infer<typeof AppiumCapabilitiesSchema>;

// ---------------------------------------------------------------------------
// Appium server config
// ---------------------------------------------------------------------------

export const AppiumServerConfigSchema = z.object({
  hostname: z.string().default('localhost'),
  port: z.number().int().positive().default(4723),
  path: z.string().default('/'),
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
// Element reference
// ---------------------------------------------------------------------------

export interface ElementReference {
  id: string;
  selector: string;
  strategy: LocatorStrategy;
  foundAt: string;
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Element requests / responses
// ---------------------------------------------------------------------------

export const FindElementRequestSchema = z.object({
  strategy: LocatorStrategySchema,
  selector: z.string().min(1),
});

export type FindElementRequest = z.infer<typeof FindElementRequestSchema>;

export interface FindElementResponse {
  elementId: string;
  selector: string;
  strategy: LocatorStrategy;
  foundAt: string;
}

// ---------------------------------------------------------------------------
// Action requests
// ---------------------------------------------------------------------------

const ElementTargetSchema = z.union([
  z.object({ elementId: z.string().min(1) }),
  z.object({ strategy: LocatorStrategySchema, selector: z.string().min(1) }),
]);

export const ClickRequestSchema = ElementTargetSchema;
export type ClickRequest = z.infer<typeof ClickRequestSchema>;

export const TypeRequestSchema = ElementTargetSchema.and(
  z.object({
    text: z.string(),
    clearFirst: z.boolean().default(false),
  }),
);
export type TypeRequest = z.infer<typeof TypeRequestSchema>;

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
