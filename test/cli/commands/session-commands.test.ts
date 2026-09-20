import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '../../../src/shared/errors.js';
import { registerConnect } from '../../../src/cli/commands/connect.command.js';
import { registerDeleteSession } from '../../../src/cli/commands/delete-session.command.js';
import { registerSessionStatus } from '../../../src/cli/commands/session-status.command.js';
import { registerContext } from '../../../src/cli/commands/context.command.js';
import { registerDeviceInfo } from '../../../src/cli/commands/device-info.command.js';
import { registerActivateApp } from '../../../src/cli/commands/activate-app.command.js';
import { registerTerminateApp } from '../../../src/cli/commands/terminate-app.command.js';
import { registerInstallApp } from '../../../src/cli/commands/install-app.command.js';
import { registerExecute } from '../../../src/cli/commands/execute.command.js';
import { registerPerformAction } from '../../../src/cli/commands/perform-action.command.js';
import { firstArg, resolves, runCommand, runJson, useClient } from './helpers.js';

vi.mock('../../../src/cli/daemon-client.js', () => ({
  DaemonClient: { fromDaemonState: vi.fn() },
}));

afterEach(() => vi.restoreAllMocks());

const CAPS = '{"platformName":"iOS","appium:automationName":"XCUITest"}';

describe('connect', () => {
  let startSession: ReturnType<typeof resolves>;

  beforeEach(() => {
    startSession = resolves({
      sessionId: 'sess-1',
      capabilities: {},
      startedAt: '2026-01-01T00:00:00.000Z',
    });
    useClient({ startSession });
  });

  it('defaults to the local Appium server', async () => {
    await runCommand(registerConnect, ['connect', '--caps', CAPS]);
    expect(firstArg(startSession).server).toEqual({
      hostname: 'localhost',
      port: 4723,
      path: '/',
    });
  });

  it('overrides the server from flags', async () => {
    await runCommand(registerConnect, [
      'connect',
      '--caps',
      CAPS,
      '--server-host',
      'grid.internal',
      '--server-port',
      '4444',
      '--server-path',
      '/wd/hub',
    ]);
    expect(firstArg(startSession).server).toEqual({
      hostname: 'grid.internal',
      port: 4444,
      path: '/wd/hub',
    });
  });

  it('canonicalises a lower-case platform name', async () => {
    await runCommand(registerConnect, [
      'connect',
      '--caps',
      '{"platformName":"ios","appium:automationName":"xcuitest"}',
    ]);
    const caps = firstArg(startSession).capabilities as Record<string, string>;
    expect(caps['platformName']).toBe('iOS');
    expect(caps['appium:automationName']).toBe('XCUITest');
  });

  it('rejects capabilities missing an automation name', async () => {
    await expect(
      runCommand(registerConnect, ['connect', '--caps', '{"platformName":"iOS"}']),
    ).rejects.toThrow(ValidationError);
    expect(startSession).not.toHaveBeenCalled();
  });

  it('rejects an unknown platform', async () => {
    await expect(
      runCommand(registerConnect, [
        'connect',
        '--caps',
        '{"platformName":"Symbian","appium:automationName":"X"}',
      ]),
    ).rejects.toThrow(/Invalid capabilities/);
  });

  it('rejects an out-of-range --server-port before connecting', async () => {
    await expect(
      runCommand(registerConnect, ['connect', '--caps', CAPS, '--server-port', '70000']),
    ).rejects.toThrow(/--server-port/);
    expect(startSession).not.toHaveBeenCalled();
  });

  it('reports the new session id', async () => {
    const lines = await runCommand(registerConnect, ['connect', '--caps', CAPS]);
    expect(lines[0]).toBe('Session started: sess-1');
  });

  it('requires --caps', async () => {
    await expect(runCommand(registerConnect, ['connect'])).rejects.toThrow(/--caps/);
  });
});

describe('delete-session', () => {
  it('ends the session and says so', async () => {
    const endSession = resolves();
    useClient({ endSession });
    expect(await runCommand(registerDeleteSession, ['delete-session'])).toEqual([
      'Session closed.',
    ]);
    expect(endSession).toHaveBeenCalledOnce();
  });

  it('reports closure under --json', async () => {
    useClient({ endSession: resolves() });
    expect(await runJson(registerDeleteSession, ['delete-session'])).toEqual({
      closed: true,
    });
  });
});

