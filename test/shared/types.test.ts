import { describe, expect, it } from 'vitest';
import {
  ActivateAppRequestSchema,
  AppiumCapabilitiesSchema,
  AppiumServerConfigSchema,
  ClickRequestSchema,
  FindElementRequestSchema,
  LocatorStrategySchema,
  PerformActionRequestSchema,
  StartSessionRequestSchema,
  TerminateAppRequestSchema,
  TypeRequestSchema,
} from '../../src/shared/types.js';

const validIosCaps = {
  platformName: 'iOS' as const,
  'appium:automationName': 'XCUITest' as const,
  'appium:deviceName': 'iPhone 15',
};

const validAndroidCaps = {
  platformName: 'Android' as const,
  'appium:automationName': 'UiAutomator2' as const,
  'appium:deviceName': 'emulator-5554',
};

describe('LocatorStrategySchema', () => {
  it.each([
    'accessibility id',
    'id',
    'xpath',
    'class name',
    '-android uiautomator',
    '-ios predicate string',
    '-ios class chain',
    'css selector',
  ])('accepts "%s"', (strategy) => {
    expect(LocatorStrategySchema.safeParse(strategy).success).toBe(true);
  });

  it('rejects unknown strategies', () => {
    expect(LocatorStrategySchema.safeParse('unknown').success).toBe(false);
  });
});

describe('AppiumCapabilitiesSchema', () => {
  it('accepts minimal iOS capabilities', () => {
    const result = AppiumCapabilitiesSchema.safeParse(validIosCaps);
    expect(result.success).toBe(true);
  });

  it('accepts minimal Android capabilities', () => {
    const result = AppiumCapabilitiesSchema.safeParse(validAndroidCaps);
    expect(result.success).toBe(true);
  });

  it('accepts all optional iOS fields', () => {
    const result = AppiumCapabilitiesSchema.safeParse({
      ...validIosCaps,
      'appium:udid': '00008101',
      'appium:bundleId': 'com.example.app',
      'appium:platformVersion': '17.0',
      'appium:noReset': true,
    });
    expect(result.success).toBe(true);
  });

  it('passes through unknown appium: keys', () => {
    const result = AppiumCapabilitiesSchema.safeParse({
      ...validIosCaps,
      'appium:customCap': 'value',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data['appium:customCap']).toBe('value');
    }
  });

  it('rejects invalid platformName', () => {
    const result = AppiumCapabilitiesSchema.safeParse({
      ...validIosCaps,
      platformName: 'Windows',
    });
    expect(result.success).toBe(false);
  });

});

describe('AppiumServerConfigSchema', () => {
  it('applies defaults when input is empty', () => {
    const result = AppiumServerConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hostname).toBe('localhost');
      expect(result.data.port).toBe(4723);
      expect(result.data.path).toBe('/');
    }
  });

  it('accepts explicit values', () => {
    const result = AppiumServerConfigSchema.safeParse({
      hostname: '192.168.1.1',
      port: 4724,
      path: '/wd/hub',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hostname).toBe('192.168.1.1');
      expect(result.data.port).toBe(4724);
    }
  });

  it('rejects a non-integer port', () => {
    const result = AppiumServerConfigSchema.safeParse({ port: 'not-a-number' });
    expect(result.success).toBe(false);
  });
});

