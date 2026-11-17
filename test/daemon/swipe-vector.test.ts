import { describe, expect, it, vi } from 'vitest';
import {
  isInView,
  swipeBand,
  swipeVector,
} from '../../src/daemon/routes/action.routes.js';

const W = 400;
const H = 800;

describe('swipeVector', () => {
  it('drags upward to scroll down, revealing content below', () => {
    const v = swipeVector('down', 0.6, W, H);
    expect(v.startY).toBeGreaterThan(v.endY);
  });

  it('drags downward to scroll up', () => {
    const v = swipeVector('up', 0.6, W, H);
    expect(v.startY).toBeLessThan(v.endY);
  });

  it('drags leftward to scroll right', () => {
    const v = swipeVector('right', 0.6, W, H);
    expect(v.startX).toBeGreaterThan(v.endX);
  });

  it('drags rightward to scroll left', () => {
    const v = swipeVector('left', 0.6, W, H);
    expect(v.startX).toBeLessThan(v.endX);
  });

  it('keeps vertical swipes horizontally centred', () => {
    const v = swipeVector('down', 0.6, W, H);
    expect(v.startX).toBe(W / 2);
    expect(v.endX).toBe(W / 2);
  });

  it('keeps horizontal swipes vertically centred', () => {
    const v = swipeVector('left', 0.6, W, H);
    expect(v.startY).toBe(H / 2);
    expect(v.endY).toBe(H / 2);
  });

  it('travels the requested fraction of the screen', () => {
    const v = swipeVector('down', 0.5, W, H);
    expect(Math.abs(v.startY - v.endY)).toBe(H * 0.5);
  });

  it('stays inside the screen for the largest allowed percent', () => {
    for (const direction of ['up', 'down', 'left', 'right'] as const) {
      const v = swipeVector(direction, 0.95, W, H);
      for (const x of [v.startX, v.endX]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(W);
      }
      for (const y of [v.startY, v.endY]) {
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(H);
      }
    }
  });

  it('produces integer coordinates for odd screen sizes', () => {
    const v = swipeVector('down', 0.33, 411, 731);
    for (const n of [v.startX, v.startY, v.endX, v.endY]) {
      expect(Number.isInteger(n)).toBe(true);
    }
  });
});

describe('swipeBand', () => {
  const manager = {
    withoutImplicitWait: (fn: () => Promise<unknown>) => fn(),
  } as never;
  const driver = (shown: boolean | Error, keyboardTop?: number) =>
    ({
      isKeyboardShown:
        shown instanceof Error
          ? vi.fn().mockRejectedValue(shown)
          : vi.fn().mockResolvedValue(shown),
      $$: vi
        .fn()
        .mockResolvedValue(
          keyboardTop === undefined
            ? []
            : [{ getLocation: vi.fn().mockResolvedValue({ x: 0, y: keyboardTop }) }],
        ),
    }) as never;

  it('uses the whole screen when no keyboard is up', async () => {
    expect(await swipeBand(driver(false), 874, manager)).toEqual({ top: 0, bottom: 874 });
  });

  it("runs from below the top bars to the iOS keyboard's top edge", async () => {
    expect(await swipeBand(driver(true, 589), 874, manager)).toEqual({
      top: 175,
      bottom: 589,
    });
  });

  it('assumes the lower 40% when the keyboard is not in the tree (Android)', async () => {
    expect(await swipeBand(driver(true), 1000, manager)).toEqual({
      top: 200,
      bottom: 600,
    });
  });

  it('falls back to the whole screen when the driver cannot tell', async () => {
    expect(await swipeBand(driver(new Error('nope')), 874, manager)).toEqual({
      top: 0,
      bottom: 874,
    });
  });

  it.each(['up', 'down'] as const)(
    'keeps a %s swipe between the top bars and the keyboard',
    (direction) => {
      const v = swipeVector(direction, 0.6, 402, 589, 175);
      for (const y of [v.startY, v.endY]) {
        expect(y).toBeGreaterThanOrEqual(175);
        expect(y).toBeLessThan(589);
      }
    },
  );

  it('matches the old full-screen swipe when there is no keyboard', () => {
    expect(swipeVector('up', 0.6, 400, 800, 0)).toEqual(swipeVector('up', 0.6, 400, 800));
    expect(swipeVector('up', 0.6, 400, 800).startY).toBe(160);
  });
});

describe('isInView', () => {
  const element = (attrs: Record<string, string>) => ({
    getAttribute: vi.fn(async (name: string) => {
      if (!(name in attrs)) throw new Error(`'${name}' attribute is unknown`);
      return attrs[name];
    }),
    isDisplayed: vi.fn().mockResolvedValue(true),
  });

  it('asks Android only for "displayed": an unknown attribute costs seconds there', async () => {
    const el = element({ displayed: 'false' });
    const driver = { isAndroid: true, $$: vi.fn().mockResolvedValue([el]) } as never;
    expect(await isInView(driver, 'id=x')).toBe(false);
    expect(el.getAttribute.mock.calls.map((c) => c[0])).toEqual(['displayed']);
  });

  it('reads "visible" on iOS', async () => {
    const el = element({ visible: 'true' });
    const driver = { isAndroid: false, $$: vi.fn().mockResolvedValue([el]) } as never;
    expect(await isInView(driver, '~x')).toBe(true);
    expect(el.getAttribute).toHaveBeenCalledWith('visible');
  });

  it('is false when nothing matches', async () => {
    const driver = { isAndroid: true, $$: vi.fn().mockResolvedValue([]) } as never;
    expect(await isInView(driver, 'id=x')).toBe(false);
  });
});
