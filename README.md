# appium-agent-inspector

A persistent Appium daemon server with a CLI client, built on [WebdriverIO](https://webdriver.io/). To enable agent tools interact with appium.

## How it works

```
┌─────────────────────────────────────────────────────┐
│  appium-agent CLI (any number of invocations)       │
│  connect / click / type / page-source / …           │
└──────────────┬──────────────────────────────────────┘
               │  HTTP  (127.0.0.1:47321)
┌──────────────▼──────────────────────────────────────┐
│  appium-daemon  (persistent background process)     │
│  Fastify server · SessionManager · ElementRegistry  │
└──────────────┬──────────────────────────────────────┘
               │  WebDriver protocol
┌──────────────▼──────────────────────────────────────┐
│  Appium server  (localhost:4723)                    │
│  iOS / Android device or emulator                   │
└─────────────────────────────────────────────────────┘
```

## Requirements

- Node.js 20+
- Appium running on `localhost:4723` (or a custom host/port)
- Xcode / Android SDK for the target platform

## Installation

```bash
npm install
npm run build
```

## Quick start

```bash
# 1. Start the daemon (runs in the background)
node dist/cli/index.js daemon:start

# 2. Launch an iOS app
node dist/cli/index.js connect --caps '{
  "platformName": "iOS",
  "appium:automationName": "XCUITest",
  "appium:deviceName": "iPhone 15",
  "appium:bundleId": "com.example.app"
}'

# 3. Interact with the app
node dist/cli/index.js find-element --strategy "accessibility id" --selector "Login"
# → Element found: ID=V1StGXR8_Z5jd

node dist/cli/index.js click --element-id V1StGXR8_Z5jd
node dist/cli/index.js type --selector "Username" --strategy "accessibility id" --text "admin" --clear
node dist/cli/index.js page-source > source.yaml
node dist/cli/index.js take-screenshot --output screen.png
node dist/cli/index.js video-start
node dist/cli/index.js video-stop recording.mp4

# 4. Close the app
node dist/cli/index.js close-app

# 5. Kill the daemon
node dist/cli/index.js daemon:kill
```

## CLI reference

### Daemon lifecycle

| Command | Description |
|---|---|
| `daemon:start [--foreground]` | Start the daemon. Runs detached by default; `--foreground` keeps it in the terminal. |
| `daemon:kill` | Kill the running daemon process by PID and remove its state file. |

### Session

| Command | Options | Description |
|---|---|---|
| `connect` | `--caps <json>` · `--server-host` · `--server-port` · `--server-path` | Create an Appium session. `--caps` accepts a JSON string. |
| `reconnect` | `--caps <json>` · `--server-host` · `--server-port` · `--server-path` | Close any existing session (silently ignoring errors) then start a new one. Use this to recover from a dropped or stale session without manually running `close-app` first. |
| `close-app` | — | Delete the session and clear all element references. |

### Elements

| Command | Options | Description |
|---|---|---|
| `find-element` | `--strategy <strategy>` · `--selector <value>` | Find an element and store a reusable reference. Prints the element ID. |

Supported locator strategies: `accessibility id`, `id`, `xpath`, `class name`, `-android uiautomator`, `-ios predicate string`, `-ios class chain`, `css selector`.

### Actions

| Command | Options | Description |
|---|---|---|
| `click` | `--element-id <id>` **or** `--strategy` + `--selector` | Tap an element. |
| `type` | `--text <text>` · `--element-id <id>` **or** `--strategy` + `--selector` · `--clear` | Type text. Pass `--clear` to clear the field first. |
| `page-source` | `--raw` | Print the accessibility tree as YAML (default). `--raw` prints the full XML including layout attributes. |
| `take-screenshot` | `--output <path>` | Capture the device screen. Saves a PNG to `--output`; prints base64 to stdout when omitted. |
| `video-start` | — | Start video recording of the device screen. |
| `video-stop [output]` | — | Stop video recording. Saves MP4 to `output` path when provided; prints base64 to stdout when omitted. |
| `get-location` | `--element-id <id>` **or** `--strategy` + `--selector` | Get the position and size (`x`, `y`, `width`, `height`) of an element. |
| `perform-action` | `<json>` | Perform a touch gesture or raw W3C actions sequence. Accepts a JSON object (`tap`, `swipe`, `long-press`) or a W3C actions array for multi-touch. |
| `install-app <appPath>` | — | Install an app on the device. Accepts a path to `.ipa`, `.apk`, or `.app`. |
| `activate-app <appId>` | — | Bring an app to the foreground without ending the session. iOS: bundle ID, Android: package name. |
| `terminate-app <appId>` | — | Terminate a running app. Prints whether the app was actually running. |

## Element references

`find-element` returns a short ID (e.g. `V1StGXR8_Z5jd`). Pass this to `--element-id` in subsequent `click` or `type` commands instead of repeating the locator.

References use **selector rehydration**: the daemon stores the strategy + selector, not the raw WebDriver element handle. Each action re-finds the element at call time, which prevents stale-element errors caused by view-hierarchy changes or RecyclerView recycling. If the element can no longer be found, a `STALE_ELEMENT` error is returned with the original selector in the message.

## Daemon state

The daemon writes `PID` and `port` to `.appium-agent/daemon.json` in the project directory on startup, and removes it on clean shutdown. The CLI reads this file to locate the running daemon. The `.appium-agent/` directory is gitignored.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DAEMON_PORT` | `47321` | TCP port the daemon listens on. |
| `LOG_LEVEL` | `info` | Pino log level (`trace`, `debug`, `info`, `warn`, `error`, `silent`). |
| `NODE_ENV` | — | Set to `production` to disable pretty-printing and error detail in 500 responses. |

## HTTP API

The daemon exposes a JSON REST API on `127.0.0.1:47321`. All responses use the envelope `{ "ok": true, "data": … }` on success and `{ "ok": false, "error": { "code": "…", "message": "…" } }` on failure.

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness check. |
| `POST` | `/session` | Start an Appium session (`StartSessionRequest` body). |
| `DELETE` | `/session` | Close the active session. |
| `GET` | `/session` | Get current session status and metadata. |
| `POST` | `/elements/find` | Find an element and store a reference. |
| `GET` | `/elements` | List all stored element references. |
| `GET` | `/elements/:id` | Inspect a stored element reference. |
| `POST` | `/actions/click` | Click an element. |
| `POST` | `/actions/type` | Type text into an element. |
| `GET` | `/actions/page-source` | Get the current XML page source. |
| `GET` | `/actions/screenshot` | Capture a screenshot (returns base64-encoded PNG). |
| `POST` | `/actions/install-app` | Install an app on the device (`{ appPath }` body). |
| `POST` | `/actions/activate-app` | Bring an app to the foreground (`{ appId }` body). |
| `POST` | `/actions/terminate-app` | Terminate a running app (`{ appId }` body). |
| `POST` | `/actions/video-start` | Start screen recording. |
| `POST` | `/actions/video-stop` | Stop screen recording (returns base64-encoded MP4). |
| `POST` | `/actions/location` | Get element position and size (`ElementTarget` body, returns `{x, y, width, height}`). |
| `POST` | `/actions/perform` | Perform a touch gesture or raw W3C actions sequence (gesture object or actions array body). |
| `POST` | `/daemon/shutdown` | Gracefully shut down the daemon. |

## Development

```bash
# Type-check
npm run typecheck

# Run in watch mode (daemon)
npm run dev:daemon

# Run tests
npm test
npm run test:watch
```

## Project structure

```
src/
├── shared/          # Zod schemas, error classes, constants, logger
├── config/          # Appium capability builder helpers
├── daemon/
│   ├── routes/      # Fastify route handlers (session, elements, actions)
│   ├── server.ts    # Fastify server factory
│   ├── session-manager.ts   # WebdriverIO session lifecycle
│   ├── element-registry.ts  # Selector-rehydration element store
│   ├── pid-file.ts          # Daemon state persistence
│   └── index.ts             # Daemon process entry point
└── cli/
    ├── commands/    # One file per CLI command
    ├── daemon-client.ts     # HTTP client (fetch-based)
    └── index.ts             # Commander root

test/                # Unit tests (mirrors src/ structure)
```
