---
name: appium-agent
description: Interact with a running iOS or Android app via the appium-agent-inspector CLI daemon. Use this skill whenever the user wants to automate or inspect a mobile app — tapping elements, typing text, getting the page source, taking screenshots, finding UI elements, starting or stopping the app, activating or terminating apps, or checking session status. Trigger on phrases like "click on", "tap", "type into", "find element", "get page source", "take a screenshot", "capture screen", "screenshot", "start the app", "close the app", "activate app", "terminate app", "launch", "interact with the app", "inspect the UI", or anything that involves controlling a device screen. Also trigger proactively when the user describes a multi-step mobile UI flow to automate.
---

# Appium Agent

Control iOS and Android apps through the persistent appium-agent daemon. The daemon keeps an Appium session alive between commands, so you never restart the app mid-flow.

## How the daemon works

The daemon runs at `127.0.0.1:47321`. Always check it is running before issuing any action command. If it is not running, start it first.

All CLI commands run from the project root via:
```
npx appium-agent <command> [options]
```

Add `--json` to any command to get machine-readable output instead of prose — useful
when you need to extract a value precisely:

```bash
npx appium-agent --json device-info
```

Every command exits non-zero on failure and prints a single `Error [CODE]: message`
line, so you can branch on failure without parsing prose.

## Workflow

### 1. Ensure the daemon is running

```bash
# Check if daemon is alive
npx appium-agent daemon:start
```

`daemon:start` is a no-op if the daemon is already running — safe to call every time.

### 2. Start the app (create a session)

```bash
npx appium-agent connect --caps '<json>'
```

**iOS example:**
```bash
npx appium-agent connect --caps '{
  "platformName": "iOS",
  "appium:automationName": "XCUITest"
}'
```

**Android example:**
```bash
npx appium-agent connect --caps '{
  "platformName": "Android",
  "appium:automationName": "UiAutomator2",
  "appium:deviceName": "emulator-5554"
}'
```

Optional server flags: `--server-host`, `--server-port` (default `localhost:4723`), `--server-path`.

### 3. Get page source to discover locators

**Always fetch the page source before attempting to find or interact with any element.** Do not guess selectors.

```bash
npx appium-agent page-source
```

`page-source` outputs a compact accessibility tree (YAML). Read it to identify element roles, names, and state attributes, then use those as selectors for `find-element`.

Add `--bounds` when you intend to tap by coordinate — it annotates each element with its centre point and size, so you can go straight to `perform-action` without a `get-location` round trip:

```bash
npx appium-agent page-source --bounds
# - button "Login" [at=196,742, size=120x44]
```

The tree only contains elements that are **actually on screen**. An element you can see in `--raw` but not in the tree is off-screen — scroll to it rather than clicking it blind.

If `find-element` fails with `ELEMENT_NOT_FOUND`, fall back to the full raw XML to check for attributes not shown in the accessibility tree (e.g. `resource-id`, `xpath`-only identifiers):

```bash
npx appium-agent page-source --raw > /tmp/page.xml
```

### 4. Find elements

After inspecting the page source, find the element and save its reference ID:

```bash
npx appium-agent find-element --strategy "accessibility id" --selector "Login"
# → ID: V1StGXR8_Z5jd
```

Store the printed ID for use in follow-up actions.

If the selector is ambiguous, `find-element` says so and stores the first match:

```
Note: selector matches 23 elements; stored index 0. Use --index or --all to reach the others.
```

Use `--index <n>` for a specific match, or `--all` to store a reference for every match:

```bash
npx appium-agent find-element --strategy "class name" --selector "XCUIElementTypeCell" --all
npx appium-agent click --strategy "class name" --selector "XCUIElementTypeCell" --index 2
```

**Locator strategies:**
| Strategy | Example selector |
|---|---|
| `accessibility id` | `Login Button` |
| `id` | `com.example:id/login_btn` |
| `xpath` | `//XCUIElementTypeButton[@name="Login"]` |
| `class name` | `XCUIElementTypeButton` |
| `-ios predicate string` | `label == "Login"` |
| `-ios class chain` | `**/XCUIElementTypeButton[\`label == "Login"\`]` |
| `-android uiautomator` | `text("Login")` |

### 5. Interact with the app

**Click (tap):**
```bash
# By stored reference (preferred — faster)
npx appium-agent click --element-id V1StGXR8_Z5jd

# Or inline without a prior find-element
npx appium-agent click --strategy "accessibility id" --selector "Login"
```