describe('session-status', () => {
  it('points at connect when nothing is active', async () => {
    useClient({ getSessionStatus: resolves({ active: false }) });
    const lines = await runCommand(registerSessionStatus, ['session-status']);
    expect(lines.join('\n')).toMatch(/No active session.*connect/);
  });

  it('shows the id and start time of an active session', async () => {
    useClient({
      getSessionStatus: resolves({
        active: true,
        sessionId: 'sess-1',
        startedAt: '2026-01-01T00:00:00.000Z',
      }),
    });
    expect(await runCommand(registerSessionStatus, ['session-status'])).toEqual([
      'Active session: sess-1',
      'Started at: 2026-01-01T00:00:00.000Z',
    ]);
  });
});

describe('context', () => {
  const contexts = { current: 'NATIVE_APP', contexts: ['NATIVE_APP', 'WEBVIEW_1'] };

  it('lists contexts and marks the current one', async () => {
    useClient({ getContexts: resolves(contexts), switchContext: resolves() });
    expect(await runCommand(registerContext, ['context'])).toEqual([
      '* NATIVE_APP',
      '  WEBVIEW_1',
    ]);
  });

  it('switches instead of listing when --switch is given', async () => {
    const switchContext = resolves({ ...contexts, current: 'WEBVIEW_1' });
    const getContexts = resolves(contexts);
    useClient({ getContexts, switchContext });

    const lines = await runCommand(registerContext, ['context', '--switch', 'WEBVIEW_1']);

    expect(getContexts).not.toHaveBeenCalled();
    expect(switchContext).toHaveBeenCalledWith('WEBVIEW_1');
    expect(lines).toEqual(['  NATIVE_APP', '* WEBVIEW_1']);
  });
});

describe('device-info', () => {
  it('renders every field of a full response', async () => {
    useClient({
      getDeviceInfo: resolves({
        platformName: 'iOS',
        platformVersion: '18.2',
        deviceName: 'iPhone 16',
        window: { width: 393, height: 852 },
        orientation: 'PORTRAIT',
        context: 'NATIVE_APP',
      }),
    });
    expect(await runCommand(registerDeviceInfo, ['device-info'])).toEqual([
      'Platform: iOS 18.2',
      'Device: iPhone 16',
      'Screen: 393x852',
      'Orientation: PORTRAIT',
      'Context: NATIVE_APP',
    ]);
  });

  it('substitutes placeholders for fields the driver did not report', async () => {
    useClient({
      getDeviceInfo: resolves({
        platformName: null,
        platformVersion: null,
        deviceName: null,
        window: { width: 1080, height: 1920 },
        orientation: null,
        context: null,
      }),
    });
    const lines = await runCommand(registerDeviceInfo, ['device-info']);
    // A null version must not leave a trailing space on the platform line.
    expect(lines[0]).toBe('Platform: ?');
    expect(lines).toContain('Orientation: ?');
  });
});

describe('activate-app / terminate-app', () => {
  it('activates the app named by the argument', async () => {
    const activateApp = resolves();
    useClient({ activateApp });
    const lines = await runCommand(registerActivateApp, ['activate-app', 'com.demo']);
    expect(activateApp).toHaveBeenCalledWith({ appId: 'com.demo' });
    expect(lines).toEqual(['Activated com.demo.']);
  });

  it('requires an app id to activate', async () => {
    useClient({ activateApp: resolves() });
    await expect(runCommand(registerActivateApp, ['activate-app'])).rejects.toThrow();
  });

  it('confirms a termination that stopped a running app', async () => {
    useClient({ terminateApp: resolves(true) });
    expect(await runCommand(registerTerminateApp, ['terminate-app', 'com.demo'])).toEqual(
      ['Terminated com.demo.'],
    );
  });

  it('says so when the app was not running', async () => {
    useClient({ terminateApp: resolves(false) });
    expect(await runCommand(registerTerminateApp, ['terminate-app', 'com.demo'])).toEqual(
      ['com.demo was not running.'],
    );
  });

  it('reports the terminated flag under --json', async () => {
    useClient({ terminateApp: resolves(false) });
    expect(await runJson(registerTerminateApp, ['terminate-app', 'com.demo'])).toEqual({
      terminated: false,
      appId: 'com.demo',
    });
  });
});

