# Error codes and recovery

Every command exits non-zero on failure and prints one `Error [CODE]: message` line.

| Error code | Meaning | Fix |
|---|---|---|
| `DAEMON_NOT_RUNNING` | Daemon process not found | Run `daemon:start` |
| `DAEMON_START_FAILED` | Daemon exited or never became healthy while starting | Read the log path in the message |
| `DAEMON_START_LOCKED` | Another `daemon:start` is still running | Wait, then run `daemon:start` again |
| `DAEMON_TIMEOUT` | Daemon did not respond in time | Check `~/.appium-agent/daemon.log`; `daemon:kill` then `daemon:start` |
| `UNAUTHORIZED` | Token mismatch (stale state file) | `daemon:kill` then `daemon:start` |
| `SESSION_NOT_ACTIVE` | No session — never opened, idle-closed, or dropped by Appium | Run `connect` |
| `SESSION_ALREADY_ACTIVE` | Session already open, or still starting | Run `delete-session` first, or proceed; never `connect` in parallel |
| `ELEMENT_NOT_FOUND` | Element not in current view | Check selector / scroll to reveal |
| `ELEMENT_NOT_INTERACTABLE` | Element exists but is hidden, disabled, or covered | `wait --for enabled`/`displayed`, dismiss the overlay, or scroll |
| `ELEMENT_REF_NOT_FOUND` | Unknown element ID | Re-run `find-element` |
| `STALE_ELEMENT` | Element was found before but is gone or can no longer be identified | Re-run `find-element` |
| `INVALID_SELECTOR` | Driver rejected the selector syntax | Fix the selector for its strategy (quotes, brackets, backticks) |
| `VALIDATION_ERROR` | Bad input (wrong caps format, empty or multi-line selector, out-of-range flag) | Fix the argument |
| `WAIT_TIMEOUT` | `wait` condition never met | Re-read `page-source`; the screen may not be what you expect |
| `CONTEXT_NOT_FOUND` | Requested webview does not exist | Run `context` to list what is available |

## Sessions closing under you

A session with **no commands for 30 minutes closes automatically** to release the
device (`APPIUM_AGENT_IDLE_TIMEOUT_MS`, `0` disables). The daemon also drops a session
the Appium server no longer knows about. Either way the next command fails with
`SESSION_NOT_ACTIVE` — after a long pause, run `session-status` and `connect` again
rather than retrying the failed command.

## Element references going stale

References use **selector rehydration**: the daemon re-finds the element at action time
from the stored strategy + selector, so a reference survives a re-render but not a
navigation. `STALE_ELEMENT` carries the original selector in its message.

References from an ambiguous selector (`--index`, `--all`) also record the element's
text. When a list scrolls and the element moves, the daemon follows it; if it cannot
tell which match is right (the text is gone, or several matches share it) you get
`STALE_ELEMENT` rather than an action on the wrong row. Rows with identical or empty
text cannot be told apart this way — prefer a selector that matches exactly one
element, such as one including the row's own text.

References clear when the session ends or the device stops responding, so
`STALE_ELEMENT` or `ELEMENT_REF_NOT_FOUND` after a crash means "re-discover", not
"retry".