**Type text:**
```bash
# Into a stored element reference
npx appium-agent type --element-id V1StGXR8_Z5jd --text "admin@example.com"

# With --clear to clear the field first
npx appium-agent type --element-id V1StGXR8_Z5jd --text "admin" --clear

# Or inline
npx appium-agent type --strategy "id" --selector "username_field" --text "admin"
```

**Get page source:**
```bash
# Accessibility tree (default — compact YAML, use this first)
npx appium-agent page-source

# Full raw XML (fallback when element not found via accessibility tree)
npx appium-agent page-source --raw > /tmp/page.xml
```

**Take a screenshot:**
```bash
# Saves a PNG and prints its path (the default — never floods stdout)
npx appium-agent take-screenshot
# → Screenshot saved to /tmp/appium-screenshot-1789068709845.png

# Choose the path yourself
npx appium-agent take-screenshot --output /tmp/screen.png

# Only if you really need the bytes inline
npx appium-agent take-screenshot --base64
```

**Get an element attribute:**
```bash
# By stored reference
npx appium-agent get-attribute --element-id V1StGXR8_Z5jd --attribute value

# Or inline
npx appium-agent get-attribute --strategy "accessibility id" --selector "switch" --attribute value
# → value: 0
```

Common attributes: `value`, `label`, `name`, `enabled`, `visible`, `accessible`, `focused`.

**Get an element's text:**
```bash
npx appium-agent get-text --strategy "accessibility id" --selector "greeting"
# → Welcome back, Alex
```

**Get element location and size:**
```bash
# By stored reference
npx appium-agent get-location --element-id V1StGXR8_Z5jd

# Or inline
npx appium-agent get-location --strategy "accessibility id" --selector "Login"
# → x: 115
# → y: 796
# → width: 58
# → height: 42
```

**Record video:**
```bash
# Start recording
npx appium-agent video-start

# Stop recording and save MP4
npx appium-agent video-stop /recordings/recording.mp4

# Stop recording; saves to a temp file and prints the path
npx appium-agent video-stop

# Print base64 to stdout instead
npx appium-agent video-stop --base64
```

**Wait for an element (use this instead of sleeping):**

After any action that triggers navigation, loading, or an animation, wait for the
next screen rather than immediately calling `page-source`:

```bash
npx appium-agent wait --strategy "accessibility id" --selector "Dashboard" --for displayed
# → "Dashboard" is displayed (after 412ms).
```

Conditions: `displayed` (default), `existing`, `enabled`, `gone`. Use `gone` to wait
for a spinner or modal to disappear. `--timeout <ms>` defaults to 10000. A wait that
never succeeds fails with `WAIT_TIMEOUT` rather than hanging.

**Scroll:**

Prefer `scroll` over hand-computed swipes — it reads the real screen size, so it works
on any device:

```bash
# One screenful in a direction
npx appium-agent scroll --direction down

# Keep scrolling until an element is genuinely on screen (the common case)
npx appium-agent scroll --direction down \
  --to-strategy "accessibility id" --to-selector "Submit" --max-swipes 10
# → Element in view after 3 swipe(s).
```

`--percent <0-0.95>` controls how far each swipe travels (default 0.6). Direction is
the direction the *content* moves: `down` reveals content below, `left` reveals the
previous page.

If the element never appears you get `Element not found after N swipe(s)` — a signal
to re-read `page-source` rather than to keep scrolling blindly.

**Get device info:**

Needed whenever you compute coordinates yourself:

```bash
npx appium-agent device-info
# → Platform: iOS 18.0
# → Device: iPhone 15
# → Screen: 393x852
# → Orientation: PORTRAIT
# → Context: NATIVE_APP
```

**Switch context (hybrid apps and web views):**

If `page-source` shows a `webview` element but almost no content inside it, the app is
hybrid and you must switch context before the web content becomes reachable:

```bash
npx appium-agent context
#   NATIVE_APP
# * WEBVIEW_1        ← the * marks the current context

npx appium-agent context --switch WEBVIEW_1
# ... interact using css selector / xpath ...
npx appium-agent context --switch NATIVE_APP
```

Remember to switch back to `NATIVE_APP` before interacting with native UI again.

**Perform touch gestures:**

`perform-action` accepts a JSON object (high-level gesture) or a raw W3C actions array.

```bash
# Tap at coordinates
npx appium-agent perform-action '{"type":"tap","x":200,"y":400}'

# Swipe (scroll up: start low, end high)
npx appium-agent perform-action '{"type":"swipe","startX":200,"startY":700,"endX":200,"endY":200,"duration":400}'

# Long press
npx appium-agent perform-action '{"type":"long-press","x":200,"y":400,"duration":1500}'
```

