import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import Fastify from 'fastify';
import { remote } from 'webdriverio';
import { toWdioSelector } from '../../src/daemon/element-registry.js';
import { LocatorStrategySchema } from '../../src/shared/types.js';

/**
 * Every other test mocks webdriverio, so none can notice when a selector string
 * means something different to webdriverio than intended — `ios=` silently
 * became the removed `-ios uiautomation` strategy. This drives a real client
 * against a stub WebDriver server and checks what actually goes over the wire.
 */
describe('toWdioSelector against real webdriverio', () => {
  const lookups: unknown[] = [];
  const webdriverStub = Fastify();
  let driver: Awaited<ReturnType<typeof remote>>;

  beforeAll(async () => {
    const capabilities = { platformName: 'iOS', 'appium:automationName': 'XCUITest' };

    webdriverStub.post('/session', async () => ({
      value: { sessionId: 'stub', capabilities },
    }));
    webdriverStub.post('/session/:id/elements', (request, reply) => {
      lookups.push(request.body);
      void reply.send({ value: [] });
    });
    webdriverStub.get('/session/:id/context', async () => ({ value: 'NATIVE_APP' }));
    webdriverStub.setNotFoundHandler(async () => ({ value: null }));

    await webdriverStub.listen({ host: '127.0.0.1', port: 0 });
    const { port } = webdriverStub.server.address() as AddressInfo;

    driver = await remote({
      hostname: '127.0.0.1',
      port,
      path: '/',
      logLevel: 'silent',
      connectionRetryCount: 0,
      capabilities,
    });
  });

  afterAll(async () => {
    await webdriverStub.close();
  });

  it.each(LocatorStrategySchema.options)(
    'sends "%s" as exactly that protocol strategy',
    async (strategy) => {
      lookups.length = 0;
      await driver.$$(toWdioSelector(strategy, 'probe [value]'));
      expect(lookups).toEqual([{ using: strategy, value: 'probe [value]' }]);
    },
  );
});
