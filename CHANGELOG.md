# Changelog

## [0.6.0]

### Added

- **`connect` starts the daemon** when none is running, so a flow no longer begins with `daemon:start` (which still works, and is still a no-op when one is up).
- **`--source` on `click`, `type`, `wait`, `scroll`, `perform-action` and `activate-app`** prints the resulting screen in the same call, saving a `page-source` round trip.
- **`page-source --diff`** prints only the lines that changed since the last read, each under its nearest unchanged parent, or the full tree when most of the screen changed or the previous read used different options. The last screen is kept in `~/.appium-agent/last-screen.json`.
- **`APPIUM_AGENT_IMPLICIT_WAIT_MS`** sets how long a lookup retries for a missing element.

### Fixed

- **`type` replaced the text on Android instead of appending.** UiAutomator2's send-keys is Android's `setText`. The daemon now reads the field and sends the existing text plus the new, treating a field that shows its hint as empty. A password field cannot be read back, so typing into one still replaces it.
- **Scrolling to an element, and checking a stale reference, cost ~5 s per miss.** In webdriverio 10 a find-elements result is a proxy: reading past its end polls the device for up to `waitforTimeout` and returns a "not found" element instead of `undefined`. Every lookup now copies the result first. On Android, scroll-to-element went from ~9 s to ~2 s per swipe, and a reference to a gone element is `STALE_ELEMENT` at once rather than a fake element 5 s later.
- **The visibility check asked Android for the iOS-only `visible` attribute** first, an error that costs ~1.6 s on UiAutomator2 every check.
- **A session Appium refused was a 500.** It is now `SESSION_START_FAILED` (502) carrying Appium's reason.
- **Controls under an iOS popover vanished from `page-source`.** iOS can report every control as invisible while they are plainly on screen (the Contacts delete confirmation); the tree showed only a dismiss region. When no control at all is reported visible, the tree now shows the elements whose frames are on screen, and says so on its first line.
- **`scroll` did nothing while the keyboard was up.** Its swipe, centred on the screen, started on the keyboard. With a keyboard up it now swipes in the band between the top bars (the top fifth, where a swipe would drag a sheet or navigation bar) and the keyboard's top edge — exact on iOS, an assumed lower 40% on Android.
- **A selector that the action itself invalidated gave a 500.** webdriverio re-finds an element by its selector when it re-renders mid-command; with `type --clear` on a `value == "…"` selector that re-find fails once the field is cleared. This is now `STALE_ELEMENT` with a hint to use a selector the action does not change.
- **Rows inside a container reported as hidden were never collapsed** (Reminders' list is `visible="false"` on iOS 27), so a long list printed in full.
- **Driver refusals were 500 `INTERNAL_ERROR`s.** Errors the driver raises for a command it cannot run (a missing ffmpeg, an unsupported command) are now `DRIVER_ERROR` (502) carrying the driver's own message, and are logged as warnings rather than "Unhandled error".
- **The daemon log mixed plain-text lines into its JSON.** webdriverio's own logger is now silenced; the daemon already logs every failure itself.

- **Ambiguous selectors failed under webdriverio 10.** Its `$()` became strict and throws when a selector matches more than one element, which broke `click`, `type`, `get-text`, `wait` and `scroll --to-*` on any list. Sessions now opt out (`strictSelectors: false`), so the first match is used and `--index` reaches the rest, as before.
- **`page-source` could render a blank screen.** A node reported as hidden took its whole subtree with it, and XCUITest marks some full-screen containers `visible="false"` while everything inside them is visible — iOS 27 Settings rendered as just `- application "Settings"`. Hidden nodes now drop only themselves; each descendant is judged on its own visibility.
- **A CLI newer than the running daemon got `Error [undefined]: undefined`.** Unknown routes now answer `ROUTE_NOT_FOUND` with a restart hint, and the CLI reports any reply outside the `{ ok, … }` envelope as `UNEXPECTED_RESPONSE` instead of crashing on it.
- **Malformed or oversized request bodies returned 500 `INTERNAL_ERROR`.** Bad JSON is now a 400 `VALIDATION_ERROR`, and Fastify's other 4xx errors keep their status as `BAD_REQUEST`.
- **Positional references to textless rows could act on the wrong element.** Icons and other rows without text all shared an empty fingerprint, so any of them passed for the stored one. They are now fingerprinted by on-screen rect, and a mismatch is reported as `STALE_ELEMENT`.

### Changed

- **The iOS keyboard is one line in `page-source`** — `keyboard [N keys]`, plus any Return/Search/Go/Done key — instead of a line per key (33 of 45 lines on the Contacts form). `--no-collapse` lists every key.
- **Captions that repeat their row are dropped through wrappers.** A text leaf repeating its nearest named ancestor's name, label or value is dropped even with anonymous containers in between (`statictext "John Appleseed"` under `cell "John Appleseed"`).
- **`page-source --diff` prints the full path of unchanged ancestors** above each change, outermost first.
- **The implicit wait drops from 5 s to 2 s.** A lookup for a missing element now fails after 2 s instead of 5. Agents read the screen and `wait` for anything that loads, so a miss is usually a wrong selector; set `APPIUM_AGENT_IMPLICIT_WAIT_MS` to restore the old value.
- **The skill calls `appium-agent` directly** instead of through `npx` (about 0.3 s per command), drops the `daemon:start` step, and has a much shorter description. It also documents the ~10 s iOS context listing and the capabilities that shorten it.
- **Output no longer echoes what the caller sent.** Under `--json`: `click` and `type` drop `target`/`text`; `find-element` returns `{ elementId, index, matchCount }` (and `--all` elements as `{ elementId, index }`); `activate-app`, `terminate-app` and `install-app` drop the app id/path; `wait` returns `{ waitedMs }`; `scroll` drops `direction`; `get-attribute` drops `attribute`; `list-elements` drops `count`. `capturedAt`/`stoppedAt` timestamps are gone from `page-source`, `take-screenshot` and `video-stop`. `connect` and `session-status` no longer include the capabilities Appium echoes back, often kilobytes; `device-info` reports the useful parts.
- **Terser human output.** `get-attribute` prints just the value, `wait` prints `OK after Nms.`, `get-location` prints `@centreX,centreY WxH` like `page-source --bounds`, and `session-status` fits on one line.
- **Element references carry less.** `sessionId` and `foundAt` are gone (the registry is cleared whenever a session ends), and the internal fingerprint is no longer shown by `list-elements`.
- **`page-source` is about 18% smaller.** The run header is shorter; a text or image line that only repeats its parent's name or label is dropped (its parent takes over the `--bounds` coordinates, which are the better tap target); consecutive identical single-line siblings print once with `×n`. `--no-collapse` still prints every line.
- **Every element action makes one device lookup instead of two or three.** A locator now resolves with a single find-elements call; `$()` plus wdio's `isExisting()` re-queried the device.
- **The bundled skill is about half the size** (~1,300 tokens, from ~2,500) with the same instructions. Re-run `appium-agent install --skill --force` to update an installed copy.
- `find-element` makes one device lookup instead of two, getting existence, match count and the indexed match from a single find-elements call.
- **Finding the same element again returns the reference already held for it** (same strategy, selector and index) rather than adding another, so `list-elements` stays bounded over long runs.
- Element IDs are 16 characters instead of 21.
- `--json` errors on stderr are compact when stderr is not a terminal, matching stdout.
- The daemon log is plain JSON lines; pipe it through `npx pino-pretty` to read it. `NODE_ENV` no longer affects logging.
- Upgraded to webdriverio 10. Dropped the `nanoid` and `pino-pretty` dependencies.

## [0.5.1]

### Fixed

- **`connect` could not reach an HTTPS Appium server.** The protocol was never passed to webdriverio, which dials plain `http` by default, so cloud grids and TLS-fronted Appium servers were unreachable. A URL passed to `--server-host` (`https://…`) was sent as a bare hostname and failed with a DNS error; it is now rejected before connecting, with a pointer to `--server-protocol`.

### Added

- **`connect --server-protocol <http|https>`** (default `http`). When `--server-port` is omitted it now defaults to match the protocol: `4723` for `http`, `443` for `https`. Existing invocations are unchanged.

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
