import { describe, expect, it } from 'vitest';

import { applyCuts, cutFromAngle, notchCut, normalizeCut, removedPacketRegion } from '../geometry/cut';
import { getPreset, patchRenderMatrix } from '../geometry/fold';
import {
  PAPER_AREA,
  type MultiPolygon,
  applyMat,
  multiPolygonArea,
  multiPolygonToPath,
  pointInMultiPolygon,
  ringArea,
  unionMP,
} from '../geometry/polygon';
import { scorePaper } from '../geometry/score';
import { LEVELS } from '../puzzle/levels';
import { buildSvg, fileName } from '../services/export';

const D = 0.4 * Math.SQRT2; // diamond L1 radius for offset 0.4 at 45 degrees

describe('geometry: fold model', () => {
  it('no fold, no cut keeps the whole sheet', () => {
    const out = applyCuts('none', []);
    expect(multiPolygonArea(out.paper)).toBeCloseTo(PAPER_AREA, 9);
    expect(out.removed).toHaveLength(0);
    expect(out.warnings).toHaveLength(0);
  });

  it('each patch transform is an isometry and its own inverse', () => {
    for (const id of ['vertical', 'horizontal', 'orthogonal2'] as const) {
      const preset = getPreset(id);
      for (const patch of preset.patches) {
        const pts = [
          { x: 0.13, y: -0.77 },
          { x: -0.42, y: 0.31 },
          { x: 0.9, y: 0.05 },
        ];
        for (const p of pts) {
          const q = applyMat(patch.forward, p);
          const back = applyMat(patch.inverse, q);
          expect(back.x).toBeCloseTo(p.x, 12);
          expect(back.y).toBeCloseTo(p.y, 12);
        }
      }
    }
  });

  it('orthogonal double fold with no cut unfolds back to the full square', () => {
    const out = applyCuts('orthogonal2', []);
    expect(multiPolygonArea(out.paper)).toBeCloseTo(PAPER_AREA, 9);
    expect(out.patches).toHaveLength(4);
  });

  it('foldedness 0 and 1 hit the exact identity / mirror matrices', () => {
    const preset = getPreset('orthogonal2');
    const left = preset.patches.find((p) => p.id === 'q2')!;
    const m0 = patchRenderMatrix(left, preset, 0);
    expect(m0).toEqual({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
    const m1 = patchRenderMatrix(left, preset, 1);
    expect(m1.a).toBeCloseTo(-1, 12);
    expect(m1.d).toBeCloseTo(1, 12);
  });

  it('the fold animation ends exactly at each patch forward map', () => {
    for (const id of ['none', 'vertical', 'horizontal', 'orthogonal2', 'radial8'] as const) {
      const preset = getPreset(id);
      for (const patch of preset.patches) {
        const m = patchRenderMatrix(patch, preset, 1);
        expect(m.a, `${id}/${patch.id}.a`).toBeCloseTo(patch.forward.a, 10);
        expect(m.b, `${id}/${patch.id}.b`).toBeCloseTo(patch.forward.b, 10);
        expect(m.c, `${id}/${patch.id}.c`).toBeCloseTo(patch.forward.c, 10);
        expect(m.d, `${id}/${patch.id}.d`).toBeCloseTo(patch.forward.d, 10);
        expect(m.tx, `${id}/${patch.id}.tx`).toBeCloseTo(patch.forward.tx, 10);
        expect(m.ty, `${id}/${patch.id}.ty`).toBeCloseTo(patch.forward.ty, 10);
      }
    }
  });

  it('radial8 patches tile the square exactly once', () => {
    const preset = getPreset('radial8');
    expect(preset.patches).toHaveLength(8);
    const unions = preset.patches.map((p) => [[p.domain]] as MultiPolygon);
    const whole = unionMP(...unions);
    expect(multiPolygonArea(whole)).toBeCloseTo(4, 9);
  });
});

describe('geometry: golden diamond case', () => {
  const outcome = applyCuts('orthogonal2', [cutFromAngle(45, 0.4, 'negative')]);

  it('removes a diamond of area 2d^2 and leaves 4a^2 - 2d^2', () => {
    const removedArea = multiPolygonArea(outcome.removed);
    expect(removedArea).toBeCloseTo(2 * D * D, 9);
    expect(multiPolygonArea(outcome.paper)).toBeCloseTo(4 - 2 * D * D, 9);
  });

  it('the hole is the set |x| + |y| < d', () => {
    const inside = [
      { x: 0, y: 0 },
      { x: D * 0.9, y: 0 },
      { x: 0, y: -D * 0.9 },
      { x: -D * 0.45, y: D * 0.45 },
      { x: D * 0.45, y: D * 0.45 },
    ];
    const outside = [
      { x: D * 1.1, y: 0 },
      { x: 0, y: D * 1.1 },
      { x: D * 0.8, y: D * 0.8 },
      { x: 0.95, y: 0.95 },
    ];
    for (const p of inside) expect(pointInMultiPolygon(p, outcome.paper)).toBe(false);
    for (const p of outside) expect(pointInMultiPolygon(p, outcome.paper)).toBe(true);
  });

  it('the pattern is invariant under both axis reflections', () => {
    const samples: { x: number; y: number }[] = [];
    for (let i = -9; i <= 9; i++) {
      for (let j = -9; j <= 9; j++) {
        samples.push({ x: i / 10, y: j / 10 });
      }
    }
    for (const p of samples) {
      const a = pointInMultiPolygon(p, outcome.paper);
      expect(pointInMultiPolygon({ x: -p.x, y: p.y }, outcome.paper)).toBe(a);
      expect(pointInMultiPolygon({ x: p.x, y: -p.y }, outcome.paper)).toBe(a);
    }
  });

  it('changing the offset changes the hole size by the real geometry, not a picture swap', () => {
    const sizes = [0.2, 0.3, 0.4, 0.5].map((offset) => {
      const o = applyCuts('orthogonal2', [cutFromAngle(45, offset, 'negative')]);
      const r = multiPolygonArea(o.removed);
      expect(r).toBeCloseTo(2 * (offset * Math.SQRT2) ** 2, 9);
      return r;
    });
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
  });

  it('every patch loses its own mirrored copy of the cut', () => {
    expect(outcome.patches).toHaveLength(4);
    for (const patch of outcome.patches) {
      expect(multiPolygonArea(patch.removed)).toBeCloseTo((2 * D * D) / 4, 9);
    }
  });

  it('SVG export keeps the hole as a separate closed sub-path', () => {
    const d = multiPolygonToPath(outcome.paper, { flipY: true });
    const subpaths = d.match(/M/g) ?? [];
    expect(subpaths.length).toBe(2);
    expect(d.endsWith('Z')).toBe(true);
  });
});

describe('geometry: invariants and edge cases', () => {
  it('remaining paper is always a subset of the original sheet', () => {
    for (const id of ['none', 'vertical', 'horizontal', 'orthogonal2']) {
      for (const offset of [-0.8, -0.2, 0.3, 1.1]) {
        const out = applyCuts(id, [cutFromAngle(37, offset, 'positive')]);
        for (let i = -10; i <= 10; i++) {
          for (let j = -10; j <= 10; j++) {
            const p = { x: i / 10, y: j / 10 };
            if (pointInMultiPolygon(p, out.paper)) {
              expect(Math.abs(p.x)).toBeLessThanOrEqual(1 + 1e-9);
              expect(Math.abs(p.y)).toBeLessThanOrEqual(1 + 1e-9);
            }
          }
        }
      }
    }
  });

  it('paper area never exceeds the original and is never negative', () => {
    for (const offset of [-1.6, -0.5, 0, 0.5, 1.6]) {
      const out = applyCuts('orthogonal2', [cutFromAngle(20, offset, 'negative')]);
      const area = multiPolygonArea(out.paper);
      expect(area).toBeGreaterThanOrEqual(-1e-12);
      expect(area).toBeLessThanOrEqual(PAPER_AREA + 1e-9);
    }
  });

  it('paper + removed = the original sheet', () => {
    const cases = [
      ['none', 50, 0.3, 'negative'],
      ['vertical', 20, 0.45, 'positive'],
      ['horizontal', 70, -0.3, 'negative'],
      ['orthogonal2', 33, 0.61, 'positive'],
    ] as const;
    for (const [id, angle, offset, side] of cases) {
      const out = applyCuts(id, [cutFromAngle(angle, offset, side)]);
      const total = multiPolygonArea(out.paper) + multiPolygonArea(out.removed);
      expect(total).toBeCloseTo(PAPER_AREA, 8);
    }
  });

  it('a cut that misses the packet is reported, not silently applied', () => {
    const out = applyCuts('orthogonal2', [cutFromAngle(45, 2.2, 'positive')]);
    expect(multiPolygonArea(out.paper)).toBeCloseTo(PAPER_AREA, 9);
    expect(out.warnings.join('')).toContain('没有碰到');
  });

  it('degenerate normals and non-finite values are rejected without crashing', () => {
    expect(normalizeCut({ kind: 'line', nx: 0, ny: 0, offset: 0.4, removedSide: 'negative' })).toBeNull();
    expect(normalizeCut({ kind: 'line', nx: NaN, ny: 1, offset: 0.4, removedSide: 'negative' })).toBeNull();
    expect(normalizeCut({ kind: 'line', nx: 1, ny: 0, offset: Infinity, removedSide: 'negative' })).toBeNull();

    const out = applyCuts('orthogonal2', [
      { kind: 'line', nx: 0, ny: 0, offset: 0.4, removedSide: 'negative' },
      { kind: 'line', nx: NaN, ny: NaN, offset: NaN, removedSide: 'negative' },
    ]);
    expect(out.ok).toBe(true);
    expect(multiPolygonArea(out.paper)).toBeCloseTo(PAPER_AREA, 9);
    expect(out.warnings.length).toBe(2);
  });

  it('a non-unit normal is normalised together with the offset', () => {
    const a = removedPacketRegion(getPreset('orthogonal2'), {
      kind: 'line',
      nx: 1,
      ny: 1,
      offset: 0.4 * Math.SQRT2,
      removedSide: 'negative',
    });
    const b = removedPacketRegion(getPreset('orthogonal2'), cutFromAngle(45, 0.4, 'negative'));
    expect(multiPolygonArea(a)).toBeCloseTo(multiPolygonArea(b), 6);
  });

  it('same input and same seed give byte-identical geometry', () => {
    const a = applyCuts('orthogonal2', [cutFromAngle(31, 0.47, 'negative')]);
    const b = applyCuts('orthogonal2', [cutFromAngle(31, 0.47, 'negative')]);
    expect(multiPolygonToPath(a.paper)).toBe(multiPolygonToPath(b.paper));
  });
});

describe('geometry: scoring', () => {
  it('identical regions score IoU = 1 and zero symmetric difference', () => {
    const out = applyCuts('orthogonal2', [cutFromAngle(45, 0.4, 'negative')]);
    const s = scorePaper(out.paper, out.paper);
    expect(s.iou).toBeCloseTo(1, 12);
    expect(s.symmetricRatio).toBeCloseTo(0, 12);
    expect(s.verdict).toBe('perfect');
  });

  it('an obviously wrong solution is not accepted', () => {
    const target = applyCuts('orthogonal2', [cutFromAngle(45, 0.4, 'negative')]).paper;
    const wrong = applyCuts('orthogonal2', [cutFromAngle(45, 0.72, 'negative')]).paper;
    const s = scorePaper(wrong, target);
    expect(s.verdict).not.toBe('perfect');
    expect(s.iou).toBeLessThan(0.95);
    expect(s.symmetricRatio).toBeGreaterThan(0.02);
  });

  it('empty regions are defined, not NaN', () => {
    const s = scorePaper([], []);
    expect(Number.isFinite(s.iou)).toBe(true);
    expect(s.iou).toBe(1);
  });

  it('a lightly nudged solution still lands inside the tolerance band', () => {
    const target = applyCuts('orthogonal2', [cutFromAngle(45, 0.4, 'negative')]).paper;
    const nudge = applyCuts('orthogonal2', [cutFromAngle(45, 0.405, 'negative')]).paper;
    const s = scorePaper(nudge, target);
    expect(s.verdict).toBe('perfect');
  });
});

describe('puzzle: shipped levels', () => {
  it('ships six levels with unique ids', () => {
    expect(LEVELS).toHaveLength(6);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(6);
  });

  it('every level can be solved by its canonical solution', () => {
    for (const level of LEVELS) {
      const out = applyCuts(level.foldPreset, level.canonicalCuts);
      const s = scorePaper(out.paper, level.target);
      expect(s.iou, `level ${level.id}`).toBeCloseTo(1, 10);
      expect(s.verdict, `level ${level.id}`).toBe('perfect');
    }
  });

  it('every level rejects its own initial guess', () => {
    for (const level of LEVELS) {
      const out = applyCuts(level.foldPreset, level.initialGuess);
      const s = scorePaper(out.paper, level.target);
      expect(s.verdict, `level ${level.id}`).not.toBe('perfect');
    }
  });

  it('levels are visually distinct from each other', () => {
    for (let i = 0; i < LEVELS.length; i++) {
      for (let j = i + 1; j < LEVELS.length; j++) {
        const s = scorePaper(LEVELS[i].target, LEVELS[j].target);
        expect(s.iou, `${LEVELS[i].id} vs ${LEVELS[j].id}`).toBeLessThan(0.99);
      }
    }
  });

  it('canonical solutions are reproducible with on-screen control steps', () => {
    for (const level of LEVELS) {
      for (const cut of level.canonicalCuts) {
        // half-degree steps, two-decimal distances: reachable with the sliders
        if (cut.kind === 'notch') {
          expect(Math.abs(cut.angle * 2 - Math.round(cut.angle * 2)), level.id).toBeLessThan(1e-6);
          expect(Math.abs(cut.distance * 100 - Math.round(cut.distance * 100)), level.id).toBeLessThan(1e-6);
          expect(Math.abs(cut.width * 100 - Math.round(cut.width * 100)), level.id).toBeLessThan(1e-6);
        } else {
          const deg = cutAngleDegLocal(cut);
          expect(Math.abs(deg * 2 - Math.round(deg * 2)), level.id).toBeLessThan(1e-6);
          expect(Math.abs(cut.offset * 100 - Math.round(cut.offset * 100)), level.id).toBeLessThan(1e-6);
        }
      }
    }
  });
});

function cutAngleDegLocal(cut: { nx: number; ny: number }): number {
  const a = (Math.atan2(cut.ny, cut.nx) * 180) / Math.PI;
  return ((a % 180) + 180) % 180;
}

describe('geometry: sanity of the exported path builder', () => {
  it('every ring area is finite and the path is non-empty', () => {
    const out = applyCuts('vertical', [cutFromAngle(61, 0.88, 'positive')]);
    expect(multiPolygonToPath(out.paper)).toContain('M');
    for (const poly of out.paper) {
      for (const ring of poly) expect(Math.abs(ringArea(ring))).toBeGreaterThan(0);
    }
  });
});

describe('export: SVG is real vector data', () => {
  it('keeps the diamond hole as a separate sub-path with evenodd fill', () => {
    const out = applyCuts('orthogonal2', [cutFromAngle(45, 0.4, 'negative')]);
    const svg = buildSvg(out.paper, {
      paperColor: '#B93645',
      backgroundColor: '#F8F3E9',
      title: '菱形奇迹',
    });
    expect(svg).toContain('fill-rule="evenodd"');
    expect((svg.match(/M/g) ?? []).length).toBe(2);
    expect(svg).toContain('#B93645');
    expect(svg).toContain('<title>菱形奇迹</title>');
  });

  it('produces a stable downloadable file name', () => {
    expect(fileName('八瓣迎春', 'svg')).toMatch(/^foldyssey-.*-\d{8}\.svg$/);
    expect(fileName('', 'png')).toMatch(/^foldyssey-papercut-\d{8}\.png$/);
  });
});


describe('geometry: bent (notch) cuts', () => {
  const rot90 = (p: { x: number; y: number }) => ({ x: -p.y, y: p.x });

  it('a notch removes a wedge that grows with width and depth', () => {
    const narrow = multiPolygonArea(applyCuts('radial8', [notchCut(22.5, 0.85, 0.2)]).removed);
    const wide = multiPolygonArea(applyCuts('radial8', [notchCut(22.5, 0.85, 0.5)]).removed);
    const deep = multiPolygonArea(applyCuts('radial8', [notchCut(22.5, 0.4, 0.2)]).removed);
    expect(wide).toBeGreaterThan(narrow);
    expect(deep).toBeGreaterThan(narrow);
  });

  it('the 8-fold packet keeps the pattern invariant under 90 degree rotation', () => {
    const out = applyCuts('radial8', [notchCut(22.5, 0.55, 0.4)]);
    for (let i = -8; i < 8; i++) {
      for (let j = -8; j < 8; j++) {
        // half-step offsets keep the samples off the exact edges/corners,
        // where point-in-polygon is inherently ambiguous
        const p = { x: (i + 0.5) / 8, y: (j + 0.5) / 8 };
        const a = pointInMultiPolygon(p, out.paper);
        expect(pointInMultiPolygon(rot90(p), out.paper), `${p.x},${p.y}`).toBe(a);
        expect(pointInMultiPolygon({ x: -p.x, y: p.y }, out.paper), `${p.x},${p.y}`).toBe(a);
      }
    }
  });

  it('a bent cut leaves the centre intact, a straight apex cut does not', () => {
    const bent = applyCuts('radial8', [notchCut(22.5, 0.55, 0.4)]);
    const straight = applyCuts('radial8', [cutFromAngle(22.5, 0.55, 'negative')]);
    expect(pointInMultiPolygon({ x: 0, y: 0 }, bent.paper)).toBe(true);
    expect(pointInMultiPolygon({ x: 0, y: 0 }, straight.paper)).toBe(false);
  });

  it('degenerate notches are rejected without crashing', () => {
    expect(normalizeCut({ kind: 'notch', angle: 0, distance: 0.5, width: 0 })).toBeNull();
    expect(normalizeCut({ kind: 'notch', angle: NaN, distance: 0.5, width: 0.3 })).toBeNull();
    const out = applyCuts('radial8', [notchCut(22.5, 0.5, 0)]);
    expect(multiPolygonArea(out.paper)).toBeCloseTo(4, 9);
    expect(out.warnings.length).toBe(1);
  });

  it('legacy documents without a kind field still load as straight cuts', () => {
    const legacy = { nx: Math.SQRT1_2, ny: Math.SQRT1_2, offset: 0.4, removedSide: 'negative' as const };
    const out = applyCuts('orthogonal2', [legacy as never]);
    expect(multiPolygonArea(out.paper)).toBeCloseTo(4 - 0.64, 9);
  });
});
