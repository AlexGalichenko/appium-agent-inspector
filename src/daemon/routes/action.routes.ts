import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  ElementNotFoundError,
  ElementRefNotFoundError,
  SessionNotActiveError,
  StaleElementError,
} from '../../shared/errors.js';
import {
  ActivateAppRequestSchema,
  ClickRequestSchema,
  ExecuteCommandRequestSchema,
  GetAttributeRequestSchema,
  GetLocationRequestSchema,
  InstallAppRequestSchema,
  PerformActionRequestSchema,
  TerminateAppRequestSchema,
  TypeRequestSchema,
} from '../../shared/types.js';
import type { SessionManager } from '../session-manager.js';
import type { ElementRegistry } from '../element-registry.js';

export async function actionRoutes(
  fastify: FastifyInstance,
  opts: { sessionManager: SessionManager; elementRegistry: ElementRegistry },
): Promise<void> {
  const { sessionManager, elementRegistry } = opts;

  // POST /actions/click
  fastify.post('/actions/click', async (request, reply) => {
    const parseResult = ClickRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: z.prettifyError(parseResult.error),
        },
      });
    }

    try {
      const body = parseResult.data;
      const element =
        'elementId' in body
          ? await elementRegistry.retrieveElement(body.elementId, sessionManager)
          : await elementRegistry.findElement(body.strategy, body.selector, sessionManager);

      await element.click();
      return reply.send({ ok: true, data: { message: 'Clicked' } });
    } catch (err) {
      return handleActionError(err, reply);
    }
  });

  // POST /actions/type
  fastify.post('/actions/type', async (request, reply) => {
    const parseResult = TypeRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: z.prettifyError(parseResult.error),
        },
      });
    }

    try {
      const body = parseResult.data;
      const element =
        'elementId' in body
          ? await elementRegistry.retrieveElement(body.elementId, sessionManager)
          : await elementRegistry.findElement(body.strategy, body.selector, sessionManager);

      if (body.clearFirst) {
        await element.clearValue();
      }
      await element.setValue(body.text);
      return reply.send({ ok: true, data: { message: 'Text entered' } });
    } catch (err) {
      return handleActionError(err, reply);
    }
  });

  // POST /actions/activate-app
  fastify.post('/actions/activate-app', async (request, reply) => {
    const parseResult = ActivateAppRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: z.prettifyError(parseResult.error),
        },
      });
    }

    try {
      const driver = sessionManager.getDriver();
      await driver.activateApp(parseResult.data.appId);
      return reply.send({ ok: true, data: { message: 'App activated' } });
    } catch (err) {
      if (err instanceof SessionNotActiveError) {
        return reply.status(409).send({
          ok: false,
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  // POST /actions/terminate-app
  fastify.post('/actions/terminate-app', async (request, reply) => {
    const parseResult = TerminateAppRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: z.prettifyError(parseResult.error),
        },
      });
    }

    try {
      const driver = sessionManager.getDriver();
      const terminated = await driver.terminateApp(parseResult.data.appId);
      return reply.send({ ok: true, data: { terminated } });
    } catch (err) {
      if (err instanceof SessionNotActiveError) {
        return reply.status(409).send({
          ok: false,
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  // POST /actions/install-app
  fastify.post('/actions/install-app', async (request, reply) => {
    const parseResult = InstallAppRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parseResult.error.flatten(),
        },
      });
    }

    try {
      const driver = sessionManager.getDriver();
      await driver.installApp(parseResult.data.appPath);
      return reply.send({ ok: true, data: { message: `App installed: ${parseResult.data.appPath}` } });
    } catch (err) {
      if (err instanceof SessionNotActiveError) {
        return reply.status(409).send({
          ok: false,
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  // POST /actions/attribute
  fastify.post('/actions/attribute', async (request, reply) => {
    const parseResult = GetAttributeRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: z.prettifyError(parseResult.error),
        },
      });
    }

    try {
      const body = parseResult.data;
      const element =
        'elementId' in body
          ? await elementRegistry.retrieveElement(body.elementId, sessionManager)
          : await elementRegistry.findElement(body.strategy, body.selector, sessionManager);

      const value = await element.getAttribute(body.attribute);
      return reply.send({ ok: true, data: { attribute: body.attribute, value } });
    } catch (err) {
      return handleActionError(err, reply);
    }
  });

  // GET /actions/screenshot
  fastify.get('/actions/screenshot', async (_request, reply) => {
    try {
      const driver = sessionManager.getDriver();
      const data = await driver.takeScreenshot();
      return reply.send({
        ok: true,
        data: {
          data,
          capturedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      if (err instanceof SessionNotActiveError) {
        return reply.status(409).send({
          ok: false,
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  // POST /actions/execute
  fastify.post('/actions/execute', async (request, reply) => {
    const parseResult = ExecuteCommandRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: z.prettifyError(parseResult.error),
        },
      });
    }

    try {
      const driver = sessionManager.getDriver();
      const { command, params } = parseResult.data;
      const result = await driver.execute(command, params ?? {});
      return reply.send({ ok: true, data: { result } });
    } catch (err) {
      if (err instanceof SessionNotActiveError) {
        return reply.status(409).send({
          ok: false,
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  // POST /actions/location
  fastify.post('/actions/location', async (request, reply) => {
    const parseResult = GetLocationRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: z.prettifyError(parseResult.error),
        },
      });
    }

    try {
      const body = parseResult.data;
      const element =
        'elementId' in body
          ? await elementRegistry.retrieveElement(body.elementId, sessionManager)
          : await elementRegistry.findElement(body.strategy, body.selector, sessionManager);

      const [location, size] = await Promise.all([element.getLocation(), element.getSize()]);
      return reply.send({ ok: true, data: { x: location.x, y: location.y, width: size.width, height: size.height } });
    } catch (err) {
      return handleActionError(err, reply);
    }
  });

  // POST /actions/video-start
  fastify.post('/actions/video-start', async (_request, reply) => {
    try {
      const driver = sessionManager.getDriver();
      await driver.startRecordingScreen();
      return reply.send({
        ok: true,
        data: { message: 'Recording started', startedAt: new Date().toISOString() },
      });
    } catch (err) {
      if (err instanceof SessionNotActiveError) {
        return reply.status(409).send({
          ok: false,
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  // POST /actions/video-stop
  fastify.post('/actions/video-stop', async (_request, reply) => {
    try {
      const driver = sessionManager.getDriver();
      const data = await driver.stopRecordingScreen();
      return reply.send({
        ok: true,
        data: { data, stoppedAt: new Date().toISOString() },
      });
    } catch (err) {
      if (err instanceof SessionNotActiveError) {
        return reply.status(409).send({
          ok: false,
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  // POST /actions/perform
  fastify.post('/actions/perform', async (request, reply) => {
    const parseResult = PerformActionRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: z.prettifyError(parseResult.error),
        },
      });
    }

    try {
      const driver = sessionManager.getDriver();
      const body = parseResult.data;

      if (Array.isArray(body)) {
        // Raw W3C Actions API
        await driver.performActions(body);
        return reply.send({ ok: true, data: { message: 'actions performed' } });
      }

      if (body.type === 'tap') {
        await driver
          .action('pointer', { parameters: { pointerType: 'touch' } })
          .move({ duration: 0, x: body.x, y: body.y })
          .down({ button: 0 })
          .pause(body.duration)
          .up({ button: 0 })
          .perform();
      } else if (body.type === 'swipe') {
        await driver
          .action('pointer', { parameters: { pointerType: 'touch' } })
          .move({ duration: 0, x: body.startX, y: body.startY })
          .down({ button: 0 })
          .pause(50)
          .move({ duration: body.duration, x: body.endX, y: body.endY })
          .up({ button: 0 })
          .perform();
      } else {
        // long-press
        await driver
          .action('pointer', { parameters: { pointerType: 'touch' } })
          .move({ duration: 0, x: body.x, y: body.y })
          .down({ button: 0 })
          .pause(body.duration)
          .up({ button: 0 })
          .perform();
      }

      return reply.send({ ok: true, data: { message: `${body.type} performed` } });
    } catch (err) {
      if (err instanceof SessionNotActiveError) {
        return reply.status(409).send({
          ok: false,
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  // GET /actions/page-source
  fastify.get('/actions/page-source', async (_request, reply) => {
    try {
      const driver = sessionManager.getDriver();
      const source = await driver.getPageSource();
      return reply.send({
        ok: true,
        data: {
          source,
          capturedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      if (err instanceof SessionNotActiveError) {
        return reply.status(409).send({
          ok: false,
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });
}

function handleActionError(err: unknown, reply: FastifyReply) {
  if (err instanceof SessionNotActiveError) {
    return reply.status(409).send({
      ok: false,
      error: { code: err.code, message: err.message },
    });
  }
  if (err instanceof ElementRefNotFoundError) {
    return reply.status(404).send({
      ok: false,
      error: { code: err.code, message: err.message },
    });
  }
  if (err instanceof StaleElementError) {
    return reply.status(410).send({
      ok: false,
      error: { code: err.code, message: err.message },
    });
  }
  if (err instanceof ElementNotFoundError) {
    return reply.status(404).send({
      ok: false,
      error: { code: err.code, message: err.message },
    });
  }
  throw err;
}
