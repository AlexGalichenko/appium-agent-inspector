# Screenshots and video

## Screenshot

```bash
# Saves a PNG and prints its path (the default — never floods stdout)
npx appium-agent take-screenshot
# → Screenshot saved to /tmp/appium-screenshot-1789068709845.png

# Choose the path yourself
npx appium-agent take-screenshot --output /tmp/screen.png

# Only if you really need the bytes inline
npx appium-agent take-screenshot --base64
```

Read the saved PNG with your own file-reading tool. `--base64` prints megabytes of
text — do not use it to "look at" the screen.

`page-source` is the cheaper way to understand a screen, and the only one that
gives you selectors. Take a screenshot when the question is visual (layout,
rendering, a chart) or when you need evidence to hand back to the user.

## Video

```bash
# Start recording
npx appium-agent video-start

# Stop recording and save an MP4 to a path you choose
npx appium-agent video-stop /recordings/recording.mp4

# Stop recording; saves to a temp file and prints the path
npx appium-agent video-stop

# Print base64 to stdout instead
npx appium-agent video-stop --base64
```
