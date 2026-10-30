/**
 * Geometric scoring.
 *
 * Comparison happens on the region sets themselves, never on screenshots:
 *   IoU = Area(A ∩ T) / Area(A ∪ T)
 *   E   = Area(A Δ T) / Area(P)
 */

import {
  PAPER_AREA,
  type MultiPolygon,
  differenceMP,
  intersectMP,
  multiPolygonArea,
  unionMP,
} from './polygon';

export type Verdict = 'perfect' | 'close' | 'miss';

export type ScoreThresholds = {
  perfectIou: number;
  perfectSym: number;
  closeIou: number;
};

export const DEFAULT_THRESHOLDS: ScoreThresholds = {
  perfectIou: 0.99,
  perfectSym: 0.02,
  closeIou: 0.9,
};

export type ScoreResult = {
  iou: number;
  symmetricRatio: number;
  actualArea: number;
  targetArea: number;
  intersectionArea: number;
  unionArea: number;
  verdict: Verdict;
  /** Paper that should not be there (A \ T). */
  extra: MultiPolygon;
  /** Paper that is missing (T \ A). */
  missing: MultiPolygon;
};

export const VERDICT_LABEL: Record<Verdict, string> = {
  perfect: '完全匹配',
  close: '接近',
  miss: '未匹配',
};

export function scorePaper(
  actual: MultiPolygon,
  target: MultiPolygon,
  thresholds: ScoreThresholds = DEFAULT_THRESHOLDS,
): ScoreResult {
  const actualArea = multiPolygonArea(actual);
  const targetArea = multiPolygonArea(target);
  const inter = intersectMP(actual, target);
  const intersectionArea = multiPolygonArea(inter);
  const unionArea = multiPolygonArea(unionMP(actual, target));

  const iou =
    unionArea < 1e-12 ? (actualArea < 1e-12 && targetArea < 1e-12 ? 1 : 0) : intersectionArea / unionArea;

  const extra = differenceMP(actual, target);
  const missing = differenceMP(target, actual);
  const symArea = multiPolygonArea(extra) + multiPolygonArea(missing);
  const symmetricRatio = Math.min(1, symArea / PAPER_AREA);

  let verdict: Verdict = 'miss';
  if (iou >= thresholds.perfectIou && symmetricRatio <= thresholds.perfectSym) verdict = 'perfect';
  else if (iou >= thresholds.closeIou) verdict = 'close';

  return {
    iou,
    symmetricRatio,
    actualArea,
    targetArea,
    intersectionArea,
    unionArea,
    verdict,
    extra,
    missing,
  };
}

export function formatPercent(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`;
}
