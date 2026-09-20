# Changelog

## [0.5.0]

### Changed

- **`page-source` summarises repeated list rows.** A run of three or more structurally identical siblings now renders the first in full, followed by one line per remaining sibling carrying only the tokens that differ from it. A 25-row Android list went from ~2,050 to ~630 tokens. `[n]` counts position _within the run_ and is not a `find-element --index`; the run header says so, and unchanged tokens are marked `=` so every value still lines up with the example above it. Pass `--no-collapse` for the literal hierarchy.
- **Anonymous, stateless containers collapse whatever their child count.** Only single-child wrappers used to be transparent, so a layout node with four children — carrying no name, id or state, and targetable by nothing — kept its line and an indent level for its whole subtree.
- **`--bounds` is terser and limited to tap targets.** Coordinates render as `@centreX,centreY WidthxHeight` rather than `at=…, size=…`, and only on nodes that are `clickable` or are leaves (which is how every iOS control renders). Annotating full-screen layout containers buried the real targets.
- **`--json` drops its indentation when stdout is not a terminal.** Pretty-printing is for a human reading a terminal; piped output goes to a program or an agent, which pays for every space. A 12-element `list-elements` payload went from ~780 to ~590 tokens. Interactive output is unchanged.
- **`find-element` prints just `ID: <id>`** plus the ambiguity note, instead of also echoing back the strategy and selector that were passed in and a timestamp nothing acts on. `--json` still carries the full record.
- **The bundled Claude skill is split into a core file and on-demand reference pages.** `SKILL.md` went from ~5,730 to ~2,810 tokens by moving gestures and coordinates, `mobile:` commands, screenshots and video, web-view contexts, app install/activate/terminate, and the full error-code table into `references/`, which agents read only when the task calls for them. The core keeps everything needed to make a correct first call. `install --skill` now copies the whole skill directory — a file-only copy would install dead links. Re-run `appium-agent install --skill --force` to update an installed copy.
- The skill no longer recommends `find-element` before a one-off `click` or `type`: passing the locator inline does the same work in one round trip. References still pay off when the same element is acted on more than once.
- Published-package contents come from a `files` allowlist in `package.json` rather than `.npmignore`, `build` cleans `dist` first, and `prepublishOnly` rebuilds from clean.
- CI runs `test:coverage` instead of `test`, and `vitest.config.ts` enforces coverage thresholds set just under the current numbers — a floor against regressions, not a target.

### Added

- **`list-elements`** — list the element references the daemon is holding, or inspect one with `--id`, without re-running `find-element`.
- **`page-source --no-collapse`** — list every repeated sibling in full, for when the literal hierarchy matters.

### Fixed

- **The daemon token was compared with `!==`**, which returns as soon as two bytes differ and leaks the token's contents through timing. Comparison is now `timingSafeEqual`, with lengths checked first (a token's length is not a secret).

## [0.4.0]

### Fixed

- **`-ios predicate string` and `-ios class chain` never worked.** Both were sent as `ios=…`, which webdriverio routes to the long-removed `-ios uiautomation` strategy. `class name` selectors outside `XCUIElementType*` / `android.widget.*` / `android.view.*` (e.g. `androidx…`) were sent as CSS selectors. These strategies now use webdriverio's explicit `<strategy>:<selector>` form, verified by a contract test against a real webdriverio client.
- **`type` without `--clear` still cleared the field**, because webdriverio's `setValue` always clears first. Text is now appended unless `--clear` is given.
- **Negative lookups no longer block for the implicit wait while polling.** `scroll --to-selector` waited 5s per swipe for an absent element, so a long scroll outlived the CLI's timeout while the daemon kept swiping; `wait` could time out before its first poll returned. Both now poll with the implicit wait at zero, and the CLI scales the scroll timeout with `--max-swipes`.
- **Two concurrent `connect` calls opened two Appium sessions**, leaking one on the server. A second call during startup now fails with `SESSION_ALREADY_ACTIVE`. A session whose timeouts cannot be configured is deleted rather than leaked.
- **Heartbeats no longer pile up behind a long command** (an install, a video stop) and discard a healthy session.
- **Relative app paths** passed to `install-app` or as `appium:app` were resolved by the Appium server against its own working directory. They are now resolved where the command runs.
- **The state file holding the daemon token was world-readable.** It is now written `0600`, in a `0700` directory.
- **`POST /daemon/shutdown` exited without closing the server or removing the state file.** It now runs the same shutdown sequence as a signal. Shutdown is bounded at 8s, so an unresponsive device cannot keep the daemon alive, and a second Ctrl+C exits immediately.
- **Concurrent `daemon:start` calls could orphan a daemon.** Starts are now serialised by a lock file, only the daemon just spawned counts as started, and a daemon that exits during startup fails at once (`DAEMON_START_FAILED`) instead of after 15s.
- **Positional element references silently retargeted** when a list shifted. References from an ambiguous selector record the element's text; rehydration follows the element to its new index or reports `STALE_ELEMENT`.
- Capabilities were matched case-sensitively and limited to three automation names; `"ios"`, `"UIAutomator2"`, and third-party drivers are now accepted.
- An invalid `DAEMON_PORT` became `NaN`; malformed numeric environment variables now fall back to their default with a warning.

