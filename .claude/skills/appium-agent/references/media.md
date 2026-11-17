# Screenshots and video

## Screenshot

```bash
# Saves a PNG and prints its path (the default — never floods stdout)
appium-agent take-screenshot
# → Screenshot saved to /tmp/appium-screenshot-1789068709845.png

# Choose the path yourself
appium-agent take-screenshot --output /tmp/screen.png

# Only if you really need the bytes inline
appium-agent take-screenshot --base64
```

Read the saved PNG with your own file-reading tool. `--base64` prints megabytes of
text — do not use it to "look at" the screen.

`page-source` is the cheaper way to understand a screen, and the only one that
gives you selectors. Take a screenshot when the question is visual (layout,
rendering, a chart) or when you need evidence to hand back to the user.

## Video

```bash
# Start recording
appium-agent video-start

# Stop recording and save an MP4 to a path you choose
appium-agent video-stop /recordings/recording.mp4

# Stop recording; saves to a temp file and prints the path
appium-agent video-stop

# Print base64 to stdout instead
appium-agent video-stop --base64
```
