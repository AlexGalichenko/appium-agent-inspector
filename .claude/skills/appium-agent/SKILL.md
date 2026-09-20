---
name: appium-agent
description: Interact with a running iOS or Android app via the appium-agent-inspector CLI daemon. Use this skill whenever the user wants to automate or inspect a mobile app — tapping elements, typing text, getting the page source, taking screenshots, finding UI elements, starting or stopping the app, activating or terminating apps, or checking session status. Trigger on phrases like "click on", "tap", "type into", "find element", "get page source", "take a screenshot", "capture screen", "screenshot", "start the app", "close the app", "activate app", "terminate app", "launch", "interact with the app", "inspect the UI", or anything that involves controlling a device screen. Also trigger proactively when the user describes a multi-step mobile UI flow to automate.
---

# Appium Agent

Control iOS and Android apps through the persistent appium-agent daemon. The daemon
keeps an Appium session alive between commands, so you never restart the app mid-flow.

All commands run as `npx appium-agent <command> [options]`. Every command exits
non-zero on failure and prints a single `Error [CODE]: message` line. Add `--json`
for machine-readable output — except on `page-source`, where the plain form is both
smaller and easier to read.

## Reference pages

Read these only when the task calls for them:

| Page | Covers |
|---|---|
| `references/gestures.md` | `perform-action`, `get-location`, drag & drop, pinch/spread, raw coordinates |
| `references/mobile-commands.md` | `execute` and driver-native `mobile:` commands |
| `references/media.md` | `take-screenshot`, `video-start`, `video-stop` |
| `references/webviews.md` | `context`, hybrid apps, web views |
| `references/app-lifecycle.md` | `install-app`, `activate-app`, `terminate-app` |
| `references/errors.md` | Every error code, and why sessions and element references go stale |

## 1. Start the daemon

```bash
npx appium-agent daemon:start
```

A no-op if the daemon is already running — safe to call every time, even from
several commands at once. `npx appium-agent daemon:kill` stops it.

## 2. Create a session

```bash
npx appium-agent connect --caps '{
  "platformName": "iOS",
  "appium:automationName": "XCUITest",
  "appium:deviceName": "iPhone 15",
  "appium:bundleId": "com.example.app"
}'
```

Optional server flags: `--server-host`, `--server-port` (default `localhost:4723`),
`--server-path`. A relative `appium:app` path resolves against the current directory.

Run `connect` once and wait for it — creating a session can take a minute. A second
`connect` while the first is starting fails with `SESSION_ALREADY_ACTIVE`.

## 3. Read the screen

**Always read the page source before finding or interacting with any element. Do not
guess selectors.**

```bash
npx appium-agent page-source
```

This prints a compact accessibility tree. Only elements **actually on screen** appear
— if something you expect is missing, scroll to it rather than clicking blind.

```
- linearlayout [id="toolbar"]:
  - imagebutton "Navigate up" [clickable]
  - textview "Shop" [id="toolbar_title"]
- recyclerview [scrollable, id="list"]:
  - framelayout [clickable, id="row"]:
    - textview "Item 0" [id="title"]
    - button "Add" [clickable, id="add"]
  # +24 same-shape siblings; [n] is the sibling position, tokens align with the example above, "=" means unchanged:
  - [1] = "Item 1" = =
  - [2] = "Item 2" = =
```

Repeated list rows are summarised: the first row is shown in full, and each later row
becomes one line holding only what differs from it, position by position. A `[n]` is
that row's position **within the run** — it is not a `find-element --index`, which
counts matches of one selector across the whole screen. Pass `--no-collapse` to list
every row in full.

Useful flags:

- `--bounds` annotates tap targets with `@centreX,centreY WidthxHeight`, so you can go
  straight to a coordinate tap without a `get-location` round trip.
- `--raw` prints the full XML. Only reach for it when a selector you need is missing
  from the tree (an `xpath`-only attribute, say) — it is several times larger, so
  redirect it: `npx appium-agent page-source --raw > /tmp/page.xml`.

## 4. Find elements

```bash
npx appium-agent find-element --strategy "accessibility id" --selector "Login"
# → ID: V1StGXR8_Z5jd
```

If the selector is ambiguous it stores the first match and says so:

```
Note: selector matches 23 elements; stored index 0. Use --index or --all to reach the others.
```

Use `--index <n>` for a specific match, or `--all` to store a reference for every match.

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
| `css selector` | `button.primary` (web views only) |

Selectors for `xpath`, `class name`, `css selector`, `-ios predicate string` and
`-ios class chain` must be on a single line; a line break fails with `VALIDATION_ERROR`.

## 5. Act

