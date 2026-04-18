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
node dist/cli/index.js <command> [options]
```

If `dist/` does not exist yet, build first:
```bash
npm run build
```

## Workflow

### 1. Ensure the daemon is running

```bash
# Check if daemon is alive
node dist/cli/index.js daemon:start
```

`daemon:start` is a no-op if the daemon is already running — safe to call every time.

### 2. Start the app (create a session)

```bash
node dist/cli/index.js connect --caps '<json>'
```

**iOS example:**
```bash
node dist/cli/index.js connect --caps '{
  "platformName": "iOS",
  "appium:automationName": "XCUITest"
}'
```

**Android example:**
```bash
node dist/cli/index.js connect --caps '{
  "platformName": "Android",
  "appium:automationName": "UiAutomator2",
  "appium:deviceName": "emulator-5554"
}'
```

Optional server flags: `--server-host`, `--server-port` (default `localhost:4723`), `--server-path`.

### 3. Get page source to discover locators

**Always fetch the page source before attempting to find or interact with any element.** Do not guess selectors.

```bash
node dist/cli/index.js page-source
```

`page-source` outputs a compact accessibility tree (YAML). Read it to identify element roles, names, and state attributes, then use those as selectors for `find-element`.

If `find-element` fails with `ELEMENT_NOT_FOUND`, fall back to the full raw XML to check for attributes not shown in the accessibility tree (e.g. `resource-id`, `xpath`-only identifiers):

```bash
node dist/cli/index.js page-source --raw > /tmp/page.xml
```

### 4. Find elements

After inspecting the page source, find the element and save its reference ID:

```bash
node dist/cli/index.js find-element --strategy "accessibility id" --selector "Login"
# → ID: V1StGXR8_Z5jd
```

Store the printed ID for use in follow-up actions.

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
node dist/cli/index.js click --element-id V1StGXR8_Z5jd

# Or inline without a prior find-element
node dist/cli/index.js click --strategy "accessibility id" --selector "Login"
```

**Type text:**
```bash
# Into a stored element reference
node dist/cli/index.js type --element-id V1StGXR8_Z5jd --text "admin@example.com"

# With --clear to clear the field first
node dist/cli/index.js type --element-id V1StGXR8_Z5jd --text "admin" --clear

# Or inline
node dist/cli/index.js type --strategy "id" --selector "username_field" --text "admin"
```

**Get page source:**
```bash
# Accessibility tree (default — compact YAML, use this first)
node dist/cli/index.js page-source

# Full raw XML (fallback when element not found via accessibility tree)
node dist/cli/index.js page-source --raw > /tmp/page.xml
```

**Take a screenshot:**
```bash
# Save PNG to a file (preferred for agents — avoids large base64 in stdout)
node dist/cli/index.js take-screenshot --output /tmp/screen.png

# Print raw base64 to stdout (useful for piping)
node dist/cli/index.js take-screenshot
```

**Get element location and size:**
```bash
# By stored reference
node dist/cli/index.js get-location --element-id V1StGXR8_Z5jd

# Or inline
node dist/cli/index.js get-location --strategy "accessibility id" --selector "Login"
# → x:      115
# → y:      796
# → width:  58
# → height: 42
```

**Record video:**
```bash
# Start recording
node dist/cli/index.js video-start

# Stop recording and save MP4
node dist/cli/index.js video-stop /recordings/recording.mp4

# Stop recording and print base64 to stdout
node dist/cli/index.js video-stop
```

**Perform touch gestures:**

`perform-action` accepts a JSON object (high-level gesture) or a raw W3C actions array.

```bash
# Tap at coordinates
node dist/cli/index.js perform-action '{"type":"tap","x":200,"y":400}'

# Swipe (scroll up: start low, end high)
node dist/cli/index.js perform-action '{"type":"swipe","startX":200,"startY":700,"endX":200,"endY":200,"duration":400}'

# Long press
node dist/cli/index.js perform-action '{"type":"long-press","x":200,"y":400,"duration":1500}'
```

**Common interaction patterns:**

*Scroll down (finger moves up):*
```bash
node dist/cli/index.js perform-action '{"type":"swipe","startX":200,"startY":300,"endX":200,"endY":800,"duration":400}'
```

*Scroll up (finger moves down):*
```bash
node dist/cli/index.js perform-action '{"type":"swipe","startX":200,"startY":700,"endX":200,"endY":200,"duration":400}'
```

*Swipe left (next page / dismiss):*
```bash
node dist/cli/index.js perform-action '{"type":"swipe","startX":700,"startY":400,"endX":100,"endY":400,"duration":300}'
```

*Swipe right (go back / previous page):*
```bash
node dist/cli/index.js perform-action '{"type":"swipe","startX":100,"startY":400,"endX":700,"endY":400,"duration":300}'
```

*Drag and drop — use `get-location` to find source/target coordinates, then pass a raw W3C pointer sequence:*
```bash
# 1. Get source element location
node dist/cli/index.js get-location --strategy "accessibility id" --selector "Item"
# → x: 50  y: 300  width: 100  height: 50
# center: x=100, y=325

# 2. Get target element location
node dist/cli/index.js get-location --strategy "accessibility id" --selector "Drop Zone"
# → x: 50  y: 600  width: 200  height: 80
# center: x=150, y=640

# 3. Perform drag: move to source, press, pause (signals drag intent), move to target, release
node dist/cli/index.js perform-action '[{"type":"pointer","id":"finger1","parameters":{"pointerType":"touch"},"actions":[{"type":"pointerMove","duration":0,"x":100,"y":325},{"type":"pointerDown","button":0},{"type":"pause","duration":750},{"type":"pointerMove","duration":500,"x":150,"y":640},{"type":"pointerUp","button":0}]}]'
```

