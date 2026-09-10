/**
 * Base class for every error the daemon and CLI raise deliberately.
 *
 * `httpStatus` lets the daemon's single error handler map an error to the right
 * response code, so routes never need their own try/catch mapping blocks.
 */
export class AppiumAgentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number = 500,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class SessionNotActiveError extends AppiumAgentError {
  constructor() {
    super('SESSION_NOT_ACTIVE', 'No active session. Run connect first.', 409);
  }
}

export class SessionAlreadyActiveError extends AppiumAgentError {
  constructor() {
    super(
      'SESSION_ALREADY_ACTIVE',
      'A session is already active. Run delete-session first.',
      409,
    );
  }
}

export class ElementNotFoundError extends AppiumAgentError {
  constructor(strategy: string, selector: string) {
    super('ELEMENT_NOT_FOUND', `Element not found: [${strategy}] "${selector}"`, 404);
  }
}

export class ElementRefNotFoundError extends AppiumAgentError {
  constructor(id: string) {
    super(
      'ELEMENT_REF_NOT_FOUND',
      `Element reference "${id}" not found. Re-run find-element.`,
      404,
    );
  }
}

export class StaleElementError extends AppiumAgentError {
  constructor(id: string, selector: string) {
    super(
      'STALE_ELEMENT',
      `Element "${selector}" (ref: ${id}) is no longer in the view hierarchy. Re-run find-element to get a new reference.`,
      410,
    );
  }
}

export class DaemonNotRunningError extends AppiumAgentError {
  constructor() {
    super(
      'DAEMON_NOT_RUNNING',
      'Daemon is not running. Start it with: appium-agent daemon:start',
      503,
    );
  }
}

export class ValidationError extends AppiumAgentError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

export class WaitTimeoutError extends AppiumAgentError {
  constructor(condition: string, selector: string, timeoutMs: number) {
    super(
      'WAIT_TIMEOUT',
      `Timed out after ${timeoutMs}ms waiting for "${selector}" to be ${condition}.`,
      408,
    );
  }
}

export class ContextNotFoundError extends AppiumAgentError {
  constructor(name: string, available: string[]) {
    super(
      'CONTEXT_NOT_FOUND',
      `Context "${name}" is not available. Available contexts: ${available.join(', ') || '(none)'}`,
      404,
    );
  }
}

export class UnauthorizedError extends AppiumAgentError {
  constructor() {
    super(
      'UNAUTHORIZED',
      'Missing or invalid daemon token. The CLI reads it from the daemon state file.',
      401,
    );
  }
}
