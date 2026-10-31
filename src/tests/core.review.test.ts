/**
 * Core review suite (2026-10-31).
 *
 * These cases exist because a review of the geometry layer found three ways for
 * the engine to *silently* disagree with itself:
 *
 *  1. `differenceMP`'s member-wise fallback nested its input one level too deep,
 *     so the fallback subtracted nothing. (Covered in `difference.fallback`.)
 *  2. `applyCuts` clipped each cut to each patch separately; when a cut edge
 *     coincided with a patch edge, `polygon-clipping` returned an empty
 *     intersection and that layer was reported as untouched. The same stroke,
 *     written with a flipped normal, produced a different sheet.
 *  3. The unfolded `removed` set was a boolean union of eight edge-sharing
 *     copies; the union could drop one, so `paper + removed` was not 4 even
 *     though `paper` was right.
 *
 * The assertions below are the invariants that would have caught all three.
 */

import { describe, expect, it } from 'vitest';

import {
  applyCuts,
  cutFromAngle,
  curveCut,
  curveUnderFlippedNormal,
  notchCut,
  type Cut,
  type CurveCut,
} from '../geometry/cut';
import { FOLD_PRESETS, getPreset, patchesInPaintOrder, transposeMat } from '../geometry/fold';
import {
  PAPER_AREA,
  SQUARE,
  applyMat,
  differenceMP,
  intersectMP,
  multiPolygonArea,
  pointInMultiPolygon,
  pointInRing,
  ringArea,
  ringPerimeter,
  isFiniteMultiPolygon,
  unionMP,
  xorMP,
  type MultiPolygon,
} from '../geometry/polygon';
import { scorePaper } from '../geometry/score';
import { add, clamp, cross, dist, dot, isFiniteVec, length, normalize, perp, round, scale, sub } from '../geometry/vec';
import { LEVELS } from '../puzzle/levels';

const square = (x: number, y: number, s: number): MultiPolygon => [
  [
    [
      { x, y },
      { x: x + s, y },
      { x: x + s, y: y + s },
      { x, y: y + s },
    ],
  ],
];

const CUT_SHAPES: Cut[] = [
  cutFromAngle(22.5, 0.4, 'negative'),
  curveCut(0, 0.99, -0.18, 1, 'positive'),
  notchCut(22.5, 0.45, 0.45),
  { kind: 'hole', shape: 'leaf', angle: 0, radius: 0.6, size: 0.08, stretch: 2.2, rotation: 90 },
];

