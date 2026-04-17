import { describe, expect, it } from 'vitest';
import {
  buildAndroidCapabilities,
  buildIosCapabilities,
  defaultServerConfig,
} from '../../src/config/capabilities.js';

describe('buildIosCapabilities', () => {
  it('sets required fields', () => {
    const caps = buildIosCapabilities({ deviceName: 'iPhone 15' });
    expect(caps.platformName).toBe('iOS');
    expect(caps['appium:automationName']).toBe('XCUITest');
    expect(caps['appium:deviceName']).toBe('iPhone 15');
  });

  it('omits optional fields when not provided', () => {
    const caps = buildIosCapabilities({ deviceName: 'iPhone 15' });
    expect('appium:bundleId' in caps).toBe(false);
    expect('appium:app' in caps).toBe(false);
    expect('appium:udid' in caps).toBe(false);
    expect('appium:platformVersion' in caps).toBe(false);
    expect('appium:noReset' in caps).toBe(false);
  });

  it('includes all optional fields when provided', () => {
    const caps = buildIosCapabilities({
      deviceName: 'iPhone 15',
      bundleId: 'com.example.app',
      app: '/path/to/app.ipa',
      udid: '00008101-000ABCDE',
      platformVersion: '17.0',
      noReset: true,
    });
    expect(caps['appium:bundleId']).toBe('com.example.app');
    expect(caps['appium:app']).toBe('/path/to/app.ipa');
    expect(caps['appium:udid']).toBe('00008101-000ABCDE');
    expect(caps['appium:platformVersion']).toBe('17.0');
    expect(caps['appium:noReset']).toBe(true);
  });

  it('includes noReset: false when explicitly set', () => {
    const caps = buildIosCapabilities({ deviceName: 'iPhone 15', noReset: false });
    expect('appium:noReset' in caps).toBe(true);
    expect(caps['appium:noReset']).toBe(false);
  });
});

describe('buildAndroidCapabilities', () => {
  it('defaults to UiAutomator2', () => {
    const caps = buildAndroidCapabilities({ deviceName: 'emulator-5554' });
    expect(caps['appium:automationName']).toBe('UiAutomator2');
  });

  it('uses Espresso when flag is set', () => {
    const caps = buildAndroidCapabilities({ deviceName: 'emulator-5554', useEspresso: true });
    expect(caps['appium:automationName']).toBe('Espresso');
  });

  it('sets required fields', () => {
    const caps = buildAndroidCapabilities({ deviceName: 'Pixel 7' });
    expect(caps.platformName).toBe('Android');
    expect(caps['appium:deviceName']).toBe('Pixel 7');
  });

  it('omits optional fields when not provided', () => {
    const caps = buildAndroidCapabilities({ deviceName: 'Pixel 7' });
    expect('appium:appPackage' in caps).toBe(false);
    expect('appium:appActivity' in caps).toBe(false);
    expect('appium:app' in caps).toBe(false);
  });

  it('includes Android-specific optional fields when provided', () => {
    const caps = buildAndroidCapabilities({
      deviceName: 'Pixel 7',
      appPackage: 'com.example',
      appActivity: '.MainActivity',
      platformVersion: '13',
    });
    expect(caps['appium:appPackage']).toBe('com.example');
    expect(caps['appium:appActivity']).toBe('.MainActivity');
    expect(caps['appium:platformVersion']).toBe('13');
  });
});

describe('defaultServerConfig', () => {
  it('returns localhost:4723 with root path', () => {
    const config = defaultServerConfig();
    expect(config.hostname).toBe('localhost');
    expect(config.port).toBe(4723);
    expect(config.path).toBe('/');
  });
});
