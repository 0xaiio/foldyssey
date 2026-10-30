/**
 * Player assistance for the puzzle.
 *
 * The complaint this file answers: "I can see it is wrong but I cannot tell
 * which slider to move". Instead of shrinking the step size (which makes the
 * search space bigger, not smaller), we run the *real engine* on one-step
 * perturbations and report the move that actually improves the score.
 *
 * Cost: one evaluation is ~4 ms on the eight-fold preset (measured), and the
 * search below does at most `6 × cuts` evaluations, so a diagnosis is a
 * 20–80 ms one-shot on a button press — never on every drag frame.
 */

import { applyCuts, cutAngleDeg, cutFromAngle, notchCut, type Cut } from '../geometry/cut';
import type { FoldPresetId } from '../geometry/fold';
import type { MultiPolygon } from '../geometry/polygon';
import { type ScoreThresholds, scorePaper } from '../geometry/score';

export type EditableField = 'angle' | 'offset' | 'distance' | 'width';

/** One step of the on-screen slider, per field. */
export const STEP: Record<EditableField, number> = {
  angle: 0.5,
  offset: 0.01,
  distance: 0.01,
  width: 0.01,
};

export const FIELD_LABEL: Record<EditableField, string> = {
  angle: '角度',
  offset: '距中心',
  distance: '顶点距中心',
  width: '张口宽度',
};

export type Nudge = {
  index: number;
  field: EditableField;
  /** Total change to apply (already scaled by `mult`). */
  delta: number;
  /** How many slider steps that is, for the copy. */
  mult: number;
  /** IoU improvement, 0..1. */
  gain: number;
  /** Human-readable target value, already rounded for the slider. */
  nextValue: number;
};

export type Diagnosis = {
  headline: string;
  detail: string;
  nudge: Nudge | null;
  /** Best achievable IoU with one step, if a nudge exists. */
  projectedIou: number;
};

function fieldsOf(cut: Cut): EditableField[] {
  return cut.kind === 'line' ? ['angle', 'offset'] : ['angle', 'distance', 'width'];
}

function valueOf(cut: Cut, field: EditableField): number {
  if (cut.kind === 'line') {
    return field === 'angle' ? cutAngleDeg(cut) : field === 'offset' ? cut.offset : Number.NaN;
  }
  if (cut.kind === 'notch') {
    return field === 'angle' ? cut.angle : field === 'distance' ? cut.distance : cut.width;
  }
  return Number.NaN;
}

/** Apply `delta` to one field, keeping the cut valid and on-slider. */
export function applyStep(cut: Cut, field: EditableField, delta: number, steps = 1): Cut | null {
  const d = delta * steps;
  if (cut.kind === 'line') {
    if (field === 'angle') {
      const deg = (((cutAngleDeg(cut) + d) % 180) + 180) % 180;
      return cutFromAngle(deg, cut.offset, cut.removedSide);
    }
    if (field === 'offset') {
      const offset = Math.max(-1.6, Math.min(1.6, cut.offset + d));
      if (Math.abs(offset - cut.offset) < 1e-9) return null;
      return { ...cut, offset: Number(offset.toFixed(2)) };
    }
    return null;
  }
  if (cut.kind === 'notch') {
    if (field === 'angle') {
      const angle = Math.max(0, Math.min(180, cut.angle + d));
      return notchCut(Number(angle.toFixed(1)), cut.distance, cut.width);
    }
    if (field === 'distance') {
      const v = Math.max(0.1, Math.min(1.2, cut.distance + d));
      return notchCut(cut.angle, Number(v.toFixed(2)), cut.width);
    }
    if (field === 'width') {
      const v = Math.max(0.05, Math.min(1.2, cut.width + d));
      return notchCut(cut.angle, cut.distance, Number(v.toFixed(2)));
    }
  }
  return null;
}

function iouOf(cuts: Cut[], fold: FoldPresetId, target: MultiPolygon, t: ScoreThresholds): number {
  return scorePaper(applyCuts(fold, cuts).paper, target, t).iou;
}

