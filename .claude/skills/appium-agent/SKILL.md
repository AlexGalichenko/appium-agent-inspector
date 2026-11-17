---
name: appium-agent
description: Drive and inspect a running iOS or Android app through the appium-agent CLI — read the screen, find, tap, type, wait, scroll, screenshot, launch or close apps. Use for any mobile UI automation or inspection task.
---

# Appium Agent

Drive iOS and Android apps through the appium-agent daemon, which keeps one Appium
session alive between commands. Call `appium-agent <command>` directly — `npx`
adds ~0.3 s to every call; if the binary is missing, run
`npm install -g appium-agent-inspector` once (or prefix commands with `npx`).
Failures exit non-zero with one `Error [CODE]: message` line. `--json` gives
machine-readable output on any command except `page-source`, where plain text is
smaller.

Reference pages — read only when the task needs them:

| Page | Covers |
|---|---|
| `references/gestures.md` | `perform-action`, `get-location`, drag & drop, pinch, raw coordinates |
| `references/mobile-commands.md` | `execute` and driver-native `mobile:` commands |
| `references/media.md` | `take-screenshot`, `video-start`, `video-stop` |
| `references/webviews.md` | `context`, hybrid apps |
| `references/app-lifecycle.md` | `install-app`, `activate-app`, `terminate-app` |
| `references/errors.md` | Every error code; why sessions and references go stale |

## Start

```bash
appium-agent connect --caps '{"platformName":"iOS","appium:automationName":"XCUITest","appium:deviceName":"iPhone 15","appium:bundleId":"com.example.app"}'
```

`connect` starts the daemon if it is not running (`daemon:kill` stops it), and can
take a minute — run it once and wait; a second `connect` meanwhile
fails with `SESSION_ALREADY_ACTIVE`. Unsure whether a session survived? Run
`session-status` rather than reconnecting. Server flags: `--server-protocol`
(`http`/`https`), `--server-host`, `--server-port` (default 4723, or 443 for https),
`--server-path`. A relative `appium:app` path resolves against the current directory.
Sessions close after 30 idle minutes. `delete-session` ends one and clears all
element references; `device-info` shows platform, screen size and orientation.

## Read the screen first — never guess a selector

```bash
appium-agent page-source
```

```
- recyclerview [scrollable, id="list"]:
  - framelayout [clickable, id="row"]:
    - textview "Item 0" [id="title"]
    - button "Add" [clickable, id="add"]
  # +24 more like above; "=" = same, [n] is not an --index:
  - [1] = "Item 1" = =
```

Only on-screen elements appear — if something is missing, scroll to it. Repeated
rows show the first in full, then one line per row with only what differs, position
by position. `[n]` counts rows within the run; it is not `--index`, which counts
matches of one selector. `×2` marks identical neighbours. Flags: `--bounds` adds
`@centreX,centreY WxH` to tap targets; `--no-collapse` prints every row and line;
`--raw` prints the XML (several times larger — redirect it to a file, and only use
it for an attribute the tree lacks).

To see the result of an action, add `--source` to `click`, `type`, `wait`,
`scroll`, `perform-action` or `activate-app`: it prints the screen in the same call.
`page-source --diff` prints only what changed since the last read (`+`/`-` lines
under their parent), or the full tree when the screen is new — use it after small
changes such as typing.

## Locate

Every element command takes `--strategy` + `--selector` (plus `--index <n>` for the
n-th match), or `--element-id` from `find-element`. Pass locators inline;
`find-element` only pays off when you reuse the element several times.

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

xpath, class name, css and both `-ios` selectors must fit on one line.

```bash
appium-agent find-element --strategy "accessibility id" --selector "Login"
# → ID: V1StGXR8_Z5jd   (+ a note if the selector matches several; --all stores each)
```

A reference re-finds its element at action time: it survives a re-render, not a
navigation. `STALE_ELEMENT` always means run `find-element` again.

## Act

```bash
appium-agent click --strategy "accessibility id" --selector "Login"
appium-agent type  --strategy "id" --selector "username" --text "admin" --clear
appium-agent get-text --element-id V1StGXR8_Z5jd
appium-agent get-attribute --strategy "id" --selector "toggle" --attribute value   # → 1
```

`type` **appends** — pass `--clear` unless you mean to add to existing text.
(A password field cannot be read back, so typing into one always replaces it.)
Common attributes: `value`, `label`, `name`, `enabled`, `visible`, `focused`.

**Wait instead of sleeping or re-reading `page-source`** after anything that
navigates, loads or animates:

```bash
appium-agent click --strategy "accessibility id" --selector "Login"
appium-agent wait --strategy "accessibility id" --selector "Dashboard" --source
# → OK after 412ms.  + the new screen
```

`--for displayed` (default) / `existing` / `enabled` / `gone` (spinners, modals);
`--timeout <ms>` defaults to 10000. Failure is `WAIT_TIMEOUT`, never a hang.

**Scroll** rather than hand-computing swipes — it uses the real screen size:

```bash
appium-agent scroll --direction down --to-strategy "accessibility id" --to-selector "Submit"
# → Element in view after 3 swipe(s).
```

Direction is where content moves (`down` reveals what is below). Without `--to-*`
it scrolls one screenful. `--max-swipes` 1–50 (default 10), `--percent` 0–0.95
(default 0.6). "Not found after N swipes" means re-read `page-source`, not scroll more.

Chain independent commands with `&&` in one shell call.

## When the screen and the tree disagree (iOS)

- A `click` that succeeds but changes nothing: `take-screenshot`, then
  `perform-action` a tap where the element is actually drawn — iOS can report a
  stale frame (seen on search results).
- A control you can see is missing from the tree, or `wait --for displayed` times
  out on it: iOS marked it invisible. Use `--for existing`, or read the frame from
  `page-source --raw`. When iOS marks *every* control invisible (popovers, some
  alerts), the tree says so on its first line and shows on-screen elements anyway.
- The keyboard appears as one `keyboard [N keys]` line plus its Return/Search key;
  tap that key to submit or dismiss. `scroll` keeps its swipe above the keyboard.
