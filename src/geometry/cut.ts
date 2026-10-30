/**
 * Cut semantics on a folded packet.
 *
 * Two primitives, both "the scissors never leave the paper":
 *
 *  1. `line`  — a straight cut. The removed area is a half-plane
 *     `{ p : n·p < offset }` or `{ p : n·p > offset }`, |n| = 1.
 *  2. `notch` — a bent cut: enter at the rim, cut to an apex, turn, cut back
 *     out. The removed area is a triangle whose base lies outside the packet.
 *     This is what gives a folded pattern its **petals**; a straight cut can
 *     only ever remove a convex piece and therefore only produces convex
 *     polygons (octagons, crosses, rings).
 *
 * The removed area (never a zero-width line!) is intersected with the packet,
 * then pulled back through every patch's inverse isometry, so every physical
 * layer loses its own pre-image of the same cut. The union of the surviving
 * patch regions is the unfolded paper.
 */

import { getPreset, type FoldPreset, type PaperPatch } from './fold';
import {
  type Mat,
  type MultiPolygon,
  type Ring,
  applyMat,
  differenceMP,
  intersectMP,
  multiPolygonArea,
  unionMP,
} from './polygon';
import { type Vec2 } from './vec';

export type CutRemovedSide = 'negative' | 'positive';

/** A single straight cut. */
export type LineCut = {
  kind: 'line';
  nx: number;
  ny: number;
  offset: number;
  removedSide: CutRemovedSide;
};

/** A bent cut: a V-shaped wedge taken out of the packet's rim. */
export type NotchCut = {
  kind: 'notch';
  /** Direction of the notch axis, degrees. */
  angle: number;
  /** Distance from the packet centre to the apex. */
  distance: number;
  /** Width of the opening at the rim. */
  width: number;
};

export type Cut = LineCut | NotchCut;

/** Backwards-compatible alias: the straight-line primitive. */
export type StraightCut = LineCut;

export type PatchOutcome = {
  patch: PaperPatch;
  /** Surviving paper of this patch, in paper coordinates. */
  region: MultiPolygon;
  /** Removed part of this patch, in paper coordinates. */
  removed: MultiPolygon;
};

export type CutOutcome = {
  ok: boolean;
  patches: PatchOutcome[];
  /** Unfolded surviving paper. */
  paper: MultiPolygon;
  /** Everything that was cut away, in paper coordinates. */
  removed: MultiPolygon;
  /** The removed region inside the folded packet. */
  removedPacket: MultiPolygon;
  warnings: string[];
  emptyPaper: boolean;
};

export const CUT_OFFSET_LIMIT = 1.7;
export const BIG_BOX = 4;
/** How far the notch arms extend beyond the apex before clipping. */
export const NOTCH_REACH = 1.4;

const poly = (ring: Ring): MultiPolygon => [[ring]];

/* ------------------------------------------------------------------ *
 * Construction & validation
 * ------------------------------------------------------------------ */

export function cutFromAngle(
  angleDeg: number,
  offset: number,
  removedSide: CutRemovedSide,
): LineCut {
  const r = (angleDeg * Math.PI) / 180;
  return { kind: 'line', nx: Math.cos(r), ny: Math.sin(r), offset, removedSide };
}

export function notchCut(angleDeg: number, distance: number, width: number): NotchCut {
  return { kind: 'notch', angle: angleDeg, distance, width };
}