describe('review: patch decomposition and the unfolded sheet', () => {
  it('every patch is an isometry onto the packet, with an exact inverse', () => {
    for (const preset of FOLD_PRESETS) {
      for (const patch of preset.patches) {
        for (const p of [
          { x: 0.13, y: -0.71 },
          { x: -0.99, y: 0.42 },
          { x: 0.5, y: 0.5 },
        ]) {
          const back = applyMat(transposeMat(patch.forward), applyMat(patch.forward, p));
          expect(back.x, `${preset.id}/${patch.id}`).toBeCloseTo(p.x, 12);
          expect(back.y, `${preset.id}/${patch.id}`).toBeCloseTo(p.y, 12);
        }
        // Domain area is exactly the area of the packet slice.
        expect(Math.abs(multiPolygonArea([[patch.domain]])), `${preset.id}/${patch.id}`).toBeCloseTo(
          multiPolygonArea([[preset.packet]]),
          12,
        );
      }
    }
  });

  it('the patch domains tile the sheet exactly once, for every preset', () => {
    for (const preset of FOLD_PRESETS) {
      const sum = preset.patches.reduce((s, p) => s + Math.abs(multiPolygonArea([[p.domain]])), 0);
      expect(sum, `${preset.id} domains`).toBeCloseTo(PAPER_AREA, 10);
      const u = unionMP(...preset.patches.map((p) => [[p.domain]] as MultiPolygon));
      expect(multiPolygonArea(u), `${preset.id} union`).toBeCloseTo(PAPER_AREA, 10);
    }
  });

  it('keeps paper + removed = the whole sheet for every shipped level', () => {
    // This is the invariant that failed on 团花 before the removed set stopped
    // being a boolean union of eight edge-sharing copies.
    for (const level of LEVELS) {
      const out = applyCuts(level.foldPreset, level.canonicalCuts);
      expect(multiPolygonArea(out.paper) + multiPolygonArea(out.removed), level.id).toBeCloseTo(
        PAPER_AREA,
        6,
      );
    }
  });

  it('the per-patch pieces add up to the sheet they came from', () => {
    for (const level of LEVELS) {
      const out = applyCuts(level.foldPreset, level.canonicalCuts);
      const preset = getPreset(level.foldPreset);
      let kept = 0;
      let lost = 0;
      out.patches.forEach((entry, i) => {
        const domainArea = Math.abs(multiPolygonArea([[preset.patches[i].domain]]));
        const keptArea = multiPolygonArea(entry.region);
        const lostArea = multiPolygonArea(entry.removed);
        expect(keptArea + lostArea, `${level.id}/${entry.patch.id}`).toBeCloseTo(domainArea, 6);
        kept += keptArea;
        lost += lostArea;
      });
      expect(kept, `${level.id} kept`).toBeCloseTo(multiPolygonArea(out.paper), 6);
      expect(lost, `${level.id} lost`).toBeCloseTo(multiPolygonArea(out.removed), 6);
    }
  });

  it('every layer of a folded cut loses the same amount of paper', () => {
    // The eight copies are isometric images of one pre-image: equal area is a
    // cheap proof that no layer was silently left uncut.
    for (const level of LEVELS) {
      const out = applyCuts(level.foldPreset, level.canonicalCuts);
      const areas = out.patches.map((p) => multiPolygonArea(p.removed));
      const first = areas[0];
      for (const a of areas) expect(a, level.id).toBeCloseTo(first, 6);
    }
  });

  it('the order of two cuts does not change the sheet', () => {
    const cases: [string, Cut[]][] = [
      ['line + notch', [cutFromAngle(22.5, 0.26, 'negative'), notchCut(22.5, 0.55, 0.4)]],
      ['curve + line', [curveCut(0, 1.0, -0.16, 1, 'positive'), cutFromAngle(22.5, 0.34, 'negative')]],
      ['two lines', [cutFromAngle(22.5, 0.3, 'negative'), cutFromAngle(0, 0.8, 'positive')]],
    ];
    for (const [name, cuts] of cases) {
      const a = applyCuts('radial8', cuts).paper;
      const b = applyCuts('radial8', [...cuts].reverse()).paper;
      expect(scorePaper(a, b).iou, name).toBeGreaterThan(0.9999);
    }
  });
});

describe('review: the same stroke under a flipped normal', () => {
  it('curveUnderFlippedNormal preserves the sheet, for every bend count', () => {
    for (const bends of [1, 2, 3] as const) {
      for (const amplitude of [-0.3, -0.16, 0.12, 0.28]) {
        for (const side of ['positive', 'negative'] as const) {
          const cut = curveCut(112.5, 0.66, amplitude, bends, side);
          const flipped = curveUnderFlippedNormal(cut);
          const a = applyCuts('radial8', [cut]).paper;
          const b = applyCuts('radial8', [flipped]).paper;
          expect(scorePaper(a, b).iou, `bends=${bends} A=${amplitude} ${side}`).toBeCloseTo(1, 6);
          expect(multiPolygonArea(a), `area bends=${bends} A=${amplitude}`).toBeCloseTo(
            multiPolygonArea(b),
            6,
          );
        }
      }
    }
  });

  it('flipping twice is the identity, and the angle stays on the slider', () => {
    for (const bends of [1, 2, 3] as const) {
      const cut: CurveCut = { kind: 'curve', angle: 67.5, offset: 0.4, amplitude: 0.2, bends, removedSide: 'positive' };
      const twice = curveUnderFlippedNormal(curveUnderFlippedNormal(cut));
      expect(twice.angle).toBeCloseTo(cut.angle, 12);
      expect(twice.offset).toBeCloseTo(cut.offset, 12);
      expect(twice.amplitude).toBeCloseTo(cut.amplitude, 12);
      expect(twice.removedSide).toBe(cut.removedSide);
      // A flip is not meant to stay in [0,180): it is a different normal.
      // The handle only calls this with a negative angle, where +180 lands in
      // the slider's range (checked below).
    }
    // The handle derives a negative angle from the pointer; the helper maps it
    // into the slider's range (this is exactly the old branch's job).
    const neg: CurveCut = { kind: 'curve', angle: -112.5, offset: -0.65, amplitude: -0.2, bends: 2, removedSide: 'positive' };
    const mapped = curveUnderFlippedNormal(neg);
    expect(mapped.angle).toBeCloseTo(67.5, 9);
    expect(mapped.angle).toBeGreaterThanOrEqual(0);
    expect(mapped.angle).toBeLessThan(180);
  });

  it('a straight cut and its flipped normal are the same cut', () => {
    for (const fold of ['none', 'vertical', 'orthogonal2', 'radial8'] as const) {
      const cut = cutFromAngle(31, 0.42, 'positive');
      const direct = applyCuts(fold, [cut]).paper;
      const flipped = applyCuts(fold, [cutFromAngle(31 + 180, -0.42, 'negative')]).paper;
      expect(scorePaper(direct, flipped).iou, fold).toBeCloseTo(1, 8);
    }
  });
});