describe('install-app', () => {
  it('leaves an absolute path untouched', async () => {
    const installApp = resolves();
    useClient({ installApp });
    await runCommand(registerInstallApp, ['install-app', '/tmp/app.apk']);
    expect(installApp).toHaveBeenCalledWith({ appPath: '/tmp/app.apk' });
  });

  it('leaves a URL untouched for a remote Appium host to fetch', async () => {
    const installApp = resolves();
    useClient({ installApp });
    await runCommand(registerInstallApp, ['install-app', 'https://ex.com/app.apk']);
    expect(installApp).toHaveBeenCalledWith({ appPath: 'https://ex.com/app.apk' });
  });

  it('passes a non-existent relative path through unchanged', async () => {
    const installApp = resolves();
    useClient({ installApp });
    await runCommand(registerInstallApp, ['install-app', 'no/such/app.apk']);
    expect(installApp).toHaveBeenCalledWith({ appPath: 'no/such/app.apk' });
  });
});

describe('execute', () => {
  let executeCommand: ReturnType<typeof resolves>;

  beforeEach(() => {
    executeCommand = resolves({ result: { ok: 1 } });
    useClient({ executeCommand });
  });

  it('sends the command with no params when none are given', async () => {
    await runCommand(registerExecute, ['execute', '--command', 'mobile: scroll']);
    expect(firstArg(executeCommand)).toEqual({
      command: 'mobile: scroll',
      params: undefined,
    });
  });

  it('parses --params into an object', async () => {
    await runCommand(registerExecute, [
      'execute',
      '--command',
      'mobile: scroll',
      '--params',
      '{"direction":"down"}',
    ]);
    expect(firstArg(executeCommand).params).toEqual({ direction: 'down' });
  });

  it('rejects malformed --params JSON', async () => {
    await expect(
      runCommand(registerExecute, ['execute', '--command', 'x', '--params', '{oops']),
    ).rejects.toThrow(/--params is not valid JSON/);
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it('rejects a JSON array for --params', async () => {
    await expect(
      runCommand(registerExecute, ['execute', '--command', 'x', '--params', '[1,2]']),
    ).rejects.toThrow(/must be a JSON object/);
  });

  it('rejects a JSON scalar for --params', async () => {
    await expect(
      runCommand(registerExecute, ['execute', '--command', 'x', '--params', '7']),
    ).rejects.toThrow(/must be a JSON object/);
  });

  it('rejects a JSON null for --params', async () => {
    await expect(
      runCommand(registerExecute, ['execute', '--command', 'x', '--params', 'null']),
    ).rejects.toThrow(/must be a JSON object/);
  });

  it('pretty-prints an object result', async () => {
    const lines = await runCommand(registerExecute, ['execute', '--command', 'x']);
    expect(lines.join('\n')).toBe('Result: {\n  "ok": 1\n}');
  });

  it('renders a null result as text rather than printing nothing', async () => {
    useClient({ executeCommand: resolves({ result: null }) });
    const lines = await runCommand(registerExecute, ['execute', '--command', 'x']);
    expect(lines).toEqual(['Result: null']);
  });

  it('renders an undefined result as text', async () => {
    useClient({ executeCommand: resolves({ result: undefined }) });
    const lines = await runCommand(registerExecute, ['execute', '--command', 'x']);
    expect(lines).toEqual(['Result: undefined']);
  });
});

describe('perform-action', () => {
  it('forwards a parsed gesture object', async () => {
    const performAction = resolves({ message: 'tap performed' });
    useClient({ performAction });

    await runCommand(registerPerformAction, [
      'perform-action',
      '{"type":"tap","x":10,"y":20}',
    ]);

    expect(performAction).toHaveBeenCalledWith({ type: 'tap', x: 10, y: 20 });
  });

  it('forwards a raw W3C actions array', async () => {
    const performAction = resolves({ message: 'actions performed' });
    useClient({ performAction });

    await runCommand(registerPerformAction, ['perform-action', '[{"type":"pointer"}]']);

    expect(performAction).toHaveBeenCalledWith([{ type: 'pointer' }]);
  });

  it('echoes the daemon message', async () => {
    useClient({ performAction: resolves({ message: 'swipe performed' }) });
    const lines = await runCommand(registerPerformAction, [
      'perform-action',
      '{"type":"swipe"}',
    ]);
    expect(lines).toEqual(['swipe performed']);
  });

  it('rejects malformed JSON before contacting the daemon', async () => {
    const performAction = resolves();
    useClient({ performAction });
    await expect(
      runCommand(registerPerformAction, ['perform-action', 'not json']),
    ).rejects.toThrow(/not valid JSON/);
    expect(performAction).not.toHaveBeenCalled();
  });
});
