/**
 * One-off exporter: dumps the geometry the promo video needs.
 *
 * The video is rendered outside the browser (no Chromium on this machine), so it
 * needs the *same* polygons the app draws, not a re-derivation. Run with
 * `npx vitest run src/tests/video.dump.test.ts` and read `video/gen/*.json`.
 *
 * Deleted after use; it is not part of the shipped test suite.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { describe, it } from 'vitest';

import { applyCuts, curvePointAt, normalizeCut, type Cut } from '../geometry/cut';
import { FOLD_PRESETS, getPreset, patchRenderMatrix } from '../geometry/fold';
import { type Mat } from '../geometry/polygon';
import { LEVELS } from '../puzzle/levels';
import { SKILL_META } from '../puzzle/skill';

const out = (name: string, data: unknown) => {
  mkdirSync('D:/code-repo/foldyssey/video/gen', { recursive: true });
  writeFileSync(`D:/code-repo/foldyssey/video/gen/${name}.json`, JSON.stringify(data));
};

/** Sample a cut's visible stroke inside the packet, for the "blade" overlay. */
function strokeOf(fold: string, cut: Cut): { x: number; y: number }[] {
  const preset = getPreset(fold as never);
  const norm = normalizeCut(cut);
  if (!norm) return [];
  if (norm.kind === 'curve') {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= 60; i++) pts.push(curvePointAt(preset, norm, -1 + (2 * i) / 60));
    return pts;
  }
  return [];
}

describe.skipIf(process.env.FOLDYSSEY_VIDEO !== '1')('video export', () => {
  it('dumps geometry for the promo video', () => {
  out(
    'levels',
    LEVELS.map((l) => ({
      id: l.id,
      index: l.index,
      title: l.title,
      subtitle: l.subtitle,
      stage: l.stage,
      skill: l.skill,
      skillLabel: SKILL_META[l.skill].label,
      cutCount: l.cutCount,
      cutSummary: l.cutSummary,
      foldPreset: l.foldPreset,
      curveRatio: l.curveRatio,
      targetArea: l.targetArea,
      target: l.target,
    })),
  );

  out(
    'folds',
    FOLD_PRESETS.map((p) => ({
      id: p.id,
      label: p.label,
      shortLabel: p.shortLabel,
      layerCount: p.layerCount,
      symmetry: p.symmetry,
      packet: p.packet,
      creases: p.creases,
      circles: p.patches.length,
    })),
  );

  // Hero: the densest pattern, animated from folded (1) to flat (0).
  const heroIds = ['grand-rosette', 'caisson', 'scallop', 'jar'];
  const heroes = heroIds.map((id) => {
    const level = LEVELS.find((l) => l.id === id)!;
    const preset = getPreset(level.foldPreset);
    const outcome = applyCuts(level.foldPreset, level.canonicalCuts);
    const matrixAt = (m: Mat) => ({ a: m.a, b: m.b, c: m.c, d: m.d, tx: m.tx, ty: m.ty });
    return {
      id: level.id,
      title: level.title,
      foldPreset: level.foldPreset,
      targetArea: level.targetArea,
      area: 4,
      steps: preset.steps.map((s) => ({
        id: s.id,
        point: s.point,
        dir: s.dir,
        t0: s.t0,
        t1: s.t1,
        label: s.label,
      })),
      packet: preset.packet,
      patches: outcome.patches.map((entry) => ({
        id: entry.patch.id,
        domain: entry.patch.domain,
        history: entry.patch.history,
        layer: entry.patch.layer,
        region: entry.region,
        removed: entry.removed,
        folded: matrixAt(patchRenderMatrix(entry.patch, preset, 1)),
        flat: matrixAt(patchRenderMatrix(entry.patch, preset, 0)),
      })),
      paper: outcome.paper,
      strokes: level.canonicalCuts.map((c) => strokeOf(level.foldPreset, c)),
      cuts: level.canonicalCuts,
    };
  });
  out('heroes', heroes);
  });
});
