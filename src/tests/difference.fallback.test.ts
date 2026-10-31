/**
 * Regression: the member-wise fallback of `differenceMP`.
 *
 * `polygon-clipping` returns an empty result when one member of the subtrahend
 * is degenerate. `differenceMP` then subtracts member by member so one bad
 * shape cannot erase the whole sheet — but the fallback used to build its
 * argument as `[toClip([poly]) as never]`, i.e. a ClipMulti nested inside a
 * ClipMulti. The engine rejected it, every per-member call came back empty, and
 * the fallback silently subtracted *nothing*.
 *
 * The test injects the documented failure (first boolean call returns empty)
 * and checks that the good member is still subtracted. It is deliberately a
 * mock: the failure mode is inside a third-party library and cannot be
 * reproduced with a well-formed polygon.
 */

import { describe, expect, it, vi } from 'vitest';

import type { MultiPolygon } from '../geometry/polygon';

const state = vi.hoisted(() => ({ calls: 0, failNext: false }));

vi.mock('../geometry/clip', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../geometry/clip')>();
  return {
    ...actual,
    clipDifference: (a: Parameters<typeof actual.clipDifference>[0], b: Parameters<typeof actual.clipDifference>[1]) => {
      state.calls += 1;
      // Only the armed one-shot call fails; the fallback's per-member calls go
      // through the real implementation.
      if (state.failNext) {
        state.failNext = false;
        return [];
      }
      return actual.clipDifference(a, b);
    },
  };
});

const { differenceMP, multiPolygonArea } = await import('../geometry/polygon');

const box = (x: number, y: number, s: number): MultiPolygon => [
  [
    [
      { x, y },
      { x: x + s, y },
      { x: x + s, y: y + s },
      { x, y: y + s },
    ],
  ],
];

describe('review: differenceMP fallback', () => {
  it('subtracts the good members even when the one-shot call fails', () => {
    state.calls = 0;
    state.failNext = true;
    const a = [...box(0, 0, 1), ...box(3, 0, 1)]; // area 2, two disjoint squares
    // The subtrahend is *smaller* than A (area 1), so the "covers everything"
    // shortcut is not taken and the fallback really runs. The second member is
    // a degenerate ring, which is what used to poison the one-shot call.
    const b: MultiPolygon = [
      ...box(0, 0, 1),
      [[{ x: 4, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 4 }]],
    ];
    expect(multiPolygonArea(a)).toBeCloseTo(2, 12);

    const out = differenceMP(a, b);
    // Old behaviour: the fallback did nothing and returned both squares (area 2).
    expect(multiPolygonArea(out)).toBeCloseTo(1, 9);
    for (const p of out.flat(2)) expect(p.x).toBeGreaterThan(1); // only the far square
    expect(state.calls).toBeGreaterThan(1);
  });

  it('still returns the input when the subtrahend really covers it', () => {
    state.calls = 0;
    state.failNext = true;
    const a = box(0, 0, 1);
    const out = differenceMP(a, box(-1, -1, 3));
    expect(out).toHaveLength(0);
  });

  it('a huge but far-away subtrahend does not erase the sheet', () => {
    // Area alone used to be the coverage test: B far away with a bigger area
    // made the one-shot result (empty) indistinguishable from "B covers A".
    state.calls = 0;
    state.failNext = true;
    const a = box(0, 0, 1);
    const out = differenceMP(a, box(100, 100, 10));
    expect(multiPolygonArea(out)).toBeCloseTo(1, 9);
  });

  it('does not call the fallback for a disjoint subtrahend', () => {
    state.calls = 0;
    state.failNext = false;
    const a = box(0, 0, 1);
    const out = differenceMP(a, box(5, 5, 1));
    expect(multiPolygonArea(out)).toBeCloseTo(1, 12);
    expect(state.calls).toBe(1); // one-shot only, no per-member retry
  });
});
