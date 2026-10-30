/**
 * 「剪刀能力」分级 —— the scissor ladder.
 *
 * The tier of a level is **computed from its canonical cuts and measured on its
 * target region**, never written by hand. That matters: a level that claims
 * 「剪曲线」 while shipping straight edges would be caught by the same function
 * the UI uses to render the badge.
 *
 * The ladder has four rungs, ordered by what the hand must do:
 *
 *   1 `one`   一刀      one straight stroke. The blade never turns.
 *   2 `two`   两刀      two straight strokes on the same packet. Composition.
 *   3 `turn`  拐弯     one stroke with a corner (折剪) — the blade changes
 *                      direction *inside* the paper, which is the first time
 *                      the result can be non-convex.
 *   4 `curve` 曲线     one stroke with non-zero curvature: the blade turns
 *                      continuously (弧线 / S 形 / 波浪).
 *
 * `hole` (镂空) is recorded on a separate axis, because a closed loop is a
 * different operation (pierce, then cut around), not a harder version of an
 * open stroke. A level can be 「一刀 + 镂空」 or 「拐弯 + 镂空」.
 *
 * See `docs/SCISSOR_CURVES.md` for the criteria and the boundary cases.
 */

import type { Cut } from '../geometry/cut';
import { type MultiPolygon } from '../geometry/polygon';

export type ScissorSkill = 'one' | 'two' | 'turn' | 'curve';

export const SKILL_ORDER: ScissorSkill[] = ['one', 'two', 'turn', 'curve'];

/** Below this the stroke counts as straight (matches `CURVE_FLAT_EPS` order). */
export const CURVE_AMPLITUDE_EPS = 0.01;
/** A vertex is "smooth" — i.e. sampled from a curve — inside this turn band. */
const SMOOTH_MIN_DEG = 0.5;
const SMOOTH_MAX_DEG = 20;

export type StrokeStats = {
  /** How many strokes the player edits (= number of cuts). */
  strokes: number;
  /** Corners along open strokes: a折剪 has exactly one. */
  corners: number;
  /** Inflection points inside curved strokes (`bends - 1` each). */
  inflections: number;
  /** True when at least one open stroke bends continuously. */
  curved: boolean;
  /** Largest |amplitude| among curved strokes. */
  amplitude: number;
  /** Closed cut-outs: a separate axis, shown as a badge next to the tier. */
  closed: number;
};

export function strokeStats(cuts: Cut[]): StrokeStats {
  let corners = 0;
  let inflections = 0;
  let amplitude = 0;
  let closed = 0;
  for (const cut of cuts) {
    if (cut.kind === 'notch') corners += 1;
    else if (cut.kind === 'hole') closed += 1;
    else if (cut.kind === 'curve') {
      if (Math.abs(cut.amplitude) > CURVE_AMPLITUDE_EPS) {
        amplitude = Math.max(amplitude, Math.abs(cut.amplitude));
        inflections += Math.max(0, cut.bends - 1);
      }
    }
  }
  return {
    strokes: cuts.length,
    corners,
    inflections,
    curved: amplitude > CURVE_AMPLITUDE_EPS,
    amplitude,
    closed,
  };
}

/**
 * The rung a set of cuts belongs to. Note the ordering: a single curved stroke
 * outranks two straight ones, and a corner outranks composition, because the
 * *blade* lessons are cumulative while the *count* is not.
 */
export function skillOf(cuts: Cut[]): ScissorSkill {
  const s = strokeStats(cuts);
  if (s.curved) return 'curve';
  if (s.corners > 0) return 'turn';
  if (s.strokes >= 2) return 'two';
  return 'one';
}

export function skillRank(skill: ScissorSkill): number {
  return SKILL_ORDER.indexOf(skill) + 1;
}

/**
 * Share of the boundary that is *smoothly* turning, measured on the unfolded
 * paper. Straight edges contribute 0 (their vertices turn by ≥ 30° or by ≈ 0°);
 * a sampled curve contributes almost its whole length, because consecutive
 * chords differ by a couple of degrees.
 *
 * This is what makes the tier falsifiable: a 「曲线」 level whose target scores
 * near 0 here is lying, and the level tests assert it does not happen.
 */
export function curveRatio(paper: MultiPolygon): number {
  let total = 0;
  let smooth = 0;
  for (const poly of paper) {
    for (const ring of poly) {
      const n = ring.length;
      if (n < 4) continue;
      for (let i = 0; i < n; i++) {
        const prev = ring[(i - 1 + n) % n];
        const cur = ring[i];
        const next = ring[(i + 1) % n];
        const e0x = cur.x - prev.x;
        const e0y = cur.y - prev.y;
        const e1x = next.x - cur.x;
        const e1y = next.y - cur.y;
        const l1 = Math.hypot(e1x, e1y);
        if (l1 < 1e-12) continue;
        const cross = e0x * e1y - e0y * e1x;
        const dot = e0x * e1x + e0y * e1y;
        const turn = (Math.abs(Math.atan2(cross, dot)) * 180) / Math.PI;
        total += l1;
        if (turn > SMOOTH_MIN_DEG && turn < SMOOTH_MAX_DEG) smooth += l1;
      }
    }
  }
  return total > 0 ? smooth / total : 0;
}

export type SkillMeta = {
  label: string;
  /** What the hand must do, in one line. */
  criterion: string;
  /** The case where the definition is ambiguous, and how it is settled. */
  boundary: string;
};

export const SKILL_META: Record<ScissorSkill, SkillMeta> = {
  one: {
    label: '一刀',
    criterion: '恰好一条直线切口，剪去一个半平面；刀在纸里不拐弯。',
    boundary:
      '切线压在折痕上时，两侧纸各被复制一次，缺口宽度为零但轮廓仍在——判定仍算「一刀」，但会提示「切在折痕上」；切线完全在纸包外则不计为一刀（面积不变）。',
  },
  two: {
    label: '两刀',
    criterion: '同一纸包上两条直线切口，各自独立，刀仍不拐弯。',
    boundary:
      '两条切线完全重合时第二条不产生新面积，仍记两刀但在诊断里提示重复；两条切线相交时，后一刀只剪剩余的纸，顺序不影响最终形状（面积可交换性有测试）。',
  },
  turn: {
    label: '拐弯',
    criterion: '至少一条切口在纸包内部改变方向（折剪 V 形），轮廓首次可以非凸。',
    boundary:
      '折剪顶点落在纸包中心时，八个扇区共用同一顶点，缺口退化为锥形但仍是有效图案；折剪两臂落在同一条折痕上时视为拐弯而非曲线，因为刀只有一次转向。',
  },
  curve: {
    label: '曲线',
    criterion: '至少一条切口在纸包内连续转向（弧线 / S 形 / 波浪），弯曲量 |amplitude| > 0.01。',
    boundary:
      'amplitude = 0 时曲线退化为直线，按「一刀/两刀/拐弯」判定（有等价性测试：与同参数直线剪的纸形差为 0）；曲线自交、回头、绕圈不在本模型内——刀口是单值图，回头剪会把纸分成多块，超出「剪去一侧」的定义。',
  },
};

export const SKILL_BADGE: Record<ScissorSkill, string> = {
  one: '一刀',
  two: '两刀',
  turn: '拐弯',
  curve: '曲线',
};
