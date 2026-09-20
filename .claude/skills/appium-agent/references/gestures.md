# Touch gestures and coordinates

For plain scrolling use the `scroll` command — it sizes the swipe to the device.
Reach for what is on this page only when you need exact coordinates, drag & drop,
or multi-touch.

## Getting coordinates

`page-source --bounds` annotates tap targets with `@centreX,centreY WidthxHeight`,
which is usually all you need. For one element on its own:

```bash
npx appium-agent get-location --strategy "accessibility id" --selector "Login"
# → x: 115
# → y: 796
# → width: 58
# → height: 42
```

`get-location` also accepts `--element-id`. Centre point is `x + width/2`, `y + height/2`.

When you compute coordinates yourself, check the screen size first:

```bash
npx appium-agent device-info
# → Screen: 393x852
```

## perform-action

`perform-action` accepts a JSON object (high-level gesture) or a raw W3C actions array.

```bash
# Tap at coordinates
npx appium-agent perform-action '{"type":"tap","x":200,"y":400}'

# Swipe (scroll up: start low, end high)
npx appium-agent perform-action '{"type":"swipe","startX":200,"startY":700,"endX":200,"endY":200,"duration":400}'

# Long press
npx appium-agent perform-action '{"type":"long-press","x":200,"y":400,"duration":1500}'
```

*Swipe left (next page / dismiss):*
```bash
npx appium-agent perform-action '{"type":"swipe","startX":700,"startY":400,"endX":100,"endY":400,"duration":300}'
```

*Swipe right (go back / previous page):*
```bash
npx appium-agent perform-action '{"type":"swipe","startX":100,"startY":400,"endX":700,"endY":400,"duration":300}'
```

## Drag and drop

Find both centres, then pass a raw W3C pointer sequence. The pause after
`pointerDown` is what signals drag intent — without it most apps read the
gesture as a flick.

```bash
# 1. Source centre, e.g. x=100, y=325
npx appium-agent get-location --strategy "accessibility id" --selector "Item"

# 2. Target centre, e.g. x=150, y=640
npx appium-agent get-location --strategy "accessibility id" --selector "Drop Zone"

# 3. Move to source, press, pause, move to target, release
npx appium-agent perform-action '[{"type":"pointer","id":"finger1","parameters":{"pointerType":"touch"},"actions":[{"type":"pointerMove","duration":0,"x":100,"y":325},{"type":"pointerDown","button":0},{"type":"pause","duration":750},{"type":"pointerMove","duration":500,"x":150,"y":640},{"type":"pointerUp","button":0}]}]'
```

## Pinch and spread

*Pinch to zoom out (two fingers moving inward):*
```bash
npx appium-agent perform-action '[{"type":"pointer","id":"finger1","parameters":{"pointerType":"touch"},"actions":[{"type":"pointerMove","duration":0,"x":100,"y":300},{"type":"pointerDown","button":0},{"type":"pointerMove","duration":500,"x":200,"y":400},{"type":"pointerUp","button":0}]},{"type":"pointer","id":"finger2","parameters":{"pointerType":"touch"},"actions":[{"type":"pointerMove","duration":0,"x":300,"y":500},{"type":"pointerDown","button":0},{"type":"pointerMove","duration":500,"x":200,"y":400},{"type":"pointerUp","button":0}]}]'
```

*Spread to zoom in (two fingers moving outward):*
```bash
npx appium-agent perform-action '[{"type":"pointer","id":"finger1","parameters":{"pointerType":"touch"},"actions":[{"type":"pointerMove","duration":0,"x":200,"y":400},{"type":"pointerDown","button":0},{"type":"pointerMove","duration":500,"x":100,"y":300},{"type":"pointerUp","button":0}]},{"type":"pointer","id":"finger2","parameters":{"pointerType":"touch"},"actions":[{"type":"pointerMove","duration":0,"x":200,"y":400},{"type":"pointerDown","button":0},{"type":"pointerMove","duration":500,"x":300,"y":500},{"type":"pointerUp","button":0}]}]'
```

## Coordinates vs `mobile:` commands

On iOS, `mobile: scroll` and `mobile: swipe` (XCUITest gestures) are more reliable
than coordinate swipes because they work regardless of screen size. Prefer
`execute --command "mobile: scroll"` for list scrolling — see
`references/mobile-commands.md` — and keep `perform-action` for drag & drop and
multi-touch.