describe('review: boolean-op contracts that the engine relies on', () => {
  it('union / difference / intersection obey the area identities', () => {
    const a = square(0, 0, 1);
    const b = square(0.5, 0.5, 1);
    const u = unionMP(a, b);
    const i = intersectMP(a, b);
    // area(A ∪ B) + area(A ∩ B) = area(A) + area(B)
    expect(multiPolygonArea(u) + multiPolygonArea(i)).toBeCloseTo(2, 9);
    // area(A \ B) + area(A ∩ B) = area(A)
    expect(multiPolygonArea(differenceMP(a, b)) + multiPolygonArea(i)).toBeCloseTo(1, 9);
    // xor is the symmetric difference
    expect(multiPolygonArea(xorMP(a, b))).toBeCloseTo(
      multiPolygonArea(differenceMP(a, b)) + multiPolygonArea(differenceMP(b, a)),
      9,
    );
    expect(multiPolygonArea(xorMP(a, a))).toBeCloseTo(0, 12);
  });

  it('a covering difference is empty, a disjoint one is the original', () => {
    const a = square(0, 0, 1);
    expect(differenceMP(a, square(-1, -1, 3))).toHaveLength(0);
    const far = square(5, 5, 1);
    expect(multiPolygonArea(differenceMP(a, far))).toBeCloseTo(1, 12);
    expect(differenceMP(a, [])).toEqual(a);
    expect(unionMP()).toEqual([]);
  });

  it('union keeps the good members when one is degenerate', () => {
    const good = square(0, 0, 1);
    const degenerate: MultiPolygon = [[[{ x: 2, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 2 }]]];
    const u = unionMP(good, degenerate);
    expect(multiPolygonArea(u)).toBeCloseTo(1, 9);
  });

  it('point-in-polygon respects holes and the boundary', () => {
    const ring = SQUARE;
    expect(pointInRing({ x: 0, y: 0 }, ring)).toBe(true);
    expect(pointInRing({ x: 1.2, y: 0 }, ring)).toBe(false);
    const withHole: MultiPolygon = [
      [SQUARE, [{ x: -0.5, y: -0.5 }, { x: -0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: -0.5 }]],
    ];
    expect(pointInMultiPolygon({ x: 0.8, y: 0.8 }, withHole)).toBe(true);
    expect(pointInMultiPolygon({ x: 0, y: 0 }, withHole)).toBe(false);
    expect(pointInMultiPolygon({ x: 2, y: 0 }, withHole)).toBe(false);
  });

  it('ring area is signed and polygons subtract their holes', () => {
    expect(ringArea([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }])).toBeCloseTo(0.5, 12);
    expect(ringArea([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 0 }])).toBeCloseTo(-0.5, 12);
    const holed: MultiPolygon = [
      [SQUARE, [{ x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0.5, y: 0.5 }, { x: -0.5, y: 0.5 }]],
    ];
    expect(multiPolygonArea(holed)).toBeCloseTo(3, 12);
  });
});

