# Changelog

## [Unreleased]

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
- **`video:start` / `video:stop`** — start and stop screen recording; `video:stop` saves the result to a file.
- **`execute <script> [args]`** — run a mobile execute command with JSON parameter support.
- Selector-rehydration element registry — elements are re-located at action time using their original selector, so references survive UI refreshes.
- JSON REST API on `127.0.0.1:47321`.
- Android support via `appium-uiautomator2-driver`.