export function normalizeCut(cut: Cut | null | undefined): Cut | null {
  if (!cut) return null;
  // Documents saved before v0.3 stored straight cuts without a `kind` field.
  const kind = (cut as { kind?: string }).kind ?? 'line';
  if (kind === 'notch') {
    const { angle, distance, width } = cut as NotchCut;
    if (![angle, distance, width].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
    if (width <= 1e-4) return null;
    return { kind: 'notch', angle, distance, width };
  }
  if (kind !== 'line') return null;
  const { nx, ny, offset, removedSide } = cut as LineCut;
  if (![nx, ny, offset].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  if (removedSide !== 'negative' && removedSide !== 'positive') return null;
  const len = Math.hypot(nx, ny);
  if (len < 1e-9) return null;
  return { kind: 'line', nx: nx / len, ny: ny / len, offset: offset / len, removedSide };
}

export const isLineCut = (cut: Cut): cut is LineCut => cut.kind === 'line';
export const isNotchCut = (cut: Cut): cut is NotchCut => cut.kind === 'notch';

/** Angle of the cut axis in degrees, folded into [0, 180). */
export function cutAngleDeg(cut: Cut): number {
  const a =
    cut.kind === 'notch' ? cut.angle : (Math.atan2(cut.ny, cut.nx) * 180) / Math.PI;
  return ((a % 180) + 180) % 180;
}

export function describeCut(cut: Cut): string {
  if (cut.kind === 'notch') {
    return `折剪：方向 ${Math.round(cut.angle)}°，顶点距中心 ${cut.distance.toFixed(2)}，张口 ${cut.width.toFixed(2)}`;
  }
  const a = Math.round(cutAngleDeg(cut) * 2) / 2;
  const side = cut.removedSide === 'positive' ? '法向正侧' : '法向负侧';
  return `直线：法线 ${a}°，距纸包中心 ${cut.offset.toFixed(2)}，剪去${side}`;
}

/* ------------------------------------------------------------------ *
 * Half-plane / notch -> removed region in the packet
 * ------------------------------------------------------------------ */

function clipRingToHalfPlane(ring: Ring, n: Vec2, c: number, keepPositive: boolean): Ring {
  const sign = keepPositive ? 1 : -1;
  const f = (p: Vec2) => sign * (n.x * p.x + n.y * p.y - c);
  const out: Ring = [];
  const len = ring.length;
  if (len < 3) return out;
  for (let i = 0; i < len; i++) {
    const cur = ring[i];
    const next = ring[(i + 1) % len];
    const fc = f(cur);
    const fn = f(next);
    const curIn = fc >= -1e-12;
    const nextIn = fn >= -1e-12;
    if (curIn) out.push(cur);
    if (curIn !== nextIn) {
      const denom = fc - fn;
      const t = Math.abs(denom) < 1e-15 ? 0 : fc / denom;
      out.push({ x: cur.x + (next.x - cur.x) * t, y: cur.y + (next.y - cur.y) * t });
    }
  }
  return out;
}

/** The triangular wedge removed by a notch, before clipping. */
export function notchTriangle(cut: NotchCut): Ring {
  const r = (cut.angle * Math.PI) / 180;
  const ux = Math.cos(r);
  const uy = Math.sin(r);
  const px = -uy;
  const py = ux;
  const apex = { x: ux * cut.distance, y: uy * cut.distance };
  const base = { x: apex.x + ux * NOTCH_REACH, y: apex.y + uy * NOTCH_REACH };
  const half = cut.width / 2;
  return [
    apex,
    { x: base.x + px * half, y: base.y + py * half },
    { x: base.x - px * half, y: base.y - py * half },
  ];
}

/** Nearest positive ray/edge intersection distance, used to trim the drawn V. */
export function clipRayToRing(ring: Ring, origin: Vec2, dir: Vec2): number {
  let best = Infinity;
  const len = ring.length;
  for (let i = 0; i < len; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % len];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const denom = dir.x * ey - dir.y * ex;
    if (Math.abs(denom) < 1e-12) continue;
    const ox = a.x - origin.x;
    const oy = a.y - origin.y;
    const t = (ox * ey - oy * ex) / denom;
    const s = (ox * dir.y - oy * dir.x) / denom;
    if (t > 1e-9 && s >= -1e-9 && s <= 1 + 1e-9) best = Math.min(best, t);
  }
  return best;
}

/** The removed region, restricted to the folded packet (packet coordinates). */
export function removedPacketRegion(preset: FoldPreset, cut: Cut): MultiPolygon {
  const norm = normalizeCut(cut);
  if (!norm) return [];

  if (norm.kind === 'notch') {
    const tri = notchTriangle(norm);
    if (tri.length < 3) return [];
    return intersectMP(poly(preset.packet), poly(tri));
  }

  const rect: Ring = [
    { x: -BIG_BOX, y: -BIG_BOX },
    { x: BIG_BOX, y: -BIG_BOX },
    { x: BIG_BOX, y: BIG_BOX },
    { x: -BIG_BOX, y: BIG_BOX },
  ];
  const half = clipRingToHalfPlane(
    rect,
    { x: norm.nx, y: norm.ny },
    norm.offset,
    norm.removedSide === 'positive',
  );
  if (half.length < 3) return [];
  return intersectMP(poly(preset.packet), poly(half));
}

export function transformMP(mp: MultiPolygon, mat: Mat): MultiPolygon {
  return mp.map((p) => p.map((ring) => ring.map((pt) => applyMat(mat, pt))));
}

/** Apply a sequence of cuts to a folded preset and unfold the result. */
export function applyCuts(presetId: string, cuts: Cut[]): CutOutcome {
  const preset = getPreset(presetId as FoldPreset['id']);
  const warnings: string[] = [];

  let state = preset.patches.map((patch) => ({
    patch,
    region: poly(patch.domain),
    removed: [] as MultiPolygon,
  }));

  let removedPacket: MultiPolygon = [];
  const packetArea = multiPolygonArea(poly(preset.packet));

  for (const raw of cuts) {
    const cut = normalizeCut(raw);
    if (!cut) {
      warnings.push('切线参数无效（法向量退化或数值非有限），已忽略这一刀。');
      continue;
    }
    const removedP = removedPacketRegion(preset, cut);
    const removedArea = multiPolygonArea(removedP);
    if (removedP.length === 0 || removedArea < 1e-9) {
      warnings.push('这一刀没有碰到折叠后的纸包，纸形不变。');
      continue;
    }
    if (removedArea >= packetArea - 1e-6) {
      warnings.push('这一刀会把整叠纸全部剪掉。');
    }
    removedPacket = unionMP(removedPacket, removedP);

    state = state.map((entry) => {
      const holeInPaper = transformMP(removedP, entry.patch.inverse);
      const region = differenceMP(entry.region, holeInPaper);
      const removed = unionMP(entry.removed, intersectMP(holeInPaper, poly(entry.patch.domain)));
      return { ...entry, region, removed };
    });
  }

  const paper = unionMP(...state.map((s) => s.region));
  const removed = unionMP(...state.map((s) => s.removed));
  const paperArea = multiPolygonArea(paper);

  return {
    ok: paper.length > 0,
    patches: state,
    paper,
    removed,
    removedPacket,
    warnings,
    emptyPaper: paperArea < 1e-9,
  };
}
