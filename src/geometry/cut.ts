/**
 * Cut semantics on a folded packet.
 *
 * Three primitives, all physically executable with scissors:
 *
 *  1. `line`  — a straight cut. The removed area is a half-plane
 *     `{ p : n·p < offset }` or `{ p : n·p > offset }`, |n| = 1.
 *  2. `notch` — a bent cut: enter at the rim, cut to an apex, turn, cut back
 *     out. The removed area is a triangle whose base lies outside the packet.
 *     This is what gives a folded pattern its **petals**; a straight cut can
 *     only ever remove a convex piece and therefore only produces convex
 *     polygons (octagons, crosses, rings).
 *  3. `hole` — a closed cut-out entirely inside the packet: pierce, cut around
 *     a small closed shape, remove it. Under an n-fold preset it unfolds into a
 *     **ring of n holes**, which is where the fine texture of a real 团花 /
 *     snowflake comes from. Not a "one straight cut" — it is scissor work, and
 *     it is labelled that way in the UI.
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

/** Silhouette of a closed cut-out. */
export const HOLE_SHAPES = ['diamond', 'circle', 'leaf'] as const;
export type HoleShape = (typeof HOLE_SHAPES)[number];

/**
 * A closed cut-out inside the packet. Its outline is a superellipse, so the
 * three shapes share one parameterisation and one polygoniser:
 *
 *   exponent 1   -> diamond (rhombus, straight edges)
 *   exponent 2   -> circle / ellipse
 *   exponent 0.6 -> leaf: pointed at both tips, concave sides (petal, 柳叶纹)
 */
export type HoleCut = {
  kind: 'hole';
  shape: HoleShape;
  /** Where the hole sits inside the packet, degrees. */
  angle: number;
  /** Distance from the packet centre to the hole centre. */
  radius: number;
  /** Half-width of the hole. */
  size: number;
  /** Height / width ratio along the hole's own axes. */
  stretch: number;
  /** Orientation of the hole's own axes, degrees. */
  rotation: number;
};

export type Cut = LineCut | NotchCut | HoleCut;

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

export function holeCut(
  shape: HoleShape,
  angle: number,
  radius: number,
  size: number,
  stretch = 1,
  rotation = 0,
): HoleCut {
  return { kind: 'hole', shape, angle, radius, size, stretch, rotation };
}

const HOLE_EXPONENT: Record<HoleShape, number> = {
  diamond: 1,
  circle: 2,
  leaf: 0.62,
};

/**
 * Outline of a hole as a closed ring. `size` is the half-width, `stretch` the
 * height/width ratio; the ring is then rotated and translated to (radius,
 * angle) inside the packet.
 */
export function holeOutline(cut: HoleCut): Ring {
  const p = HOLE_EXPONENT[cut.shape] ?? 2;
  const segments = cut.shape === 'circle' ? 32 : 24;
  const a = cut.size;
  const b = cut.size * cut.stretch;
  const rot = (cut.rotation * Math.PI) / 180;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  const pos = (cut.angle * Math.PI) / 180;
  const cx = Math.cos(pos) * cut.radius;
  const cy = Math.sin(pos) * cut.radius;
  const ring: Ring = [];
  for (let i = 0; i < segments; i++) {
    const t = (2 * Math.PI * i) / segments;
    const c = Math.cos(t);
    const s = Math.sin(t);
    // Superellipse in polar form: r = (|cos|^p + |sin|^p)^(-1/p).
    const denom = Math.abs(c) ** p + Math.abs(s) ** p;
    if (denom <= 1e-12) continue;
    const r = denom ** (-1 / p);
    const x = a * r * c;
    const y = b * r * s;
    ring.push({ x: cx + x * cosR - y * sinR, y: cy + x * sinR + y * cosR });
  }
  return ring;
}

/**
 * A row of sawteeth along the packet edge.
 *
 * Each tooth is a diamond whose centre sits exactly on the edge: half of it is
 * outside the paper, so what remains is a triangular bite. Under an n-fold
 * preset this becomes `n × count` teeth. Shared by the AI element mapping and
 * by hand-authored levels so both produce identical geometry.
 */