*Pinch to zoom out (two fingers moving inward):*
```bash
node dist/cli/index.js perform-action '[{"type":"pointer","id":"finger1","parameters":{"pointerType":"touch"},"actions":[{"type":"pointerMove","duration":0,"x":100,"y":300},{"type":"pointerDown","button":0},{"type":"pointerMove","duration":500,"x":200,"y":400},{"type":"pointerUp","button":0}]},{"type":"pointer","id":"finger2","parameters":{"pointerType":"touch"},"actions":[{"type":"pointerMove","duration":0,"x":300,"y":500},{"type":"pointerDown","button":0},{"type":"pointerMove","duration":500,"x":200,"y":400},{"type":"pointerUp","button":0}]}]'
```

*Spread to zoom in (two fingers moving outward):*
```bash
node dist/cli/index.js perform-action '[{"type":"pointer","id":"finger1","parameters":{"pointerType":"touch"},"actions":[{"type":"pointerMove","duration":0,"x":200,"y":400},{"type":"pointerDown","button":0},{"type":"pointerMove","duration":500,"x":100,"y":300},{"type":"pointerUp","button":0}]},{"type":"pointer","id":"finger2","parameters":{"pointerType":"touch"},"actions":[{"type":"pointerMove","duration":0,"x":200,"y":400},{"type":"pointerDown","button":0},{"type":"pointerMove","duration":500,"x":300,"y":500},{"type":"pointerUp","button":0}]}]'
```

> **Tip — using coordinates vs `mobile:` commands:** For iOS, `mobile: scroll` and `mobile: swipe` (XCUITest gestures) are more reliable than coordinate-based swipes because they work regardless of screen size. Prefer `execute --command "mobile: scroll"` for list scrolling; use `perform-action` for drag & drop and multi-touch.

**Execute a mobile command:**
```bash
# Scroll down (no return value)
node dist/cli/index.js execute --command "mobile: scroll" --params '{"direction":"down"}'
# → Result: null

# Scroll to an element by predicate
node dist/cli/index.js execute --command "mobile: scroll" --params '{"predicateString":"label == \"Done\""}'

# Get device info (returns JSON object)
node dist/cli/index.js execute --command "mobile: deviceInfo"
# → Result: {"udid":"...","name":"iPhone 15",...}

# No params needed
node dist/cli/index.js execute --command "mobile: pressButton" --params '{"name":"home"}'
```

`--params` must be a JSON object string. Omit it entirely if the command takes no parameters.

### 6. Activate or terminate an app

These commands operate on any app by its identifier — they do **not** close the Appium session.

**Bring an app to the foreground:**
```bash
# iOS (bundle ID)
node dist/cli/index.js activate-app com.example.app

# Android (package name)
node dist/cli/index.js activate-app com.example.app
```

**Terminate a running app:**
```bash
node dist/cli/index.js terminate-app com.example.app
# → "App terminated: com.example.app"  (or "App was not running: ..." if already stopped)
```

### 7. Close the app and end the session

```bash
node dist/cli/index.js close-app
```

This deletes the Appium session and clears all stored element references.

### 8. Kill the daemon (optional)

```bash
node dist/cli/index.js daemon:kill
```

## Element references

`find-element` returns a short ID (e.g. `V1StGXR8_Z5jd`). Passing `--element-id` to `click` or `type` is preferred over repeating the locator — it skips redundant element discovery for subsequent steps in the same view.

References use **selector rehydration**: the daemon re-finds the element at action time using the stored strategy + selector. If the view hierarchy has changed and the element is gone, you'll get a `STALE_ELEMENT` error with the original selector in the message. Re-run `find-element` to get a fresh reference.

## Error handling

| Error code | Meaning | Fix |
|---|---|---|
| `DAEMON_NOT_RUNNING` | Daemon process not found | Run `daemon:start` |
| `SESSION_NOT_ACTIVE` | No app session open | Run `connect` |
| `SESSION_ALREADY_ACTIVE` | Session already open | Run `close-app` first, or proceed |
| `ELEMENT_NOT_FOUND` | Element not in current view | Check selector / scroll to reveal |
| `STALE_ELEMENT` | Element was found before but is gone now | Re-run `find-element` |
| `VALIDATION_ERROR` | Bad input (wrong caps format, empty selector) | Fix the argument |

## Multi-step flow example

```bash
# 1. Start daemon + app
node dist/cli/index.js daemon:start
node dist/cli/index.js connect --caps '{"platformName":"iOS","appium:automationName":"XCUITest","appium:deviceName":"iPhone 15","appium:bundleId":"com.example.app"}'

# 2. Inspect the screen via accessibility tree
node dist/cli/index.js page-source
# → Read the YAML to find element roles and names for selectors

# 3. Fill login form
node dist/cli/index.js find-element --strategy "accessibility id" --selector "Username"
# → ID: ref-abc
node dist/cli/index.js type --element-id ref-abc --text "admin" --clear

node dist/cli/index.js find-element --strategy "accessibility id" --selector "Password"
# → ID: ref-def
node dist/cli/index.js type --element-id ref-def --text "secret" --clear

node dist/cli/index.js click --strategy "accessibility id" --selector "Login"

# 4. Inspect the next screen
node dist/cli/index.js page-source

# 5. Done
node dist/cli/index.js close-app
```
