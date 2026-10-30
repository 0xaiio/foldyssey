/**
 * Geometric scoring.
 *
 * Comparison happens on the region sets themselves, never on screenshots:
 *   IoU = Area(A ∩ T) / Area(A ∪ T)
 *   E   = Area(A Δ T) / Area(P)
 *
 * Why four tiers instead of "perfect or nothing"
 * ----------------------------------------------
 * Measured on the shipped levels (one slider step off the canonical solution):
 *
 *   corner       0.01 offset  -> 99.8 %
 *   mirror-gate  0.01 offset  -> 99.7 %
 *   diamond      0.01 offset  -> 99.0 %
 *   octagram     0.5°  angle  -> 98.0 %   <- the finest step the UI allows
 *
 * With the old gate (`iou >= 0.99`), the eight-fold level was only winnable by
 * landing on one of 360 slider positions with no feedback about which. That is
 * not a puzzle, it is guessing. The tiers below separate "you understood the
 * geometry" (pass) from "you hit the number exactly" (exact, a bonus).
 */

import {
  PAPER_AREA,
  type MultiPolygon,
  differenceMP,
  intersectMP,
  multiPolygonArea,
  unionMP,
} from './polygon';

export type Verdict = 'exact' | 'pass' | 'near' | 'miss';

export type ScoreThresholds = {
  /** Hit the canonical values: a bonus, never required. */
  exactIou: number;
  /** Clear the level. */
  passIou: number;
  /** Close enough to get a directional hint instead of a plain "no". */
  nearIou: number;
};

export const DEFAULT_THRESHOLDS: ScoreThresholds = {
  exactIou: 0.995,
  passIou: 0.94,
  nearIou: 0.88,
};

/** Per-stage budgets, from "learn the controls" to "read the pattern". */
export const STAGE_THRESHOLDS: Record<1 | 2 | 3 | 4, ScoreThresholds> = {
  1: { exactIou: 0.995, passIou: 0.92, nearIou: 0.85 },
  2: { exactIou: 0.995, passIou: 0.94, nearIou: 0.88 },
  3: { exactIou: 0.995, passIou: 0.96, nearIou: 0.9 },
  // Stage 4 is harder because of the pattern, not because of the tolerance.
  4: { exactIou: 0.995, passIou: 0.96, nearIou: 0.9 },
};

export const isCleared = (verdict: Verdict): boolean => verdict === 'exact' || verdict === 'pass';

export type ScoreResult = {
  iou: number;
  symmetricRatio: number;
  actualArea: number;
  targetArea: number;
  intersectionArea: number;
  unionArea: number;
  verdict: Verdict;
  /** How much IoU is still missing to `passIou` (0 when already passing). */
  gap: number;
  /** Paper that should not be there (A \ T). */
  extra: MultiPolygon;
  /** Paper that is missing (T \ A). */
  missing: MultiPolygon;
};

export const VERDICT_LABEL: Record<Verdict, string> = {
  exact: '完全匹配',
  pass: '达标',
  near: '接近',
  miss: '未达标',
};

export function scorePaper(
  actual: MultiPolygon,
  target: MultiPolygon,
  thresholds: ScoreThresholds = DEFAULT_THRESHOLDS,
): ScoreResult {
  const actualArea = multiPolygonArea(actual);
  const targetArea = multiPolygonArea(target);
  const inter = intersectMP(actual, target);
  const unionArea = multiPolygonArea(unionMP(actual, target));

  // `polygon-clipping` can throw (and we turn that into an empty result) when a
  // ring becomes numerically degenerate — a sawtooth diamond nudged by half a
  // degree is enough. An empty intersection would report IoU = 0 for two nearly
  // identical sheets, so fall back to the area identity:
  //     area(A ∩ T) = area(A) + area(T) − area(A ∪ T)
  // and clamp it into the range the value must have.
  let intersectionArea = multiPolygonArea(inter);
  if (inter.length === 0 && actualArea > 1e-9 && targetArea > 1e-9) {
    const byArea = actualArea + targetArea - unionArea;
    intersectionArea = Math.max(0, Math.min(byArea, actualArea, targetArea));
  }

  const iou =
    unionArea < 1e-12 ? (actualArea < 1e-12 && targetArea < 1e-12 ? 1 : 0) : intersectionArea / unionArea;

  const extra = differenceMP(actual, target);
  const missing = differenceMP(target, actual);
  const symArea = multiPolygonArea(extra) + multiPolygonArea(missing);
  const symmetricRatio = Math.min(1, symArea / PAPER_AREA);

  let verdict: Verdict = 'miss';
  if (iou >= thresholds.exactIou) verdict = 'exact';
  else if (iou >= thresholds.passIou) verdict = 'pass';
  else if (iou >= thresholds.nearIou) verdict = 'near';

  return {
    iou,
    symmetricRatio,
    actualArea,
    targetArea,
    intersectionArea,
    unionArea,
    verdict,
    gap: Math.max(0, thresholds.passIou - iou),
    extra,
    missing,
  };
}

export function formatPercent(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`;
}
