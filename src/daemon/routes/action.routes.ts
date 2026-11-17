import type { FastifyInstance } from 'fastify';
import { ROUTES } from '../../shared/routes.js';
import type { ScrollDirection, ScrollResponse } from '../../shared/types.js';
import { findMatches, toWdioSelector } from '../element-registry.js';
import type { Driver } from '../session-manager.js';
import { on, resolveElement } from './helpers.js';
import type { RouteDeps } from './helpers.js';

export async function actionRoutes(
  fastify: FastifyInstance,
  deps: RouteDeps,
): Promise<void> {
  const { sessionManager } = deps;
  const driver = () => sessionManager.getDriver();

  on(fastify, ROUTES.click, async (body) => {
    await (await resolveElement(body, deps)).click();
    return { message: 'Clicked' };
  });

  on(fastify, ROUTES.type, async (body) => {
    const element = await resolveElement(body, deps);
    // wdio's setValue clears the field before typing, so it is exactly "replace
    // the contents"; only addValue leaves existing text in place — except on
    // Android, where UiAutomator2's send-keys is setText and replaces too.
    if (body.clearFirst) {
      await element.setValue(body.text);
    } else if (driver().isAndroid) {
      await element.addValue((await androidFieldText(element)) + body.text);
    } else {
      await element.addValue(body.text);
    }
    return { message: 'Text entered' };
  });

  on(fastify, ROUTES.getText, async (body) => ({
    text: await (await resolveElement(body, deps)).getText(),
  }));

  on(fastify, ROUTES.getAttribute, async (body) => ({
    value: await (await resolveElement(body, deps)).getAttribute(body.attribute),
  }));

  on(fastify, ROUTES.getElementLocation, async (body) => {
    const element = await resolveElement(body, deps);
    const [location, size] = await Promise.all([
      element.getLocation(),
      element.getSize(),
    ]);
    return { x: location.x, y: location.y, width: size.width, height: size.height };
  });

  on(fastify, ROUTES.activateApp, async ({ appId }) => {
    await driver().activateApp(appId);
    return { message: 'App activated' };
  });

  on(fastify, ROUTES.terminateApp, async ({ appId }) => {
    // wdio's protocol types declare terminateApp as Promise<void>, but the
    // Appium endpoint documents and returns a boolean saying whether the app
    // was running. Assert it here rather than leaking `undefined` to callers.
    const terminated = (await driver().terminateApp(appId)) as unknown as boolean;
    return { terminated };
  });

  on(fastify, ROUTES.installApp, async ({ appPath }) => {
    await driver().installApp(appPath);
    return { message: `App installed: ${appPath}` };
  });

  on(fastify, ROUTES.executeCommand, async ({ command, params }) => ({
    result: await driver().execute(command, params ?? {}),
  }));

  on(fastify, ROUTES.getPageSource, async () => ({
    source: await driver().getPageSource(),
  }));

  on(fastify, ROUTES.takeScreenshot, async () => ({
    data: await driver().takeScreenshot(),
  }));

  on(fastify, ROUTES.startVideoRecording, async () => {
    await driver().startRecordingScreen();
    return { message: 'Recording started' };
  });

  on(fastify, ROUTES.stopVideoRecording, async () => ({
    data: await driver().stopRecordingScreen(),
  }));

  on(fastify, ROUTES.scroll, async (body) => {
    const d = driver();
    const { width, height } = await d.getWindowSize();
    const band = await swipeBand(d, height, sessionManager);
    const swipe = swipeVector(body.direction, body.percent, width, band.bottom, band.top);

    if (body.toElement === undefined) {
      await performSwipe(d, swipe, body.duration);
      return { swipes: 1, found: null };
    }

    const selector = toWdioSelector(body.toElement.strategy, body.toElement.selector);
    const { maxSwipes, duration } = body;

    // Under the implicit wait, each check for a still-absent element would
    // block for the full timeout before the next swipe.
    return sessionManager.withoutImplicitWait(async () => {
      let swipes = 0;
      let found = await isInView(d, selector);
      while (!found && swipes < maxSwipes) {
        await performSwipe(d, swipe, duration);
        swipes += 1;
        found = await isInView(d, selector);
      }
      return { swipes, found } satisfies ScrollResponse;
    });
  });

  on(fastify, ROUTES.performAction, async (body) => {
    const d = driver();

    if (Array.isArray(body)) {
      // Raw W3C Actions API
      await d.performActions(body);
      return { message: 'actions performed' };
    }

    if (body.type === 'swipe') {
      await performSwipe(
        d,
        { startX: body.startX, startY: body.startY, endX: body.endX, endY: body.endY },
        body.duration,
      );
    } else {
      // tap and long-press differ only in how long the pointer stays down
      await touchGesture(d, { x: body.x, y: body.y }, body.duration);
    }
    return { message: `${body.type} performed` };
  });
}

/**
 * What an Android field holds, so `type` can append to it. An empty field
 * reports its hint ("Search settings") as its text, which `showing-hint` gives
 * away. A password field cannot be read back; typing into one replaces.
 */
