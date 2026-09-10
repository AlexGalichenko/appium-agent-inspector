import { describe, expect, it } from 'vitest';
import { swipeVector } from '../../src/daemon/routes/action.routes.js';

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
