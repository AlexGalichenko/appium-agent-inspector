# Changelog

## [Unreleased]

### Added

- **`take-screenshot`** command — capture the device screen as a PNG. Use `--output <path>` to save to a file, or omit it to print raw base64 to stdout.
- **`activate-app <appId>`** command — bring an app to the foreground by bundle ID (iOS) or package name (Android) without ending the Appium session.
- **`terminate-app <appId>`** command — terminate a running app. Prints whether the app was actually running at the time.
- **`reconnect`** command — close any existing session (silently ignoring errors) then immediately open a new one. Useful for recovering from a stale or dropped session without manually running `close-app` first.
- HTTP endpoints: `GET /actions/screenshot`, `POST /actions/activate-app`, `POST /actions/terminate-app`.

### Changed

- **`daemon:stop` renamed to `daemon:kill`** — the command now kills the daemon directly by PID (`SIGTERM`) and removes the state file, instead of sending an HTTP shutdown request. This is more reliable when the daemon HTTP server is unresponsive.

## [0.1.0] — initial release

- Persistent daemon process with `daemon:start` / `daemon:stop`.
- `connect` / `close-app` for Appium session lifecycle.
- `find-element`, `click`, `type`, `page-source` for basic UI interaction.
- Selector-rehydration element registry (short reference IDs, re-found at action time).
- JSON REST API on `127.0.0.1:47321`.
