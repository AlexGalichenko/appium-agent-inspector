# Hybrid apps and web views

If `page-source` shows a `webview` element but almost no content inside it, the app
is hybrid and you must switch context before the web content becomes reachable.

```bash
appium-agent context
#   NATIVE_APP
# * WEBVIEW_1        ← the * marks the current context

appium-agent context --switch WEBVIEW_1
# ... interact using css selector / xpath ...
appium-agent context --switch NATIVE_APP
```

Inside a web view, `css selector` becomes available as a locator strategy and
`xpath` addresses the DOM rather than the native hierarchy.

Remember to switch back to `NATIVE_APP` before interacting with native UI again —
native selectors do not resolve while a web view context is active, and the failure
looks like `ELEMENT_NOT_FOUND` rather than anything context-related.

On iOS, listing contexts in an app with no web view takes ~10 s: XCUITest waits for
the remote debugger, then retries. If you only switch in and out of a known web
view, connect with `"appium:webviewConnectTimeout": 1000` and
`"appium:webviewConnectRetries": 1` — at the risk of missing a web view that loads
slowly.

A context that does not exist fails with `CONTEXT_NOT_FOUND`; run `context` with no
flags to list what is actually available.