export function sawtoothCuts(
  preset: FoldPreset,
  count: number,
  depth: number,
  pitch: number,
  phase = 0,
): HoleCut[] {
  const span = preset.id === 'radial8' ? 45 : 180;
  const n = Math.max(1, Math.min(8, Math.round(count)));
  const out: HoleCut[] = [];
  for (let i = 0; i < n; i++) {
    const angle = phase + ((i + 0.5) * span) / n;
    const rad = (angle * Math.PI) / 180;
    const rim = clipRayToRing(preset.packet, { x: 0, y: 0 }, { x: Math.cos(rad), y: Math.sin(rad) });
    if (!Number.isFinite(rim)) continue;
    const d = Math.max(0.04, Math.min(0.5, depth));
    const half = Math.max(0.012, pitch / 2);
    out.push(holeCut('diamond', angle, rim, d, half / d, angle));
  }
  return out;
}

export function normalizeCut(cut: Cut | null | undefined): Cut | null {
  if (!cut) return null;
  // Documents saved before v0.3 stored straight cuts without a `kind` field.
  const kind = (cut as { kind?: string }).kind ?? 'line';
  if (kind === 'hole') {
    const { shape, angle, radius, size, stretch, rotation } = cut as HoleCut;
    if (![angle, radius, size, stretch, rotation].every((v) => typeof v === 'number' && Number.isFinite(v))) {
      return null;
    }
    if (!HOLE_SHAPES.includes(shape)) return null;
    if (size <= 1e-4) return null;
    if (radius < 0) return null;
    if (stretch <= 1e-3) return null;
    return { kind: 'hole', shape, angle, radius, size, stretch, rotation };
  }
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
export const isHoleCut = (cut: Cut): cut is HoleCut => cut.kind === 'hole';

/** Angle of the cut axis in degrees, folded into [0, 180). */
export function cutAngleDeg(cut: Cut): number {
  const a =
    cut.kind === 'line' ? (Math.atan2(cut.ny, cut.nx) * 180) / Math.PI : cut.angle;
  return ((a % 180) + 180) % 180;
}

export function describeCut(cut: Cut): string {
  if (cut.kind === 'hole') {
    const shape = cut.shape === 'leaf' ? '叶形' : cut.shape === 'circle' ? '圆形' : '菱形';
    return `镂空：${shape} 半宽 ${cut.size.toFixed(2)}，中心距 ${cut.radius.toFixed(2)}，方位 ${Math.round(cut.angle)}°`;
  }
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

  if (norm.kind === 'hole') {
    const ring = holeOutline(norm);
    if (ring.length < 3) return [];
    return intersectMP(poly(preset.packet), poly(ring));
  }

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

/**
 * The whole sheet, derived from the patch domains. Memoised per preset because
 * it only depends on the fold, and unioning 8 sectors on every drag would be
 * wasteful.
 */
const _paperCache = new Map<string, MultiPolygon>();
function paperOf(preset: FoldPreset): MultiPolygon {
  const hit = _paperCache.get(preset.id);
  if (hit) return hit;
  const paper = unionMP(...preset.patches.map((p) => poly(p.domain) as MultiPolygon));
  if (_paperCache.size > 16) _paperCache.clear();
  _paperCache.set(preset.id, paper);
  return paper;
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

  // The authoritative sheet is `P \ removed`, not `union(patch regions)`.
  //
  // The two are equal as point sets, but the difference form is far more
  // robust: `removed` is a union of simple slivers/triangles (no holes), while
  // a patch region that has had a hole cut into it can degenerate when a later
  // cut grazes that hole. It also makes `paper ⊆ P` true by construction,
  // which is one of the geometry invariants we test.
  const removed = unionMP(...state.map((s) => s.removed));
  const paper = differenceMP(paperOf(preset), removed);
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
