# Hybrid apps and web views

If `page-source` shows a `webview` element but almost no content inside it, the app
is hybrid and you must switch context before the web content becomes reachable.

```bash
npx appium-agent context
#   NATIVE_APP
# * WEBVIEW_1        ← the * marks the current context

npx appium-agent context --switch WEBVIEW_1
# ... interact using css selector / xpath ...
npx appium-agent context --switch NATIVE_APP
```

Inside a web view, `css selector` becomes available as a locator strategy and
`xpath` addresses the DOM rather than the native hierarchy.

Remember to switch back to `NATIVE_APP` before interacting with native UI again —
native selectors do not resolve while a web view context is active, and the failure
looks like `ELEMENT_NOT_FOUND` rather than anything context-related.

A context that does not exist fails with `CONTEXT_NOT_FOUND`; run `context` with no
flags to list what is actually available.