### Added

- **Session idle timeout** — a session with no requests for 30 minutes is ended, releasing the device. Configure with `APPIUM_AGENT_IDLE_TIMEOUT_MS` (`0` disables).
- WebDriver errors map to stable codes (`ELEMENT_NOT_FOUND`, `STALE_ELEMENT`, `INVALID_SELECTOR`, `ELEMENT_NOT_INTERACTABLE`) instead of `INTERNAL_ERROR`. An `invalid session id` error discards the dead session and reports `SESSION_NOT_ACTIVE`.
- `APPIUM_AGENT_PORT` environment variable; `DAEMON_PORT` is still read as a fallback.
- Release workflow checks that the tag matches `package.json`, and runs the format and package-size checks. Dependabot for npm and GitHub Actions.

### Changed

- **Node.js 22.12+ is required** (`commander` 15 and `nanoid` 6 already needed it). `engines` is now declared, and CI tests Node 22, 24, and 26.
- The bundled Claude skill documents the new `type` append semantics, `css selector`, single-line selector rule, positional reference tracking, session idle timeout, and new error codes. Re-run `appium-agent install --skill` to update an installed copy.
- CLI numeric flags validate their upper bounds locally (`--port`, `--server-port`, `--timeout`, `--max-swipes`), with flag and choice validation shared in `src/cli/parse.ts`.
- Removed the unused `src/config/capabilities.ts` helpers and the `appium`, `appium-xcuitest-driver`, and `appium-uiautomator2-driver` devDependencies (215 MB); install Appium and its drivers separately.

## [0.3.0] — 2026-09-10

### Added

- **`wait`** — block until an element is `displayed`, `existing`, `enabled`, or `gone`, with an explicit `--timeout`. Fails with `WAIT_TIMEOUT` instead of hanging.
- **`scroll`** — scroll `up`/`down`/`left`/`right` sized to the real screen, optionally swiping repeatedly until a target element is genuinely on screen (`--to-strategy` / `--to-selector` / `--max-swipes`).
- **`context`** — list native/webview contexts and switch between them, making hybrid apps and web views reachable.
- **`device-info`** — screen size, orientation, platform, and current context, so gesture coordinates can be computed for any device.
- **`get-text`** — read an element's visible text.
- **`session-status`** — report whether a session is active without attempting to create one.
- **`find-element --index` / `--all`** — reach matches beyond the first when a selector is ambiguous. `find-element` now reports the total match count and warns when a selector is ambiguous.
- **`page-source --bounds`** — annotate each element with its centre point and size, so a coordinate tap needs no `get-location` round trip.
- **Global `--json` flag** — machine-readable output on every command, including errors.
- **`daemon:start --port`** — bind a specific port; without it the daemon falls back to the next free port when 47321 is busy instead of failing.
- **Daemon access token** — every route except `/health` now requires the token recorded in the state file, so other local processes cannot drive the device through `/actions/execute`. The CLI sends it automatically.
- `APPIUM_AGENT_HOME` environment variable to relocate daemon state, allowing isolated daemons side by side.
- Lint (`oxlint`) and formatting (`prettier`) with `lint` / `format` / `format:check` scripts, wired into CI along with a Node 20/22/24 matrix and a published-package size guard.
- `test:coverage` script; test sources are now type-checked alongside `src`.

### Fixed

