# appium-agent-inspector

A CLI daemon for AI-driven mobile UI inspection and automation via [Appium](https://appium.io/) and [WebdriverIO](https://webdriver.io/). Exposes a stateful REST API so AI agents can interact with iOS and Android apps through simple shell commands.

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

- Node.js 22.12+
- Appium with the driver for your platform, running on `localhost:4723` (or a custom host/port)
- Xcode / Android SDK for the target platform

## Installation

```bash
npm install appium-agent-inspector
```

## Quick start

```bash
# 0. Install Appium and a driver, then start the server (must be running before connecting)
npm install -g appium
appium driver install xcuitest   # or: appium driver install uiautomator2
appium

# 1. Start the daemon (runs in the background)
npx appium-agent daemon:start

# 2. Launch an iOS app
npx appium-agent connect --caps '{
  "platformName": "iOS",
  "appium:automationName": "XCUITest"
}'

# 3. Interact with the app
npx appium-agent page-source                       # compact accessibility tree
npx appium-agent find-element --strategy "accessibility id" --selector "Login"
# → Element found: ID=V1StGXR8_Z5jd

npx appium-agent click --element-id V1StGXR8_Z5jd
npx appium-agent type --selector "Username" --strategy "accessibility id" --text "admin" --clear
npx appium-agent wait --strategy "accessibility id" --selector "Dashboard" --for displayed
npx appium-agent scroll --direction down --to-strategy "accessibility id" --to-selector "Submit"
npx appium-agent take-screenshot --output screen.png
npx appium-agent video-start
npx appium-agent video-stop recording.mp4

# 4. Close the session
npx appium-agent delete-session

# 5. Kill the daemon
npx appium-agent daemon:kill
```

## Claude skill

`appium-agent` ships with a Claude skill that teaches AI agents how to use all CLI commands. Install it into your project with:

```bash
npx appium-agent install --skill
```

This copies `.claude/skills/appium-agent/SKILL.md` into the current working directory, making the skill available to Claude Code and compatible AI agents in that project.

## CLI reference

### Setup

| Command | Options | Description |
|---|---|---|
| `install` | `--skill` | Install the bundled Claude skill into `.claude/skills/appium-agent/` in the current project. |

### Daemon lifecycle

| Command | Description |
|---|---|
| `daemon:start [--foreground] [--port <port>]` | Start the daemon. Runs detached by default; `--foreground` keeps it in the terminal. Without `--port` it binds 47321, falling back to the next free port. Safe to call repeatedly — it is a no-op when a daemon is already answering. |
| `daemon:kill` | Stop the running daemon, wait for it to exit, and remove its state file. |

### Session

| Command | Options | Description |
|---|---|---|
| `connect` | `--caps <json\|path>` · `--server-host` · `--server-port` · `--server-path` | Create an Appium session. `--caps` accepts an inline JSON object **or** a path to a `.json` file. |
| `delete-session` | — | Close the Appium session and clear all element references. A session with no requests for 30 minutes is closed automatically (see `APPIUM_AGENT_IDLE_TIMEOUT_MS`). |
| `session-status` | — | Report whether a session is active, with its ID and start time. |
| `device-info` | — | Screen size, orientation, platform, and current context. Use the screen size to compute gesture coordinates. |
| `context` | `--switch <name>` | List native/webview contexts (the current one is marked `*`), or switch to one. Required for hybrid apps and web views. |

### Elements

| Command | Options | Description |
|---|---|---|
| `find-element` | `--strategy <strategy>` · `--selector <value>` · `--index <n>` · `--all` | Find an element and store a reusable reference. Prints the element ID, and warns when the selector is ambiguous. `--index` picks a specific match; `--all` stores a reference for every match. |
| `wait` | `--strategy` · `--selector` · `--for <condition>` · `--timeout <ms>` | Block until an element is `displayed` (default), `existing`, `enabled`, or `gone`. Fails with `WAIT_TIMEOUT` rather than hanging. |

Supported locator strategies: `accessibility id`, `id`, `xpath`, `class name`, `-android uiautomator`, `-ios predicate string`, `-ios class chain`, `css selector`. Selectors for `xpath`, `class name`, `css selector`, and the two `-ios` strategies must fit on one line.

### Actions

| Command | Options | Description |
|---|---|---|
| `click` | `--element-id <id>` **or** `--strategy` + `--selector` · `--index <n>` | Tap an element. |
| `type` | `--text <text>` · `--element-id <id>` **or** `--strategy` + `--selector` · `--clear` | Type text, appending to what the field already holds. Pass `--clear` to replace the contents instead. |
| `get-text` | `--element-id <id>` **or** `--strategy` + `--selector` | Read an element's visible text. |
| `scroll` | `--direction <dir>` · `--percent <n>` · `--to-strategy` + `--to-selector` · `--max-swipes <n>` | Scroll `up`/`down`/`left`/`right`. With a target it swipes repeatedly until that element is genuinely on screen, or `--max-swipes` is reached. |
| `page-source` | `--raw` · `--bounds` | Print the accessibility tree (default). `--bounds` adds each element's centre point and size so you can tap by coordinate. `--raw` prints the full XML. |
| `take-screenshot` | `--output <path>` · `--base64` | Capture the device screen. Saves a PNG and prints its path; `--base64` prints raw base64 to stdout instead. |
| `video-start` | — | Start video recording of the device screen. |
| `video-stop [output]` | `--base64` | Stop video recording. Saves an MP4 and prints its path; `--base64` prints raw base64 instead. |
| `get-attribute` | `--attribute <name>` · `--element-id <id>` **or** `--strategy` + `--selector` | Get an attribute value of an element (e.g. `value`, `label`, `enabled`). |
| `get-location` | `--element-id <id>` **or** `--strategy` + `--selector` | Get the position and size (`x`, `y`, `width`, `height`) of an element. |
| `perform-action` | `<json>` | Perform a touch gesture or raw W3C actions sequence. Accepts a JSON object (`tap`, `swipe`, `long-press`) or a W3C actions array for multi-touch. |
| `install-app <appPath>` | — | Install an app on the device. Accepts a path to `.ipa`, `.apk`, or `.app`, or a URL. Relative paths are resolved against the directory the command runs in (the same applies to `appium:app` in `connect --caps`). |
| `activate-app <appId>` | — | Bring an app to the foreground without ending the session. iOS: bundle ID, Android: package name. |
| `terminate-app <appId>` | — | Terminate a running app. Prints whether the app was actually running. |

## Element references

`find-element` returns a short ID (e.g. `V1StGXR8_Z5jd`). Pass this to `--element-id` in subsequent `click` or `type` commands instead of repeating the locator.

References use **selector rehydration**: the daemon stores the strategy + selector, not the raw WebDriver element handle. Each action re-finds the element at call time, which prevents stale-element errors caused by view-hierarchy changes or RecyclerView recycling. If the element can no longer be found, a `STALE_ELEMENT` error is returned with the original selector in the message.

When a selector matches several elements, a reference is positional (`--index`, `--all`), and positions shift as a list scrolls. Such references also record the element's text. If the element at the stored index no longer carries that text, the daemon follows it to its new position when exactly one match does, and otherwise returns `STALE_ELEMENT` rather than acting on a different element.

## JSON output

Every command accepts a global `--json` flag, which replaces the human-readable text with a machine-readable JSON document. Errors are printed to stderr as JSON too, and the exit code is still non-zero:

```bash
npx appium-agent --json device-info
npx appium-agent --json find-element --strategy "accessibility id" --selector Login
```

## Daemon state

On startup the daemon writes its PID, port, and access token to `~/.appium-agent/daemon.json`, and its output to `~/.appium-agent/daemon.log`. The CLI reads the state file to find the daemon; the log is where startup failures (a busy port, a bad Node version) are reported. Concurrent `daemon:start` calls are serialised by a `daemon-start.lock` file in the same directory, so they never spawn two daemons.

State deliberately lives in your home directory rather than the package directory: an installed package may be read-only, is wiped on every reinstall, and is shared across every project on the machine.

Set `APPIUM_AGENT_HOME` to relocate it — useful for running isolated daemons side by side:

```bash
APPIUM_AGENT_HOME=/tmp/agent-a npx appium-agent daemon:start --port 47400
APPIUM_AGENT_HOME=/tmp/agent-b npx appium-agent daemon:start --port 47500
```

## Security

The daemon binds `127.0.0.1` only, and every route except `/health` requires the token recorded in the state file. The CLI sends it automatically. This keeps other local processes from driving your device, since `/actions/execute` can run arbitrary Appium commands. Anyone able to read your state file can use the daemon, so it is written readable by your user only (mode `0600`, in a `0700` directory when the daemon creates it).

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `APPIUM_AGENT_HOME` | `~/.appium-agent` | Directory for the daemon state file and log. `XDG_STATE_HOME` is honoured when this is unset. |
| `APPIUM_AGENT_PORT` | `47321` | Default TCP port. `daemon:start --port` overrides it; either way the daemon falls back to the next free port when the requested one is busy. The old name `DAEMON_PORT` is still read when this is unset. |
| `APPIUM_AGENT_TOKEN` | random | Fixes the daemon's access token instead of generating one per start. |
| `APPIUM_AGENT_IDLE_TIMEOUT_MS` | `1800000` | End the Appium session after this long without a request, releasing the device. `0` disables it. |
| `LOG_LEVEL` | `info` | Pino log level (`trace`, `debug`, `info`, `warn`, `error`, `silent`). |
| `NODE_ENV` | — | Set to `production` to disable pretty-printing. |

## HTTP API

The daemon exposes a JSON REST API on `127.0.0.1:47321`. All responses use the envelope `{ "ok": true, "data": … }` on success and `{ "ok": false, "error": { "code": "…", "message": "…" } }` on failure.

Every route except `GET /health` requires the daemon token in an `x-appium-agent-token` header.

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness check. |
| `POST` | `/session` | Start an Appium session (`StartSessionRequest` body). |
| `DELETE` | `/session` | Close the active session. |
| `GET` | `/session` | Get current session status and metadata. |
| `GET` | `/session/contexts` | List native/webview contexts and the current one. |
| `POST` | `/session/context` | Switch context (`{ name }` body). |
| `GET` | `/session/device` | Screen size, orientation, platform, current context. |
| `POST` | `/elements/find` | Find an element and store a reference. |
| `POST` | `/elements/wait` | Wait for an element condition (`{ strategy, selector, condition, timeout }` body). |
| `GET` | `/elements` | List all stored element references. |
| `GET` | `/elements/:id` | Inspect a stored element reference. |
| `POST` | `/actions/click` | Click an element. |
| `POST` | `/actions/type` | Type text into an element. |
| `POST` | `/actions/text` | Read an element's visible text. |
| `POST` | `/actions/scroll` | Scroll the screen, optionally until an element is in view. |
| `GET` | `/actions/page-source` | Get the current XML page source. |
| `GET` | `/actions/screenshot` | Capture a screenshot (returns base64-encoded PNG). |
| `POST` | `/actions/install-app` | Install an app on the device (`{ appPath }` body). |
| `POST` | `/actions/activate-app` | Bring an app to the foreground (`{ appId }` body). |
| `POST` | `/actions/terminate-app` | Terminate a running app (`{ appId }` body). |
| `POST` | `/actions/video-start` | Start screen recording. |
| `POST` | `/actions/video-stop` | Stop screen recording (returns base64-encoded MP4). |
| `POST` | `/actions/attribute` | Get an attribute value (`ElementTarget + { attribute }` body, returns `{attribute, value}`). |
| `POST` | `/actions/location` | Get element position and size (`ElementTarget` body, returns `{x, y, width, height}`). |
| `POST` | `/actions/perform` | Perform a touch gesture or raw W3C actions sequence (gesture object or actions array body). |
| `POST` | `/daemon/shutdown` | Gracefully shut down the daemon. |

### Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | The request body or CLI arguments were malformed. |
| `INVALID_SELECTOR` | 400 | The driver rejected the selector's syntax. |
| `UNAUTHORIZED` | 401 | Missing or wrong daemon token. |
| `SESSION_NOT_ACTIVE` | 409 | No session, or Appium no longer knows it; run `connect`. |
| `SESSION_ALREADY_ACTIVE` | 409 | A session is already running or starting; run `delete-session` first. |
| `ELEMENT_NOT_INTERACTABLE` | 409 | The element exists but is hidden, disabled, or covered. |
| `ELEMENT_NOT_FOUND` | 404 | The selector matched nothing. |
| `ELEMENT_REF_NOT_FOUND` | 404 | Unknown element reference; re-run `find-element`. |
| `CONTEXT_NOT_FOUND` | 404 | The requested context is not available. |
| `WAIT_TIMEOUT` | 408 | The wait condition was not met in time. |
| `STALE_ELEMENT` | 410 | The referenced element left the view hierarchy. |
| `DAEMON_NOT_RUNNING` | — | No daemon is answering; run `daemon:start`. |
| `DAEMON_TIMEOUT` | — | The daemon did not respond; check `~/.appium-agent/daemon.log`. |
| `DAEMON_START_FAILED` | — | The daemon exited or never became healthy during `daemon:start`; see the log. |
| `DAEMON_START_LOCKED` | — | Another `daemon:start` is still in progress. |

## Development

```bash
npm run lint          # oxlint
npm run format        # prettier
npm run typecheck     # tsc over src and test
npm test              # vitest
npm run test:coverage
npm run dev:daemon    # daemon in watch mode
```

The daemon is a long-lived process: after `npm run build`, restart it with
`npm run build && npx appium-agent daemon:kill && npx appium-agent daemon:start`,
or use `npm run dev:daemon`, which reloads on change.

## Project structure

```
src/
├── shared/          # Zod schemas, error classes, constants, logger, state file, start lock
├── daemon/
│   ├── routes/      # Fastify route handlers (session, elements, actions)
│   ├── server.ts    # Fastify server factory
│   ├── session-manager.ts   # WebdriverIO session lifecycle, heartbeat, idle timeout
│   ├── element-registry.ts  # Selector-rehydration element store
│   ├── webdriver-errors.ts  # W3C error names -> error codes
│   └── index.ts             # Daemon process entry point
└── cli/
    ├── commands/    # One file per CLI command
    ├── daemon-client.ts     # HTTP client (fetch-based)
    ├── parse.ts             # Shared flag validation
    └── index.ts             # Commander root

test/                # Unit tests (mirrors src/ structure)
```