async function androidFieldText(element: WebdriverIO.Element): Promise<string> {
  const read = (name: string) => element.getAttribute(name).then(String, () => null);
  if ((await read('password')) === 'true') return '';
  if ((await read('showing-hint')) === 'true') return '';
  return (await read('text')) ?? '';
}

/**
 * Whether an element is actually on screen.
 *
 * Neither of the obvious checks is enough on its own: being found is true for
 * anything in the hierarchy, including views far below the fold, and wdio's
 * `isDisplayed` does not consult the native visibility attribute in a native
 * context — an off-screen springboard icon reports displayed. The drivers do
 * expose the truth as an attribute (`visible` on XCUITest, `displayed` on
 * UiAutomator2), so read that first and fall back only if it is unavailable.
 *
 * Ask for the platform's own attribute first: on UiAutomator2 an unknown
 * attribute is an error that takes ~1.6 s, paid on every check of a scroll.
 */
export async function isInView(driver: Driver, selector: string): Promise<boolean> {
  const element = (await findMatches(driver, selector))[0];
  if (element === undefined) return false;

  const attributes = driver.isAndroid ? ['displayed'] : ['visible', 'displayed'];
  for (const attribute of attributes) {
    let value: unknown;
    try {
      value = await element.getAttribute(attribute);
    } catch {
      continue; // driver does not expose this attribute
    }
    // Drivers are inconsistent here: XCUITest returns the string "false" over
    // some transports and a real boolean over others.
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
  }

  return element.isDisplayed();
}

interface SwipeVector {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

/** Without a keyboard frame (Android's IME is not in the app's tree), assume this. */
const ASSUMED_KEYBOARD_SHARE = 0.4;
/**
 * Navigation bars and sheet grabbers live in the top fifth; a swipe starting
 * there drags them instead of the content. A full-screen swipe never starts
 * this high, and a band squeezed above the keyboard must not either.
 */
const TOP_CHROME_SHARE = 0.2;

/**
 * The vertical band a swipe may use. A swipe centred on the whole screen
 * starts on the keyboard when one is up, and the keyboard swallows it: the
 * form behind never scrolls. So with a keyboard the band runs from below the
 * top bars to the keyboard's top edge — known exactly on iOS, where the
 * keyboard is in the hierarchy, and assumed elsewhere.
 */
export async function swipeBand(
  driver: Driver,
  height: number,
  sessionManager: RouteDeps['sessionManager'],
): Promise<{ top: number; bottom: number }> {
  const whole = { top: 0, bottom: height };
  let shown = false;
  try {
    shown = await driver.isKeyboardShown();
  } catch {
    return whole; // the driver cannot tell; scroll as before
  }
  if (!shown) return whole;

  const top = await sessionManager.withoutImplicitWait(async () => {
    const keyboard = (await findMatches(driver, 'class name:XCUIElementTypeKeyboard'))[0];
    if (keyboard === undefined) return null;
    try {
      return (await keyboard.getLocation()).y;
    } catch {
      return null;
    }
  });
  const bottom =
    top !== null && top > 0 && top < height
      ? top
      : Math.round(height * (1 - ASSUMED_KEYBOARD_SHARE));
  return { top: Math.min(Math.round(height * TOP_CHROME_SHARE), bottom), bottom };
}

/**
 * Scrolling *down* (revealing content below) means dragging the finger *up*,
 * so the vector is inverted relative to the requested direction.
 */
export function swipeVector(
  direction: ScrollDirection,
  percent: number,
  width: number,
  bottom: number,
  top = 0,
): SwipeVector {
  const span = bottom - top;
  const cx = Math.round(width / 2);
  const cy = Math.round(top + span / 2);
  const dy = Math.round((span * percent) / 2);
  const dx = Math.round((width * percent) / 2);

  switch (direction) {
    case 'down':
      return { startX: cx, startY: cy + dy, endX: cx, endY: cy - dy };
    case 'up':
      return { startX: cx, startY: cy - dy, endX: cx, endY: cy + dy };
    case 'right':
      return { startX: cx + dx, startY: cy, endX: cx - dx, endY: cy };
    case 'left':
      return { startX: cx - dx, startY: cy, endX: cx + dx, endY: cy };
  }
}

interface Point {
  x: number;
  y: number;
}

/**
 * One finger: press at `start`, hold for `holdMs`, then optionally drag to
 * `drag.to` over `drag.duration` before lifting. Every gesture is this shape.
 */
async function touchGesture(
  driver: Driver,
  start: Point,
  holdMs: number,
  drag?: { to: Point; duration: number },
): Promise<void> {
  let chain = driver
    .action('pointer', { parameters: { pointerType: 'touch' } })
    .move({ duration: 0, ...start })
    .down({ button: 0 })
    .pause(holdMs);
  if (drag !== undefined) chain = chain.move({ duration: drag.duration, ...drag.to });
  await chain.up({ button: 0 }).perform();
}

function performSwipe(driver: Driver, v: SwipeVector, duration: number): Promise<void> {
  return touchGesture(driver, { x: v.startX, y: v.startY }, 50, {
    to: { x: v.endX, y: v.endY },
    duration,
  });
}