/**
 * Find the single slider move that helps most. Returns `null` for the move
 * when no one-step change improves the score (local optimum) — in that case the
 * caller should suggest the hint ladder instead of pretending a nudge exists.
 */
export function diagnose(
  cuts: Cut[],
  fold: FoldPresetId,
  target: MultiPolygon,
  thresholds: ScoreThresholds,
  /** Restrict the search to the cut the player is editing (matches the tabs). */
  focusIndex?: number,
): Diagnosis {
  const base = scorePaper(applyCuts(fold, cuts).paper, target, thresholds);
  const baseIou = base.iou;

  let best: Nudge | null = null;
  // Coarse-to-fine: one step is useless when the guess is far away (0.78 vs a
  // target of 0.45 needs 33 steps), while a big step overshoots when it is
  // close. Searching several magnitudes and keeping the best one solves both.
  const MULTIPLIERS = [1, 4, 16];
  const focus =
    focusIndex !== undefined && focusIndex >= 0 && focusIndex < cuts.length ? focusIndex : null;
  // Search the tab the player is on first; if it already has a good move, do
  // not spend 3x the time on the others. If it is stuck, widen the search.
  const indices =
    focus === null
      ? cuts.map((_, i) => i)
      : [focus, ...cuts.map((_, i) => i).filter((i) => i !== focus)];
  for (const index of indices) {
    if (index < 0 || index >= cuts.length) continue;
    for (const field of fieldsOf(cuts[index])) {
      for (const mult of MULTIPLIERS) {
        for (const sign of [1, -1]) {
          const delta = sign * STEP[field] * mult;
          const next = applyStep(cuts[index], field, delta);
          if (!next) continue;
          const trial = cuts.map((c, i) => (i === index ? next : c));
          const iou = iouOf(trial, fold, target, thresholds);
          if (!best || iou - baseIou > best.gain) {
            best = {
              index,
              field,
              delta,
              mult,
              gain: iou - baseIou,
              nextValue: Number(valueOf(next, field).toFixed(2)),
            };
          }
        }
      }
    }
    if (focus !== null && index === focus && best && best.gain >= 0.01) break;
  }

  // Area tells the player *what* is wrong before *which slider*.
  const areaDelta = base.actualArea - base.targetArea;
  const areaRatio = base.targetArea > 1e-9 ? Math.abs(areaDelta) / base.targetArea : 0;
  let headline: string;
  if (base.iou >= thresholds.passIou) {
    headline = '已经达标';
  } else if (areaRatio < 0.02) {
    headline = '大小对了，位置还差一点';
  } else if (areaDelta > 0) {
    headline = `剪少了 ${(areaRatio * 100).toFixed(0)}%：留下的纸比目标多`;
  } else {
    headline = `剪多了 ${(areaRatio * 100).toFixed(0)}%：留下的纸比目标少`;
  }

  const usable = best && best.gain > 5e-4 ? best : null;
  const detail = usable
    ? `把第 ${usable.index + 1} 刀的「${FIELD_LABEL[usable.field]}」往 ${usable.nextValue} 调` +
      `（${usable.delta > 0 ? '+' : ''}${usable.delta.toFixed(2)}，约 ${usable.mult} 格），` +
      `吻合度约 +${(usable.gain * 100).toFixed(1)}%。`
    : base.iou >= thresholds.passIou
      ? '这一刀已经符合目标，按「剪一刀」看展开效果。'
      : focusIndex === undefined
        ? '单步微调已经到顶了：换一个参数（角度/深度）或看一条提示，会更快。'
        : '当前这一刀已经没有更好的单步：切到另一个标签页看看，或者看一条提示。';

  return {
    headline,
    detail,
    nudge: usable,
    projectedIou: usable ? baseIou + usable.gain : baseIou,
  };
}

/** Apply the recommended move once. */
export function applyNudge(cuts: Cut[], nudge: Nudge): Cut[] {
  return cuts.map((c, i) => {
    if (i !== nudge.index) return c;
    return applyStep(c, nudge.field, nudge.delta) ?? c;
  });
}
