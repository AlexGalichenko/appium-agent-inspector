import { describe, expect, it, vi } from 'vitest';
import { DaemonClient } from '../../src/cli/daemon-client.js';
import { buildServer } from '../../src/daemon/server.js';
import { ROUTES, scrollTimeoutMs } from '../../src/shared/routes.js';

// The table is the single definition of every endpoint. These checks pin both
// sides to it, so a route can never exist on only one of them.
describe('shared route table', () => {
  it('registers every route on the daemon with its method and path', async () => {
    const server = await buildServer({
      sessionManager: { setSessionLostHandler: vi.fn(), touch: vi.fn() } as never,
      elementRegistry: {} as never,
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
      requestShutdown: vi.fn(),
    });
    await server.ready();
    for (const [name, route] of Object.entries(ROUTES)) {
      expect(
        server.hasRoute({ method: route.method, url: route.path }),
        `${name}: ${route.method} ${route.path}`,
      ).toBe(true);
    }
    await server.close();
  });

  it('gives the client a method for every route', () => {
    const client = DaemonClient.default(1);
    for (const name of Object.keys(ROUTES)) {
      expect(typeof (client as unknown as Record<string, unknown>)[name], name).toBe(
        'function',
      );
    }
  });

  it('scales the scroll timeout with the swipes it may make', () => {
    const one = scrollTimeoutMs({ direction: 'down' });
    const many = scrollTimeoutMs({
      direction: 'down',
      maxSwipes: 20,
      toElement: { strategy: 'id', selector: 'x' },
    });
    expect(many).toBeGreaterThan(one);
  });
});
