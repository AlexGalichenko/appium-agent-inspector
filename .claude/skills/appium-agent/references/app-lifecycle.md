# Installing, activating and terminating apps

These commands operate on any app on the device — they do **not** close the Appium
session, so element references and the session itself survive.

## Install

```bash
# iOS (.ipa or .app)
appium-agent install-app /path/to/MyApp.ipa

# Android (.apk) — relative paths resolve against the current directory
appium-agent install-app build/outputs/apk/debug/app-debug.apk
```

## Bring to the foreground

```bash
# iOS uses the bundle ID, Android the package name
appium-agent activate-app com.example.app
```

## Terminate

```bash
appium-agent terminate-app com.example.app
# → Terminated com.example.app.      (or "com.example.app was not running.")
```

Terminating the app under test leaves the session open but with nothing on screen;
`activate-app` brings it back without paying for a new `connect`.
