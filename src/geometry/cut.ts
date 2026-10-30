/**
 * Straight-line cut semantics on a folded packet.
 *
 * A cut is `{ n, offset, removedSide }` describing the half-plane
 *   { p : n · p < offset }        (removedSide = 'negative')
 *   { p : n · p > offset }        (removedSide = 'positive')
 * with |n| = 1.
 *
 * The removed *area* (not a zero-width line!) is intersected with the packet,
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

export type StraightCut = {
  nx: number;
  ny: number;
  offset: number;
  removedSide: 'negative' | 'positive';
};

export type CutRemovedSide = StraightCut['removedSide'];

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

const poly = (ring: Ring): MultiPolygon => [[ring]];

export function normalizeCut(cut: StraightCut | null | undefined): StraightCut | null {
  if (!cut) return null;
  const { nx, ny, offset, removedSide } = cut;
  if (![nx, ny, offset].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  if (removedSide !== 'negative' && removedSide !== 'positive') return null;
  const len = Math.hypot(nx, ny);
  if (len < 1e-9) return null;
  return { nx: nx / len, ny: ny / len, offset: offset / len, removedSide };
}

export function cutFromAngle(
  angleDeg: number,
  offset: number,
  removedSide: CutRemovedSide,
): StraightCut {
  const r = (angleDeg * Math.PI) / 180;
  return { nx: Math.cos(r), ny: Math.sin(r), offset, removedSide };
}

/** Angle of the normal in degrees, folded into [0, 180). */
export function cutAngleDeg(cut: StraightCut): number {
  const a = (Math.atan2(cut.ny, cut.nx) * 180) / Math.PI;
  const m = ((a % 180) + 180) % 180;
  return m;
}

export function flipCutSide(cut: StraightCut): StraightCut {
  return { ...cut, removedSide: cut.removedSide === 'positive' ? 'negative' : 'positive' };
}

export function describeCut(cut: StraightCut): string {
  const a = Math.round(cutAngleDeg(cut));
  const side = cut.removedSide === 'positive' ? '法向正侧' : '法向负侧';
  return `法线 ${a}°，距纸包中心 ${cut.offset.toFixed(2)}，剪去${side}`;
}

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

/** The removed region, restricted to the folded packet (packet coordinates). */
export function removedPacketRegion(preset: FoldPreset, cut: StraightCut): MultiPolygon {
  const norm = normalizeCut(cut);
  if (!norm) return [];
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

/** Apply a sequence of straight cuts to a folded preset and unfold the result. */
export function applyCuts(presetId: string, cuts: StraightCut[]): CutOutcome {
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