**Click:**
```bash
npx appium-agent click --strategy "accessibility id" --selector "Login"
npx appium-agent click --element-id V1StGXR8_Z5jd
```

Pass the locator inline for a one-off action. `find-element` first only pays off when
you will act on the same element again in the same view — otherwise it is an extra
round trip for the same result.

**Type:** `type` **appends** to whatever the field holds. Pass `--clear` to replace it,
and do so for any field that may be pre-filled.

```bash
npx appium-agent type --strategy "id" --selector "username_field" --text "admin" --clear
npx appium-agent type --element-id V1StGXR8_Z5jd --text "admin@example.com"
```

**Wait — use this instead of sleeping.** After anything that navigates, loads or
animates, wait for the next screen rather than re-reading `page-source` in a loop:

```bash
npx appium-agent wait --strategy "accessibility id" --selector "Dashboard" --for displayed
# → "Dashboard" is displayed (after 412ms).
```

Conditions: `displayed` (default), `existing`, `enabled`, `gone`. Use `gone` for a
spinner or modal. `--timeout <ms>` defaults to 10000 (max 600000); a wait that never
succeeds fails with `WAIT_TIMEOUT` rather than hanging.

**Scroll.** Prefer `scroll` over hand-computed swipes — it reads the real screen size,
so it works on any device:

```bash
npx appium-agent scroll --direction down \
  --to-strategy "accessibility id" --to-selector "Submit" --max-swipes 10
# → Element in view after 3 swipe(s).

npx appium-agent scroll --direction down     # one screenful
```

Direction is the direction the *content* moves: `down` reveals content below.
`--percent <0-0.95>` sets how far each swipe travels (default 0.6); `--max-swipes`
accepts 1–50 (default 10). `Element not found after N swipe(s)` is a signal to re-read
`page-source`, not to keep scrolling.

**Read a value:**
```bash
npx appium-agent get-text --strategy "accessibility id" --selector "greeting"
# → Welcome back, Alex

npx appium-agent get-attribute --element-id V1StGXR8_Z5jd --attribute value
# → value: 0
```

Common attributes: `value`, `label`, `name`, `enabled`, `visible`, `accessible`, `focused`.

## 6. Session state

```bash
npx appium-agent session-status
# → Active session: dc3e025e-689c-49e4-bd33-80bdd57c6a9c

npx appium-agent device-info
# → Platform: iOS 18.0 / Device: iPhone 15 / Screen: 393x852 / Orientation: PORTRAIT

npx appium-agent delete-session
```

Check `session-status` when unsure whether a session survived — it avoids a spurious
`connect` that would fail with `SESSION_ALREADY_ACTIVE`. Sessions also close on their
own after 30 idle minutes; see `references/errors.md`.

`delete-session` closes the session and clears all stored element references.

## Element references

`find-element` returns a short ID (e.g. `V1StGXR8_Z5jd`) usable as `--element-id`. The
daemon re-finds the element from its stored selector at action time, so a reference
survives a re-render but not a navigation — a gone element fails with `STALE_ELEMENT`,
and the fix is always to run `find-element` again. `references/errors.md` covers the
ambiguous-selector cases.

## Multi-step flow example

```bash
npx appium-agent daemon:start
npx appium-agent connect --caps '{"platformName":"iOS","appium:automationName":"XCUITest","appium:deviceName":"iPhone 15","appium:bundleId":"com.example.app"}'

# Read the screen, then act on what is actually there
npx appium-agent page-source
npx appium-agent type --strategy "accessibility id" --selector "Username" --text "admin" --clear
npx appium-agent type --strategy "accessibility id" --selector "Password" --text "secret" --clear
npx appium-agent click --strategy "accessibility id" --selector "Login"

# Wait for the next screen instead of guessing at a delay
npx appium-agent wait --strategy "accessibility id" --selector "Dashboard" --for displayed

# Inspect it, then scroll to something below the fold
npx appium-agent page-source
npx appium-agent scroll --direction down \
  --to-strategy "accessibility id" --to-selector "Settings" --max-swipes 8
npx appium-agent click --strategy "accessibility id" --selector "Settings"

npx appium-agent delete-session
```

## Working efficiently

- Read `page-source` before acting; never guess a selector.
- Pass locators inline. Use `find-element` only when you need the ID more than once.
- `wait` after anything that navigates — faster and far more reliable than polling
  `page-source`.
- `scroll --to-selector` rather than repeated blind swipes.
- `--bounds` when you plan to tap coordinates; it saves a `get-location` call.
- Pass `--clear` to `type` unless you deliberately want to append.
- The tree already omits off-screen elements, so if something is missing, scroll — do
  not fall back to `--raw` unless you need an attribute the tree does not show.
- Chain independent commands in one shell invocation with `&&` rather than one per step.