describe('StartSessionRequestSchema', () => {
  it('accepts capabilities with no server config', () => {
    const result = StartSessionRequestSchema.safeParse({ capabilities: validIosCaps });
    expect(result.success).toBe(true);
  });

  it('accepts capabilities with partial server config', () => {
    const result = StartSessionRequestSchema.safeParse({
      capabilities: validIosCaps,
      server: { port: 4724 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing capabilities', () => {
    const result = StartSessionRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('FindElementRequestSchema', () => {
  it('accepts a valid strategy and selector', () => {
    const result = FindElementRequestSchema.safeParse({
      strategy: 'xpath',
      selector: '//XCUIElementTypeButton',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty selector', () => {
    const result = FindElementRequestSchema.safeParse({ strategy: 'xpath', selector: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid strategy', () => {
    const result = FindElementRequestSchema.safeParse({ strategy: 'bad', selector: '~btn' });
    expect(result.success).toBe(false);
  });
});

describe('ClickRequestSchema', () => {
  it('accepts elementId form', () => {
    const result = ClickRequestSchema.safeParse({ elementId: 'abc123' });
    expect(result.success).toBe(true);
  });

  it('accepts strategy+selector form', () => {
    const result = ClickRequestSchema.safeParse({
      strategy: 'accessibility id',
      selector: 'Login',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty elementId', () => {
    const result = ClickRequestSchema.safeParse({ elementId: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing selector in strategy form', () => {
    const result = ClickRequestSchema.safeParse({ strategy: 'xpath' });
    expect(result.success).toBe(false);
  });
});

describe('ActivateAppRequestSchema', () => {
  it('accepts a valid appId', () => {
    expect(ActivateAppRequestSchema.safeParse({ appId: 'com.example.app' }).success).toBe(true);
  });

  it('rejects missing appId', () => {
    expect(ActivateAppRequestSchema.safeParse({}).success).toBe(false);
  });

  it('rejects empty appId', () => {
    expect(ActivateAppRequestSchema.safeParse({ appId: '' }).success).toBe(false);
  });
});

describe('TerminateAppRequestSchema', () => {
  it('accepts a valid appId', () => {
    expect(TerminateAppRequestSchema.safeParse({ appId: 'com.example.app' }).success).toBe(true);
  });

  it('rejects missing appId', () => {
    expect(TerminateAppRequestSchema.safeParse({}).success).toBe(false);
  });

  it('rejects empty appId', () => {
    expect(TerminateAppRequestSchema.safeParse({ appId: '' }).success).toBe(false);
  });
});

describe('PerformActionRequestSchema', () => {
  describe('tap', () => {
    it('accepts valid tap and applies default duration of 0', () => {
      const result = PerformActionRequestSchema.safeParse({ type: 'tap', x: 100, y: 200 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as { duration: number }).duration).toBe(0);
      }
    });

    it('accepts explicit duration', () => {
      expect(
        PerformActionRequestSchema.safeParse({ type: 'tap', x: 100, y: 200, duration: 500 }).success,
      ).toBe(true);
    });

    it('rejects missing x', () => {
      expect(PerformActionRequestSchema.safeParse({ type: 'tap', y: 200 }).success).toBe(false);
    });

    it('rejects missing y', () => {
      expect(PerformActionRequestSchema.safeParse({ type: 'tap', x: 100 }).success).toBe(false);
    });

    it('rejects negative duration', () => {
      expect(
        PerformActionRequestSchema.safeParse({ type: 'tap', x: 100, y: 200, duration: -1 }).success,
      ).toBe(false);
    });
  });

  describe('swipe', () => {
    const validSwipe = { type: 'swipe', startX: 100, startY: 500, endX: 100, endY: 200 };

    it('accepts valid swipe and applies default duration of 1000', () => {
      const result = PerformActionRequestSchema.safeParse(validSwipe);
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as { duration: number }).duration).toBe(1000);
      }
    });

    it('accepts explicit duration', () => {
      expect(PerformActionRequestSchema.safeParse({ ...validSwipe, duration: 300 }).success).toBe(true);
    });

    it('rejects missing start coordinates', () => {
      expect(
        PerformActionRequestSchema.safeParse({ type: 'swipe', endX: 100, endY: 200 }).success,
      ).toBe(false);
    });

    it('rejects missing end coordinates', () => {
      expect(
        PerformActionRequestSchema.safeParse({ type: 'swipe', startX: 100, startY: 500 }).success,
      ).toBe(false);
    });
  });

  describe('long-press', () => {
    it('accepts valid long-press and applies default duration of 1500', () => {
      const result = PerformActionRequestSchema.safeParse({ type: 'long-press', x: 200, y: 400 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as { duration: number }).duration).toBe(1500);
      }
    });

    it('accepts explicit duration', () => {
      expect(
        PerformActionRequestSchema.safeParse({ type: 'long-press', x: 200, y: 400, duration: 2000 }).success,
      ).toBe(true);
    });

    it('rejects missing coordinates', () => {
      expect(PerformActionRequestSchema.safeParse({ type: 'long-press' }).success).toBe(false);
    });
  });

  describe('raw W3C actions array', () => {
    it('accepts a non-empty actions array', () => {
      const result = PerformActionRequestSchema.safeParse([
        { type: 'pointer', id: 'finger1', parameters: { pointerType: 'touch' }, actions: [] },
      ]);
      expect(result.success).toBe(true);
    });

    it('accepts an empty array', () => {
      expect(PerformActionRequestSchema.safeParse([]).success).toBe(true);
    });

    it('rejects an unknown gesture type object', () => {
      expect(
        PerformActionRequestSchema.safeParse({ type: 'double-tap', x: 100, y: 200 }).success,
      ).toBe(false);
    });

    it('rejects a plain string', () => {
      expect(PerformActionRequestSchema.safeParse('tap').success).toBe(false);
    });

    it('rejects a number', () => {
      expect(PerformActionRequestSchema.safeParse(42).success).toBe(false);
    });
  });
});

describe('TypeRequestSchema', () => {
  it('accepts elementId + text', () => {
    const result = TypeRequestSchema.safeParse({ elementId: 'abc', text: 'hello' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.clearFirst).toBe(false);
  });

  it('accepts strategy+selector + text with clearFirst', () => {
    const result = TypeRequestSchema.safeParse({
      strategy: 'id',
      selector: 'username',
      text: 'admin',
      clearFirst: true,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.clearFirst).toBe(true);
  });

  it('rejects missing text', () => {
    const result = TypeRequestSchema.safeParse({ elementId: 'abc' });
    expect(result.success).toBe(false);
  });
});
