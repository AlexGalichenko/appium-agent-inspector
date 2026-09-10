import type { FastifyInstance } from 'fastify';
import {
  ActivateAppRequestSchema,
  ClickRequestSchema,
  ExecuteCommandRequestSchema,
  GetAttributeRequestSchema,
  GetLocationRequestSchema,
  GetTextRequestSchema,
  InstallAppRequestSchema,
  PerformActionRequestSchema,
  ScrollRequestSchema,
  TerminateAppRequestSchema,
  TypeRequestSchema,
} from '../../shared/types.js';
import type { ScrollDirection, ScrollResponse } from '../../shared/types.js';
import { toWdioSelector } from '../element-registry.js';
import type { Driver } from '../session-manager.js';
import { parseBody, resolveElement } from './helpers.js';
import type { RouteDeps } from './helpers.js';

export async function actionRoutes(
  fastify: FastifyInstance,
  deps: RouteDeps,
): Promise<void> {
  const { sessionManager } = deps;

  fastify.post('/actions/click', async (request, reply) => {
    const body = parseBody(ClickRequestSchema, request.body);
    const element = await resolveElement(body, deps);
    await element.click();
    return reply.send({ ok: true, data: { message: 'Clicked' } });
  });

  fastify.post('/actions/type', async (request, reply) => {
    const body = parseBody(TypeRequestSchema, request.body);
    const element = await resolveElement(body, deps);
    if (body.clearFirst) {
      await element.clearValue();
    }
    await element.setValue(body.text);
    return reply.send({ ok: true, data: { message: 'Text entered' } });
  });

  fastify.post('/actions/text', async (request, reply) => {
    const body = parseBody(GetTextRequestSchema, request.body);
    const element = await resolveElement(body, deps);
    const text = await element.getText();
    return reply.send({ ok: true, data: { text } });
  });

  fastify.post('/actions/activate-app', async (request, reply) => {
    const { appId } = parseBody(ActivateAppRequestSchema, request.body);
    await sessionManager.getDriver().activateApp(appId);
    return reply.send({ ok: true, data: { message: 'App activated' } });
  });

  fastify.post('/actions/terminate-app', async (request, reply) => {
    const { appId } = parseBody(TerminateAppRequestSchema, request.body);
    // wdio's protocol types declare terminateApp as Promise<void>, but the
    // Appium endpoint documents and returns a boolean saying whether the app
    // was running. Assert it here rather than leaking `undefined` to callers.
    const terminated = (await sessionManager
      .getDriver()
      .terminateApp(appId)) as unknown as boolean;
    return reply.send({ ok: true, data: { terminated } });
  });

  fastify.post('/actions/install-app', async (request, reply) => {
    const { appPath } = parseBody(InstallAppRequestSchema, request.body);
    await sessionManager.getDriver().installApp(appPath);
    return reply.send({ ok: true, data: { message: `App installed: ${appPath}` } });
  });

  fastify.post('/actions/attribute', async (request, reply) => {
    const body = parseBody(GetAttributeRequestSchema, request.body);
    const element = await resolveElement(body, deps);
    const value = await element.getAttribute(body.attribute);
    return reply.send({ ok: true, data: { attribute: body.attribute, value } });
  });

  fastify.get('/actions/screenshot', async (_request, reply) => {
    const data = await sessionManager.getDriver().takeScreenshot();
    return reply.send({
      ok: true,
      data: { data, capturedAt: new Date().toISOString() },
    });
  });

  fastify.post('/actions/execute', async (request, reply) => {
    const { command, params } = parseBody(ExecuteCommandRequestSchema, request.body);
    const result = await sessionManager.getDriver().execute(command, params ?? {});
    return reply.send({ ok: true, data: { result } });
  });

  fastify.post('/actions/location', async (request, reply) => {
    const body = parseBody(GetLocationRequestSchema, request.body);
    const element = await resolveElement(body, deps);
    const [location, size] = await Promise.all([
      element.getLocation(),
      element.getSize(),
    ]);
    return reply.send({
      ok: true,
      data: { x: location.x, y: location.y, width: size.width, height: size.height },
    });
  });

  fastify.post('/actions/video-start', async (_request, reply) => {
    await sessionManager.getDriver().startRecordingScreen();
    return reply.send({
      ok: true,
      data: { message: 'Recording started', startedAt: new Date().toISOString() },
    });
  });

  fastify.post('/actions/video-stop', async (_request, reply) => {
    const data = await sessionManager.getDriver().stopRecordingScreen();
    return reply.send({
      ok: true,
      data: { data, stoppedAt: new Date().toISOString() },
    });
  });

  fastify.post('/actions/scroll', async (request, reply) => {
    const body = parseBody(ScrollRequestSchema, request.body);
    const driver = sessionManager.getDriver();

    const { width, height } = await driver.getWindowSize();
    const swipe = swipeVector(body.direction, body.percent, width, height);

    let swipes = 0;
    let found: boolean | null = null;

    if (body.toElement === undefined) {
      await performSwipe(driver, swipe, body.duration);
      swipes = 1;
    } else {
      const selector = toWdioSelector(body.toElement.strategy, body.toElement.selector);
      found = await isInView(driver, selector);

      while (!found && swipes < body.maxSwipes) {
        await performSwipe(driver, swipe, body.duration);
        swipes += 1;
        found = await isInView(driver, selector);
      }
    }

    const data: ScrollResponse = { direction: body.direction, swipes, found };
    return reply.send({ ok: true, data });
  });

  fastify.post('/actions/perform', async (request, reply) => {
    const body = parseBody(PerformActionRequestSchema, request.body);
    const driver = sessionManager.getDriver();

    if (Array.isArray(body)) {
      // Raw W3C Actions API
      await driver.performActions(body);
      return reply.send({ ok: true, data: { message: 'actions performed' } });
    }

    if (body.type === 'swipe') {
      await performSwipe(
        driver,
        { startX: body.startX, startY: body.startY, endX: body.endX, endY: body.endY },
        body.duration,
      );
    } else {
      // tap and long-press differ only in how long the pointer stays down
      await driver
        .action('pointer', { parameters: { pointerType: 'touch' } })
        .move({ duration: 0, x: body.x, y: body.y })
        .down({ button: 0 })
        .pause(body.duration)
        .up({ button: 0 })
        .perform();
    }

    return reply.send({ ok: true, data: { message: `${body.type} performed` } });
  });

  fastify.get('/actions/page-source', async (_request, reply) => {
    const source = await sessionManager.getDriver().getPageSource();
    return reply.send({
      ok: true,
      data: { source, capturedAt: new Date().toISOString() },
    });
  });
}

