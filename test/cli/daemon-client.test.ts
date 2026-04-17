import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DaemonNotRunningError } from '../../src/shared/errors.js';
import { DaemonClient } from '../../src/cli/daemon-client.js';

vi.mock('../../src/daemon/pid-file.js', () => ({
  readDaemonState: vi.fn(),
  isDaemonProcessAlive: vi.fn(),
}));

const SESSION_META = {
  sessionId: 'sess-1',
  capabilities: {},
  startedAt: '2026-01-01T00:00:00.000Z',
};

function makeOkResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeErrorResponse(code: string, message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('DaemonClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  // ── fromDaemonState ───────────────────────────────────────────────────────

  describe('fromDaemonState', () => {
    it('throws DaemonNotRunningError when state file is absent', async () => {
      const { readDaemonState } = await import('../../src/daemon/pid-file.js');
      vi.mocked(readDaemonState).mockResolvedValueOnce(null);
      await expect(DaemonClient.fromDaemonState()).rejects.toThrow(DaemonNotRunningError);
    });

    it('throws DaemonNotRunningError when process is dead', async () => {
      const { readDaemonState, isDaemonProcessAlive } = await import('../../src/daemon/pid-file.js');
      vi.mocked(readDaemonState).mockResolvedValueOnce({ pid: 1, port: 47321, startedAt: '' });
      vi.mocked(isDaemonProcessAlive).mockReturnValueOnce(false);
      await expect(DaemonClient.fromDaemonState()).rejects.toThrow(DaemonNotRunningError);
    });

    it('returns a DaemonClient when daemon is alive', async () => {
      const { readDaemonState, isDaemonProcessAlive } = await import('../../src/daemon/pid-file.js');
      vi.mocked(readDaemonState).mockResolvedValueOnce({ pid: 1234, port: 47321, startedAt: '' });
      vi.mocked(isDaemonProcessAlive).mockReturnValueOnce(true);
      const client = await DaemonClient.fromDaemonState();
      expect(client).toBeInstanceOf(DaemonClient);
    });
  });

  // ── request success / failure ────────────────────────────────────────────

  describe('request handling', () => {
    let client: DaemonClient;

    beforeEach(() => {
      client = DaemonClient.default();
    });

    it('returns data from an ok response', async () => {
      fetchMock.mockResolvedValueOnce(makeOkResponse(SESSION_META, 201));
      const result = await client.startSession({
        capabilities: {
          platformName: 'iOS',
          'appium:automationName': 'XCUITest',
          'appium:deviceName': 'iPhone 15',
        },
      });
      expect(result).toEqual(SESSION_META);
    });

    it('throws with code and message from error response', async () => {
      fetchMock.mockResolvedValueOnce(makeErrorResponse('SESSION_ALREADY_ACTIVE', 'Already active'));
      await expect(
        client.startSession({
          capabilities: {
            platformName: 'iOS',
            'appium:automationName': 'XCUITest',
            'appium:deviceName': 'iPhone 15',
          },
        }),
      ).rejects.toMatchObject({ message: 'Already active', code: 'SESSION_ALREADY_ACTIVE' });
    });
  });

  // ── individual methods ────────────────────────────────────────────────────

  describe('endSession', () => {
    it('sends DELETE /session', async () => {
      const client = DaemonClient.default();
      fetchMock.mockResolvedValueOnce(makeOkResponse({ message: 'closed' }));
      await client.endSession();
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/session'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('findElement', () => {
    it('sends POST /elements/find with strategy and selector', async () => {
      const client = DaemonClient.default();
      const responseData = { elementId: 'e1', selector: '~btn', strategy: 'accessibility id', foundAt: '' };
      fetchMock.mockResolvedValueOnce(makeOkResponse(responseData));
      const result = await client.findElement({ strategy: 'accessibility id', selector: '~btn' });
      expect(result.elementId).toBe('e1');
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/elements/find'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('click', () => {
    it('sends POST /actions/click with elementId', async () => {
      const client = DaemonClient.default();
      fetchMock.mockResolvedValueOnce(makeOkResponse({ message: 'Clicked' }));
      await client.click({ elementId: 'e1' });
      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/actions/click');
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body as string)).toEqual({ elementId: 'e1' });
    });
  });

  describe('type', () => {
    it('sends POST /actions/type with text', async () => {
      const client = DaemonClient.default();
      fetchMock.mockResolvedValueOnce(makeOkResponse({ message: 'Text entered' }));
      await client.type({ elementId: 'e1', text: 'hello', clearFirst: false });
      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/actions/type');
      expect(JSON.parse(opts.body as string).text).toBe('hello');
    });
  });

  describe('getPageSource', () => {
    it('sends GET /actions/page-source and returns source', async () => {
      const client = DaemonClient.default();
      fetchMock.mockResolvedValueOnce(
        makeOkResponse({ source: '<xml/>', capturedAt: '2026-01-01T00:00:00.000Z' }),
      );
      const result = await client.getPageSource();
      expect(result.source).toBe('<xml/>');
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/actions/page-source'),
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  describe('healthCheck', () => {
    it('returns true when daemon responds ok', async () => {
      const client = DaemonClient.default();
      fetchMock.mockResolvedValueOnce(makeOkResponse({ status: 'ok' }));
      expect(await client.healthCheck()).toBe(true);
    });

    it('returns false when fetch throws', async () => {
      const client = DaemonClient.default();
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      expect(await client.healthCheck()).toBe(false);
    });
  });
});