**Common interaction patterns:**

> For plain scrolling use the `scroll` command above — it sizes the swipe to the
> device. Reach for raw `perform-action` swipes only when you need exact
> coordinates, drag & drop, or multi-touch.

*Swipe left (next page / dismiss):*
```bash
npx appium-agent perform-action '{"type":"swipe","startX":700,"startY":400,"endX":100,"endY":400,"duration":300}'
```

*Swipe right (go back / previous page):*
```bash
npx appium-agent perform-action '{"type":"swipe","startX":100,"startY":400,"endX":700,"endY":400,"duration":300}'
```

*Drag and drop — use `get-location` to find source/target coordinates, then pass a raw W3C pointer sequence:*
```bash
# 1. Get source element location
npx appium-agent get-location --strategy "accessibility id" --selector "Item"
# → x: 50  y: 300  width: 100  height: 50
# center: x=100, y=325

# 2. Get target element location
npx appium-agent get-location --strategy "accessibility id" --selector "Drop Zone"
# → x: 50  y: 600  width: 200  height: 80
# center: x=150, y=640

# 3. Perform drag: move to source, press, pause (signals drag intent), move to target, release
npx appium-agent perform-action '[{"type":"pointer","id":"finger1","parameters":{"pointerType":"touch"},"actions":[{"type":"pointerMove","duration":0,"x":100,"y":325},{"type":"pointerDown","button":0},{"type":"pause","duration":750},{"type":"pointerMove","duration":500,"x":150,"y":640},{"type":"pointerUp","button":0}]}]'
```

*Pinch to zoom out (two fingers moving inward):*
```bash
npx appium-agent perform-action '[{"type":"pointer","id":"finger1","parameters":{"pointerType":"touch"},"actions":[{"type":"pointerMove","duration":0,"x":100,"y":300},{"type":"pointerDown","button":0},{"type":"pointerMove","duration":500,"x":200,"y":400},{"type":"pointerUp","button":0}]},{"type":"pointer","id":"finger2","parameters":{"pointerType":"touch"},"actions":[{"type":"pointerMove","duration":0,"x":300,"y":500},{"type":"pointerDown","button":0},{"type":"pointerMove","duration":500,"x":200,"y":400},{"type":"pointerUp","button":0}]}]'
```

*Spread to zoom in (two fingers moving outward):*
```bash
npx appium-agent perform-action '[{"type":"pointer","id":"finger1","parameters":{"pointerType":"touch"},"actions":[{"type":"pointerMove","duration":0,"x":200,"y":400},{"type":"pointerDown","button":0},{"type":"pointerMove","duration":500,"x":100,"y":300},{"type":"pointerUp","button":0}]},{"type":"pointer","id":"finger2","parameters":{"pointerType":"touch"},"actions":[{"type":"pointerMove","duration":0,"x":200,"y":400},{"type":"pointerDown","button":0},{"type":"pointerMove","duration":500,"x":300,"y":500},{"type":"pointerUp","button":0}]}]'
```

> **Tip — using coordinates vs `mobile:` commands:** For iOS, `mobile: scroll` and `mobile: swipe` (XCUITest gestures) are more reliable than coordinate-based swipes because they work regardless of screen size. Prefer `execute --command "mobile: scroll"` for list scrolling; use `perform-action` for drag & drop and multi-touch.

**Execute a mobile command:**
```bash
# Scroll down (no return value)
npx appium-agent execute --command "mobile: scroll" --params '{"direction":"down"}'
# → Result: null

# Scroll to an element by predicate
npx appium-agent execute --command "mobile: scroll" --params '{"predicateString":"label == \"Done\""}'

# Get device info (returns JSON object)
npx appium-agent execute --command "mobile: deviceInfo"
# → Result: {"udid":"...","name":"iPhone 15",...}

# No params needed
npx appium-agent execute --command "mobile: pressButton" --params '{"name":"home"}'
```

`--params` must be a JSON object string. Omit it entirely if the command takes no parameters.

### 6. Install, activate, or terminate an app

These commands operate on any app — they do **not** close the Appium session.

**Install an app:**
```bash
# iOS (.ipa or .app)
npx appium-agent install-app /path/to/MyApp.ipa

# Android (.apk)
npx appium-agent install-app /path/to/MyApp.apk
```

**Bring an app to the foreground:**
```bash
# iOS (bundle ID)
npx appium-agent activate-app com.example.app

# Android (package name)
npx appium-agent activate-app com.example.app
```

