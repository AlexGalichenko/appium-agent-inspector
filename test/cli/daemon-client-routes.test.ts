import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DaemonClient } from '../../src/cli/daemon-client.js';

vi.mock('../../src/shared/state-file.js', () => ({ findRunningDaemon: vi.fn() }));

/**
 * Every client method is a thin wrapper that must hit one specific verb and
 * path. Getting one wrong produces a 404 the CLI reports as an opaque failure,
 * so the whole routing table is asserted in one place.
 */
describe('DaemonClient request routing', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: DaemonClient;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    client = DaemonClient.default(47321, 'tok');
  });

  const target = { elementId: 'el-1' };
  const locator = { strategy: 'id' as const, selector: 'ok' };

  const cases: Array<[string, () => Promise<unknown>, string, string]> = [
    ['getSessionStatus', () => client.getSessionStatus(), 'GET', '/session'],
    ['getContexts', () => client.getContexts(), 'GET', '/session/contexts'],
    [
      'switchContext',
      () => client.switchContext('WEBVIEW_1'),
      'POST',
      '/session/context',
    ],
    ['getDeviceInfo', () => client.getDeviceInfo(), 'GET', '/session/device'],
    ['findElements', () => client.findElements(locator), 'POST', '/elements/find'],
    ['waitForElement', () => client.waitForElement(locator), 'POST', '/elements/wait'],
    ['listElements', () => client.listElements(), 'GET', '/elements'],
    ['getElement', () => client.getElement('el-1'), 'GET', '/elements/el-1'],
    ['getText', () => client.getText(target), 'POST', '/actions/text'],
    ['scroll', () => client.scroll({ direction: 'down' }), 'POST', '/actions/scroll'],
    [
      'installApp',
      () => client.installApp({ appPath: '/a.apk' }),
      'POST',
      '/actions/install-app',
    ],
    [
      'terminateApp',
      () => client.terminateApp({ appId: 'com.demo' }),
      'POST',
      '/actions/terminate-app',
    ],
    [
      'executeCommand',
      () => client.executeCommand({ command: 'mobile: scroll' }),
      'POST',
      '/actions/execute',
    ],
    ['getPageSource', () => client.getPageSource(), 'GET', '/actions/page-source'],
    [
      'getAttribute',
      () => client.getAttribute({ ...target, attribute: 'enabled' }),
      'POST',
      '/actions/attribute',
    ],
    [
      'getElementLocation',
      () => client.getElementLocation(target),
      'POST',
      '/actions/location',
    ],
    [
      'performAction',
      () => client.performAction({ type: 'tap', x: 1, y: 2 }),
      'POST',
      '/actions/perform',
    ],
    [
      'startVideoRecording',
      () => client.startVideoRecording(),
      'POST',
      '/actions/video-start',
    ],
    [
      'stopVideoRecording',
      () => client.stopVideoRecording(),
      'POST',
      '/actions/video-stop',
    ],
    ['shutdown', () => client.shutdown(), 'POST', '/daemon/shutdown'],
  ];

  it.each(cases)('%s issues %s %s', async (_name, call, method, path) => {
    await call();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://127.0.0.1:47321${path}`);
    expect(init.method).toBe(method);
  });

  it('escapes an element id that would otherwise change the path', async () => {
    await client.getElement('a/../b');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://127.0.0.1:47321/elements/a%2F..%2Fb',
    );
  });

  it('reports a failed health check as false rather than throwing', async () => {
    fetchMock.mockRejectedValue(new Error('connection refused'));
    await expect(client.healthCheck()).resolves.toBe(false);
  });

  it('reports a healthy daemon as true', async () => {
    await expect(client.healthCheck()).resolves.toBe(true);
  });

  it('unwraps the boolean the daemon reports for terminateApp', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { terminated: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(client.terminateApp({ appId: 'com.demo' })).resolves.toBe(true);
  });
});
