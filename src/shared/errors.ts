export class AppiumAgentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class SessionNotActiveError extends AppiumAgentError {
  constructor() {
    super('SESSION_NOT_ACTIVE', 'No active session. Run connect first.');
  }
}

export class SessionAlreadyActiveError extends AppiumAgentError {
  constructor() {
    super('SESSION_ALREADY_ACTIVE', 'A session is already active. Run close-app first.');
  }
}

export class ElementNotFoundError extends AppiumAgentError {
  constructor(strategy: string, selector: string) {
    super('ELEMENT_NOT_FOUND', `Element not found: [${strategy}] "${selector}"`);
  }
}

export class ElementRefNotFoundError extends AppiumAgentError {
  constructor(id: string) {
    super('ELEMENT_REF_NOT_FOUND', `Element reference "${id}" not found. Re-run find-element.`);
  }
}

export class StaleElementError extends AppiumAgentError {
  constructor(id: string, selector: string) {
    super(
      'STALE_ELEMENT',
      `Element "${selector}" (ref: ${id}) is no longer in the view hierarchy. Re-run find-element to get a new reference.`,
    );
  }
}

export class DaemonNotRunningError extends AppiumAgentError {
  constructor() {
    super('DAEMON_NOT_RUNNING', 'Daemon is not running. Start it with: appium-agent daemon start');
  }
}

export class ValidationError extends AppiumAgentError {
  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super('VALIDATION_ERROR', message);
  }
}