**Terminate a running app:**
```bash
npx appium-agent terminate-app com.example.app
# → Terminated com.example.app.      (or "com.example.app was not running.")
```

### 7. Check session state at any time

```bash
npx appium-agent session-status
# → Active session: dc3e025e-689c-49e4-bd33-80bdd57c6a9c
```

Use this when you are unsure whether a session survived — it avoids a spurious
`connect` that would fail with `SESSION_ALREADY_ACTIVE`.

### 8. Close the session

```bash
npx appium-agent delete-session
```

This closes the Appium session and clears all stored element references.

### 9. Kill the daemon (optional)

```bash
npx appium-agent daemon:kill
```

## Element references

`find-element` returns a short ID (e.g. `V1StGXR8_Z5jd`). Passing `--element-id` to `click` or `type` is preferred over repeating the locator — it skips redundant element discovery for subsequent steps in the same view.

References use **selector rehydration**: the daemon re-finds the element at action time using the stored strategy + selector (and its index, if the selector was ambiguous). If the view hierarchy has changed and the element is gone, you'll get a `STALE_ELEMENT` error with the original selector in the message. Re-run `find-element` to get a fresh reference.

References are cleared automatically when the session ends or the device stops responding, so a `STALE_ELEMENT` or `ELEMENT_REF_NOT_FOUND` after a crash means "re-discover", not "retry".

## Error handling

| Error code | Meaning | Fix |
|---|---|---|
| `DAEMON_NOT_RUNNING` | Daemon process not found | Run `daemon:start` |
| `SESSION_NOT_ACTIVE` | No app session open | Run `connect` |
| `SESSION_ALREADY_ACTIVE` | Session already open | Run `delete-session` first, or proceed |
| `ELEMENT_NOT_FOUND` | Element not in current view | Check selector / scroll to reveal |
| `STALE_ELEMENT` | Element was found before but is gone now | Re-run `find-element` |
| `VALIDATION_ERROR` | Bad input (wrong caps format, empty selector) | Fix the argument |
| `WAIT_TIMEOUT` | `wait` condition never met | Re-read `page-source`; the screen may not be what you expect |
| `CONTEXT_NOT_FOUND` | Requested webview does not exist | Run `context` to list what is available |
| `ELEMENT_REF_NOT_FOUND` | Unknown element ID | Re-run `find-element` |
| `DAEMON_TIMEOUT` | Daemon did not respond in time | Check `~/.appium-agent/daemon.log`; restart with `daemon:kill` then `daemon:start` |
| `UNAUTHORIZED` | Token mismatch (stale state file) | Run `daemon:kill` then `daemon:start` |

## Multi-step flow example

```bash
# 1. Start daemon + app
npx appium-agent daemon:start
npx appium-agent connect --caps '{"platformName":"iOS","appium:automationName":"XCUITest","appium:deviceName":"iPhone 15","appium:bundleId":"com.example.app"}'

# 2. Inspect the screen via accessibility tree
npx appium-agent page-source
# → Read the YAML to find element roles and names for selectors

# 3. Fill login form
npx appium-agent find-element --strategy "accessibility id" --selector "Username"
# → ID: ref-abc
npx appium-agent type --element-id ref-abc --text "admin" --clear

npx appium-agent find-element --strategy "accessibility id" --selector "Password"
# → ID: ref-def
npx appium-agent type --element-id ref-def --text "secret" --clear

npx appium-agent click --strategy "accessibility id" --selector "Login"

# 4. Wait for the next screen instead of guessing at a delay
npx appium-agent wait --strategy "accessibility id" --selector "Dashboard" --for displayed

# 5. Inspect it, then scroll to something below the fold
npx appium-agent page-source
npx appium-agent scroll --direction down \
  --to-strategy "accessibility id" --to-selector "Settings" --max-swipes 8
npx appium-agent click --strategy "accessibility id" --selector "Settings"

# 6. Done
npx appium-agent delete-session
```

## Working efficiently

- Read `page-source` before acting; never guess a selector.
- `wait` after anything that navigates — it is faster and far more reliable than
  re-reading `page-source` in a loop.
- `scroll --to-selector` rather than repeated blind swipes.
- `--bounds` when you plan to tap coordinates; it saves a `get-location` call.
- Reuse `--element-id` for repeated actions on the same element in one view.
- The tree already omits off-screen elements, so if something is missing, scroll —
  do not fall back to `--raw` unless you need an attribute the tree does not show.