- **Accessibility tree dropped elements whose text contained `>`.** The tag scanner is now quote-aware, so an unescaped `>` inside an attribute value no longer truncates the tag and silently discards the element and its subtree.
- **XML entities are decoded.** `text="5 &gt; 3 &amp; rising"` renders as `5 > 3 & rising` rather than raw entities. Numeric and hex character references are handled too.
- **Android hidden elements are filtered.** The tree honoured only iOS's `visible="false"`; UiAutomator2's `displayed="false"` nodes leaked into the output.
- **Daemon state no longer lives inside the installed package.** It moved to `~/.appium-agent/` (honouring `XDG_STATE_HOME`), which is not read-only on global installs, is not wiped on reinstall, and is not shared across unrelated projects.
- **Detached daemon output is captured** to `~/.appium-agent/daemon.log` instead of `/dev/null`, so startup failures are diagnosable. The failure message now names the log path.
- **Daemon liveness is confirmed by a health check**, not just by PID. A recycled PID no longer makes `daemon:start` report "already running" and every later command fail.
- **A shutting-down daemon no longer deletes its replacement's state file**, which could orphan a running daemon that no command could find or stop.
- **A live daemon that misses one health probe is no longer orphaned** — the state file is only cleared when the recorded process is genuinely gone.
- **`daemon:kill` waits for the process to exit** before returning, so an immediate `daemon:start` cannot race the old daemon's cleanup.
- **CLI requests time out** instead of hanging forever when the daemon wedges, reporting `DAEMON_TIMEOUT` with the log path.
- **`--caps` accepts a file path**, as its help text and the README had always claimed; previously only inline JSON parsed.
- **An unresponsive session is torn down** after three failed heartbeats, so the next command fails with a clean `SESSION_NOT_ACTIVE` rather than a raw WebDriver error. Element references are flushed with it.
- **`scroll --to-selector` checks real visibility**, not mere presence in the hierarchy: an element below the fold exists but is not on screen, and wdio's `isDisplayed` does not consult the native visibility attribute.
- `--version` reported a hardcoded `0.2.0`; it now reads the real package version.
- `install-app` returned validation errors in a different shape from every other route.
- `AppiumAgentError` responses returned 500 when raised outside a route's own catch block; status codes now live on the error classes and are applied in one place.
- `--index ""` was silently treated as `0`.
- Fixed a long-broken relative import in the element-registry test, surfaced by type-checking tests.

### Changed

- **`take-screenshot` and `video-stop` now save a file and print its path by default.** Printing megabytes of base64 to stdout floods an agent's context; pass `--base64` for the old behaviour.
- Route handlers no longer carry per-route validation and error-mapping blocks (`action.routes.ts` went from 438 to 269 lines, while gaining two new routes); a single error handler maps every error via its own status code.
- CLI element-targeting options (`--element-id` / `--strategy` / `--selector` / `--index`) come from one shared helper, so every command validates them identically and reports the same message.
- CLI validation failures raise structured errors instead of calling `process.exit` mid-action, giving consistent `Error [CODE]: message` output and JSON support.
- Removed unused `dotenv` and `@fastify/sensible` dependencies.
- Fastify's deprecated `disableRequestLogging` option replaced with `logController`, silencing FSTDEP023 warnings.
- Daemon state persistence moved from `src/daemon/pid-file.ts` to `src/shared/state-file.ts`; the CLI no longer imports from the daemon package.
- `npm publish` now runs with `--provenance`.
- Added `license`, `engines`, `homepage`, and `bugs` metadata to `package.json`.
- Test suite grew from 241 to 379 tests.

## [0.2.0] — 2026-04-21

### Added

- **`install --skill`** — installs the bundled Claude skill (`SKILL.md`) into `.claude/skills/appium-agent/` in the current project directory, enabling AI agents to discover and use `appium-agent` commands automatically.

## [0.1.0] — 2026-04-18

### Added

- **`daemon:start` / `daemon:kill`** — persistent background daemon with PID-file management. `daemon:kill` terminates by SIGTERM and cleans up state, replacing the earlier HTTP-based `daemon:stop`.
- **`connect`** — start an Appium session using capabilities from environment / config.
- **`delete-session`** — end the Appium session (renamed from `close-app`).
- **`find-element <selector>`** — locate a UI element and return a short reference ID for use in subsequent commands.
- **`click <elementId>`** — tap an element by reference ID.
- **`type <elementId> <text>`** — send keyboard input to an element.
- **`page-source`** — fetch page source and render it as a human-readable YAML accessibility tree.
- **`take-screenshot`** — capture the device screen as a PNG. Use `--output <path>` to save to a file, or omit to print raw base64 to stdout.
- **`activate-app <appId>`** — bring an app to the foreground by bundle ID / package name without ending the session.
- **`terminate-app <appId>`** — stop a running app; prints whether it was active.
- **`install-app <path>`** — install an `.apk` or `.ipa` onto the device.
- **`get-attribute <elementId> <attribute>`** — read a named attribute from an element.
- **`get-location <elementId>`** — return the x/y coordinates and size of an element on screen.
- **`perform-action <action> [params]`** — execute an arbitrary mobile action (e.g. `mobile: scroll`).
- **`video-start` / `video-stop`** — start and stop screen recording; `video-stop` saves the result to a file.
- **`execute <script> [args]`** — run a mobile execute command with JSON parameter support.
- Selector-rehydration element registry — elements are re-located at action time using their original selector, so references survive UI refreshes.
- JSON REST API on `127.0.0.1:47321`.
- Android support via `appium-uiautomator2-driver`.