describe('review: cut shapes stay inside the packet', () => {
  it('every removed region is a subset of the packet, for every preset', () => {
    for (const preset of FOLD_PRESETS) {
      for (const cut of CUT_SHAPES) {
        const out = applyCuts(preset.id, [cut]);
        for (const poly of out.removedPacket) {
          for (const ring of poly) {
            for (const p of ring) {
              expect(p.x, `${preset.id}/${cut.kind}`).toBeGreaterThanOrEqual(-1 - 1e-9);
              expect(p.x).toBeLessThanOrEqual(1 + 1e-9);
              expect(p.y).toBeGreaterThanOrEqual(-1 - 1e-9);
              expect(p.y).toBeLessThanOrEqual(1 + 1e-9);
            }
          }
        }
      }
    }
  });

  it('the paper is always a subset of the sheet and never negative', () => {
    for (const preset of FOLD_PRESETS) {
      for (const cut of CUT_SHAPES) {
        const out = applyCuts(preset.id, [cut]);
        expect(multiPolygonArea(out.paper)).toBeGreaterThanOrEqual(0);
        expect(multiPolygonArea(out.paper)).toBeLessThanOrEqual(PAPER_AREA + 1e-9);
        for (const poly of out.paper) {
          for (const ring of poly) {
            for (const p of ring) {
              expect(Math.max(Math.abs(p.x), Math.abs(p.y))).toBeLessThanOrEqual(1 + 1e-9);
            }
          }
        }
      }
    }
  });

  it('the asymmetric level really is asymmetric, the eightfold one is not', () => {
    // A cheap symmetry audit: the eight-fold group is D4 — four rotations
    // (90° apart) and four mirrors — so a 90° rotation must map the target to
    // itself, and the same rotation must break a two-fold pattern.
    const rot = (mp: MultiPolygon, deg: number): MultiPolygon => {
      const r = (deg * Math.PI) / 180;
      const c = Math.cos(r);
      const s = Math.sin(r);
      return mp.map((p) => p.map((ring) => ring.map((q) => ({ x: c * q.x - s * q.y, y: s * q.x + c * q.y }))));
    };
    const eight = applyCuts('radial8', [notchCut(22.5, 0.45, 0.45)]).paper;
    expect(scorePaper(eight, rot(eight, 90)).iou).toBeGreaterThan(0.999);
    // The 葫芦 silhouette is left-right symmetric, not top-bottom: a quarter
    // turn must change it a lot.
    const two = LEVELS.find((l) => l.id === 'jar')!.target;
    expect(scorePaper(two, rot(two, 90)).iou).toBeLessThan(0.8);
  });
});


describe('review: small helpers the rest of the engine assumes', () => {
  it('vector arithmetic is exact enough to build every other map', () => {
    const p = { x: 3, y: 4 };
    const q = { x: -2, y: 5 };
    expect(add(p, q)).toEqual({ x: 1, y: 9 });
    expect(sub(p, q)).toEqual({ x: 5, y: -1 });
    expect(scale(p, 2)).toEqual({ x: 6, y: 8 });
    expect(dot(p, q)).toBe(14);
    expect(cross(p, q)).toBe(23);
    expect(length(p)).toBe(5);
    expect(dist(p, q)).toBeCloseTo(Math.hypot(5, -1), 12);
    expect(perp(p)).toEqual({ x: -4, y: 3 });
    expect(perp(perp(p))).toEqual({ x: -3, y: -4 });
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(normalize({ x: 0, y: 2 })).toEqual({ x: 0, y: 1 });
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(isFiniteVec(p)).toBe(true);
    expect(isFiniteVec({ x: Number.NaN, y: 0 })).toBe(false);
    expect(round(1.234567, 3)).toBe(1.235);
    expect(round(-1.234567, 2)).toBe(-1.23);
  });

  it('perimeter and finiteness checks reject malformed documents', () => {
    expect(ringPerimeter(SQUARE)).toBeCloseTo(8, 12);
    expect(ringPerimeter([])).toBe(0);
    expect(isFiniteMultiPolygon([[SQUARE]])).toBe(true);
    expect(isFiniteMultiPolygon([])).toBe(true);
    expect(isFiniteMultiPolygon([[]])).toBe(false);
    expect(isFiniteMultiPolygon([[[]]])).toBe(false);
    expect(isFiniteMultiPolygon([[[{ x: 0, y: 0 }, { x: 1, y: 0 }],]])).toBe(false);
    expect(
      isFiniteMultiPolygon([[[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: Number.POSITIVE_INFINITY }]]]),
    ).toBe(false);
  });

  it('patches are painted from the back to the front', () => {
    for (const preset of FOLD_PRESETS) {
      const ordered = patchesInPaintOrder(preset);
      expect(ordered).toHaveLength(preset.patches.length);
      for (let i = 1; i < ordered.length; i++) {
        expect(ordered[i].layer).toBeGreaterThanOrEqual(ordered[i - 1].layer);
      }
    }
  });
});
