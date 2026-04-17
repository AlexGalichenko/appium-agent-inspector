import type { AppiumCapabilities, AppiumServerConfig } from '../shared/types.js';
import {
  APPIUM_DEFAULT_HOST,
  APPIUM_DEFAULT_PATH,
  APPIUM_DEFAULT_PORT,
} from '../shared/constants.js';

export function buildIosCapabilities(opts: {
  deviceName: string;
  bundleId?: string;
  app?: string;
  udid?: string;
  platformVersion?: string;
  noReset?: boolean;
}): AppiumCapabilities {
  return {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:deviceName': opts.deviceName,
    ...(opts.bundleId !== undefined && { 'appium:bundleId': opts.bundleId }),
    ...(opts.app !== undefined && { 'appium:app': opts.app }),
    ...(opts.udid !== undefined && { 'appium:udid': opts.udid }),
    ...(opts.platformVersion !== undefined && {
      'appium:platformVersion': opts.platformVersion,
    }),
    ...(opts.noReset !== undefined && { 'appium:noReset': opts.noReset }),
  };
}

export function buildAndroidCapabilities(opts: {
  deviceName: string;
  appPackage?: string;
  appActivity?: string;
  app?: string;
  udid?: string;
  platformVersion?: string;
  noReset?: boolean;
  useEspresso?: boolean;
}): AppiumCapabilities {
  return {
    platformName: 'Android',
    'appium:automationName': opts.useEspresso === true ? 'Espresso' : 'UiAutomator2',
    'appium:deviceName': opts.deviceName,
    ...(opts.appPackage !== undefined && { 'appium:appPackage': opts.appPackage }),
    ...(opts.appActivity !== undefined && { 'appium:appActivity': opts.appActivity }),
    ...(opts.app !== undefined && { 'appium:app': opts.app }),
    ...(opts.udid !== undefined && { 'appium:udid': opts.udid }),
    ...(opts.platformVersion !== undefined && {
      'appium:platformVersion': opts.platformVersion,
    }),
    ...(opts.noReset !== undefined && { 'appium:noReset': opts.noReset }),
  };
}

export function defaultServerConfig(): AppiumServerConfig {
  return {
    hostname: APPIUM_DEFAULT_HOST,
    port: APPIUM_DEFAULT_PORT,
    path: APPIUM_DEFAULT_PATH,
  };
}
