# execute — driver-native `mobile:` commands

`execute` passes a command straight to the Appium driver. Use it for gestures and
queries the dedicated commands do not cover.

```bash
# Scroll down (no return value)
npx appium-agent execute --command "mobile: scroll" --params '{"direction":"down"}'
# → Result: null

# Scroll to an element by predicate
npx appium-agent execute --command "mobile: scroll" --params '{"predicateString":"label == \"Done\""}'

# Get device info (returns a JSON object)
npx appium-agent execute --command "mobile: deviceInfo"
# → Result: {"udid":"...","name":"iPhone 15",...}

# Press a hardware button
npx appium-agent execute --command "mobile: pressButton" --params '{"name":"home"}'
```

`--params` must be a JSON object string. Omit it entirely if the command takes no
parameters.

A `mobile:` command that returns a large object prints all of it. Pipe it through
`jq` when you only need one field:

```bash
npx appium-agent --json execute --command "mobile: deviceInfo" | jq -r '.result.udid'
```
