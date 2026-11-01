/** One-off exporter: the measured one-slider-step IoU per level, for the video chart. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { describe, it } from 'vitest';

import { applyCuts, cutAngleDeg, cutFromAngle, notchCut, type Cut } from '../geometry/cut';
import { scorePaper } from '../geometry/score';
import { LEVELS } from '../puzzle/levels';

function step(cut: Cut, field: string, sign: number): Cut | null {
  if (cut.kind === 'line') {
    if (field === 'angle') {
      const deg = Math.max(0, Math.min(179.5, cutAngleDeg(cut) + sign * 0.5));
      if (Math.abs(deg - cutAngleDeg(cut)) < 1e-9) return null;
      return cutFromAngle(deg, cut.offset, cut.removedSide);
    }
    return { ...cut, offset: Number((cut.offset + sign * 0.01).toFixed(2)) };
  }
  if (cut.kind === 'notch') {
    if (field === 'angle') return notchCut(Number((cut.angle + sign * 0.5).toFixed(1)), cut.distance, cut.width);
    if (field === 'distance') return notchCut(cut.angle, Number((cut.distance + sign * 0.01).toFixed(2)), cut.width);
    return notchCut(cut.angle, cut.distance, Number((cut.width + sign * 0.01).toFixed(2)));
  }
  if (cut.kind === 'curve') {
    if (field === 'angle') return { ...cut, angle: Number(Math.max(0, Math.min(179.5, cut.angle + sign * 0.5)).toFixed(1)) };
    if (field === 'offset') return { ...cut, offset: Number((cut.offset + sign * 0.01).toFixed(2)) };
    return { ...cut, amplitude: Number((cut.amplitude + sign * 0.01).toFixed(2)) };
  }
  if (field === 'angle') return { ...cut, angle: Number((cut.angle + sign * 0.5).toFixed(1)) };
  if (field === 'radius') return { ...cut, radius: Number((cut.radius + sign * 0.01).toFixed(2)) };
  if (field === 'size') return { ...cut, size: Number((cut.size + sign * 0.005).toFixed(3)) };
  return { ...cut, rotation: Number((cut.rotation + sign * 1).toFixed(1)) };
}

describe.skipIf(process.env.FOLDYSSEY_VIDEO !== '1')('video margin export', () => {
  it('measures one-step margins', () => {
  const fields = ['angle', 'offset', 'distance', 'width', 'radius', 'size', 'rotation', 'amplitude'];
  const rows = LEVELS.map((level) => {
    let worst = 1;
    let where = '';
    level.canonicalCuts.forEach((cut, ci) => {
      for (const f of fields) {
        for (const sign of [1, -1]) {
          const next = step(cut, f, sign);
          if (!next) continue;
          const cuts = level.canonicalCuts.map((c, k) => (k === ci ? next : c));
          const s = scorePaper(applyCuts(level.foldPreset, cuts).paper, level.target, level.thresholds);
          if (s.iou < worst) {
            worst = s.iou;
            where = `${ci + 1}.${f}${sign > 0 ? '+' : '-'}`;
          }
        }
      }
    });
    return {
      id: level.id,
      title: level.title,
      skill: level.skill,
      pass: level.thresholds.passIou,
      worst,
      where,
    };
  });
  mkdirSync('D:/code-repo/foldyssey/video/gen', { recursive: true });
  writeFileSync('D:/code-repo/foldyssey/video/gen/margins.json', JSON.stringify(rows));
  // eslint-disable-next-line no-console
  console.log(rows.map((r) => `${r.id.padEnd(14)} ${(r.worst * 100).toFixed(2)}%`).join('\n'));
  });
});