/**
 * Whether an element is actually on screen.
 *
 * Neither of the obvious checks is enough on its own: `isExisting` is true for
 * anything in the hierarchy, including views far below the fold, and wdio's
 * `isDisplayed` does not consult the native visibility attribute in a native
 * context — an off-screen springboard icon reports displayed. The drivers do
 * expose the truth as an attribute (`visible` on XCUITest, `displayed` on
 * UiAutomator2), so read that first and fall back only if it is unavailable.
 */
export async function isInView(driver: Driver, selector: string): Promise<boolean> {
  const element = driver.$(selector);

  if (!(await element.isExisting())) return false;

  for (const attribute of ['visible', 'displayed']) {
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

/**
 * Scrolling *down* (revealing content below) means dragging the finger *up*,
 * so the vector is inverted relative to the requested direction.
 */
export function swipeVector(
  direction: ScrollDirection,
  percent: number,
  width: number,
  height: number,
): SwipeVector {
  const cx = Math.round(width / 2);
  const cy = Math.round(height / 2);
  const dy = Math.round((height * percent) / 2);
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

async function performSwipe(
  driver: Driver,
  v: SwipeVector,
  duration: number,
): Promise<void> {
  await driver
    .action('pointer', { parameters: { pointerType: 'touch' } })
    .move({ duration: 0, x: v.startX, y: v.startY })
    .down({ button: 0 })
    .pause(50)
    .move({ duration, x: v.endX, y: v.endY })
    .up({ button: 0 })
    .perform();
}
