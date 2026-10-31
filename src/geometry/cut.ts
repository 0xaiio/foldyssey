/**
 * Cut semantics on a folded packet.
 *
 * Four primitives, all physically executable with scissors:
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
 *  4. `curve` — a *curved* stroke: the blade bends while it travels. Same
 *     angle/offset/side convention as `line`, plus `amplitude` (how far it
 *     bends away from its chord) and `bends` (how many half waves: 1 = 弧线,
 *     2 = S 形一次拐弯, 3 = 连续波浪). With `amplitude = 0` it is *exactly*
 *     the straight cut, which is the invariant the tests pin down.
 *
 * The removed area (never a zero-width line!) is intersected with the packet,
 * then pulled back through every patch's inverse isometry, so every physical
 * layer loses its own pre-image of the same cut. The union of the surviving
 * patch regions is the unfolded paper.
 *
 * Why a curve is still *exact*
 * ----------------------------
 * A curve cannot be represented exactly by a polygon engine, so it is sampled
 * into a chord polygon and the error is **bounded in closed form**, not waved
 * away. For (u, v) local coordinates the stroke is the graph
 *
 *     v = offset + A·sin(bends·π·(u − uMin)/(uMax − uMin))          (*)
 *
 * i.e. a single-valued function of u. Two consequences:
 *
 *   - the removed region is "one side of a graph", the exact generalisation of
 *     the half-plane rule, and it can never self-intersect (a path that loops
 *     or doubles back cannot be cut this way — see `docs/SCISSOR_CURVES.md`);
 *   - the chord error of an N-segment sampling is bounded by
 *     `|A|·bends²·π² / (8N²)` (standard interpolation bound with
 *     |v''| ≤ A·(bends·π/L)²), and `curveSampleCount()` picks N so that this
 *     bound is ≤ `CURVE_CHORD_TOLERANCE`. Both the target and the player's
 *     attempt go through the same sampler, so scoring compares like with like.
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
  pointInRing,
  SQUARE,
  ringArea,
  unionMP,
} from './polygon';
import { type Vec2, clamp } from './vec';

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

export type Cut = LineCut | NotchCut | HoleCut | CurveCut;

/** Backwards-compatible alias: the straight-line primitive. */
export type StraightCut = LineCut;

/* ------------------------------------------------------------------ *
 * Curved strokes
 * ------------------------------------------------------------------ */

/** How many half waves a curved stroke has: 1 arc, 2 S, 3 double bend. */
export const CURVE_BENDS = [1, 2, 3] as const;
export type CurveBends = (typeof CURVE_BENDS)[number];

/**
 * A stroke that bends while it travels.
 *
 * `angle`, `offset` and `side` mean exactly what they mean for `line`: the
 * stroke is perpendicular to the normal at `angle`, sits `offset` away from the
 * packet centre along that normal, and the chosen half is removed. `amplitude`
 * and `bends` bend that straight stroke:
 *
 *     v = offset + amplitude · sin(bends · π · t),  t = 0..1 across the packet
 *
 * so amplitude = 0 is the straight cut, bends = 1 is one bulge (弧线), 2 is an
 * S with one inflection (拐弯), 3 is a double wave (连续曲线).
 */
export type CurveCut = {
  kind: 'curve';
  /** Direction of the normal, degrees — same convention as `LineCut`. */
  angle: number;
  /** Signed distance of the stroke's chord from the packet centre. */
  offset: number;
  /** Signed bulge away from the chord. 0 = straight, ±1 = a full paper unit. */
  amplitude: number;
  /** Number of half waves across the packet: 1 arc, 2 S, 3 wave. */
  bends: CurveBends;
  removedSide: CutRemovedSide;
};

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

/** Largest allowed deviation between a sampled curve and the ideal graph. */
export const CURVE_CHORD_TOLERANCE = 1.2e-3;
/** Amplitude slider range, in paper units. */
export const CURVE_AMPLITUDE_LIMIT = 1;
/** Samples are never fewer than this (a straight-ish stroke still needs ends). */
const CURVE_MIN_SAMPLES = 24;
/** Hard cap: 192 segments already put the error at 4·10⁻⁴ for the boldest curve. */
const CURVE_MAX_SAMPLES = 192;
/** The wall that closes the removed half of the graph, far outside the packet. */
const CURVE_WALL = 6;
/** How far the stroke's ends extend past the packet's own span. */
const CURVE_END_EXTENSION = 0.6;
/** Below this the stroke is treated as straight (and equals a `line` cut). */
const CURVE_FLAT_EPS = 1e-9;

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

export function curveCut(
  angleDeg: number,
  offset: number,
  amplitude: number,
  bends: CurveBends = 1,
  removedSide: CutRemovedSide = 'positive',
): CurveCut {
  return {
    kind: 'curve',
    angle: angleDeg,
    offset,
    amplitude,
    bends: clampBends(bends),
    removedSide,
  };
}

export function clampBends(value: number): CurveBends {
  const n = Math.round(value);
  if (n <= 1) return 1;
  if (n >= 3) return 3;
  return n as CurveBends;
}

/**
 * The same stroke, written with the opposite normal.
 *
 * All three descriptors flip: the normal, the signed offset, and which side is
 * removed. The bulge flips sign too — but only for an **odd** number of half
 * waves. With an even count the sampled graph is symmetric under t -> -t, so
 * negating the amplitude would mirror the bulge instead of preserving it
 * (measured on the S-shaped level: IoU 0.37 instead of 1.0).
 *
 * Used by the canvas rotation handle: it derives a normal from the pointer and
 * has to keep the slider's angle inside [0, 180).
 */
export function curveUnderFlippedNormal(cut: CurveCut): CurveCut {
  return {
    ...cut,
    angle: ((cut.angle + 180) % 360 + 360) % 360,
    offset: -cut.offset,
    amplitude: cut.bends % 2 === 1 ? -cut.amplitude : cut.amplitude,
    removedSide: cut.removedSide === 'positive' ? 'negative' : 'positive',
  };
}

/**
 * Convert a cut to another primitive, carrying over whatever still has a
 * meaning: the direction is always kept, and the distance to the centre is
 * carried across `offset` / `distance` / `radius`.
 *
 * Used by the studio's 「刀型」 switch. Converting to `curve` starts with a
 * visible bend (0.22) on purpose: a curve with amplitude 0 is a straight cut,
 * so a switch that changed nothing on screen would look broken.
 */
export function changeCutKind(cut: Cut, kind: Cut['kind']): Cut {
  if (cut.kind === kind) return cut;
  const angle = cutAngleDeg(cut);
  const side: CutRemovedSide =
    cut.kind === 'line' || cut.kind === 'curve' ? cut.removedSide : 'positive';
  const reach =
    cut.kind === 'line' || cut.kind === 'curve'
      ? cut.offset
      : cut.kind === 'notch'
        ? cut.distance
        : cut.radius;
  const inward = Math.abs(reach);
  if (kind === 'line') {
    return cutFromAngle(angle, clamp(reach, -CUT_OFFSET_LIMIT, CUT_OFFSET_LIMIT), side);
  }
  if (kind === 'curve') {
    return curveCut(angle, clamp(reach, -CUT_OFFSET_LIMIT, CUT_OFFSET_LIMIT), 0.22, 1, side);
  }
  if (kind === 'notch') {
    return notchCut(angle, clamp(inward, 0.1, 1.2), 0.3);
  }
  return holeCut('circle', angle, clamp(inward, 0, 1.05), 0.07, 1, 0);
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
  if (kind === 'curve') {
    const { angle, offset, amplitude, bends, removedSide } = cut as CurveCut;
    if (![angle, offset, amplitude, bends].every((v) => typeof v === 'number' && Number.isFinite(v))) {
      return null;
    }
    if (removedSide !== 'negative' && removedSide !== 'positive') return null;
    // Coerce instead of failing: the bend count is a discrete control, and a
    // document saved with `2.0000001` should load rather than disappear.
    return {
      kind: 'curve',
      angle,
      offset,
      amplitude: Math.max(-1.5, Math.min(1.5, amplitude)),
      bends: clampBends(bends),
      removedSide,
    };
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
export const isCurveCut = (cut: Cut): cut is CurveCut => cut.kind === 'curve';

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
  if (cut.kind === 'curve') {
    const bend = cut.bends === 1 ? '一段弧' : cut.bends === 2 ? 'S 形，一个拐点' : '连续波浪，两个拐点';
    const shape = Math.abs(cut.amplitude) < 0.01 ? '直' : cut.amplitude > 0 ? '外凸' : '内凹';
    return (
      `曲线：法线 ${Math.round(cut.angle * 2) / 2}°，距中心 ${cut.offset.toFixed(2)}，` +
      `弯曲 ${cut.amplitude >= 0 ? '+' : '−'}${Math.abs(cut.amplitude).toFixed(2)}（${shape}·${bend}）`
    );
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

/* ------------------------------------------------------------------ *
 * Curved strokes: frame, sampling, certified error bound, region
 * ------------------------------------------------------------------ */

/** Orthonormal frame of a curved stroke, in packet coordinates. */
type CurveFrame = {
  /** Along the stroke (perpendicular to the normal). */
  ux: number;
  uy: number;
  /** The normal, identical to `(cos angle, sin angle)` of a `LineCut`. */
  vx: number;
  vy: number;
  /** Extent of the *packet* along u; the wave spans exactly this. */
  uMin: number;
  uMax: number;
};

/**
 * The wave is normalised to the packet's own span along the stroke, not to a
 * fixed world length. Rationale: `bends = 2` must mean "one full S across the
 * paper in your hand" in every fold preset, otherwise the same slider position
 * would produce a different pattern per level.
 */
function curveFrame(preset: FoldPreset, cut: CurveCut): CurveFrame {
  const rad = (cut.angle * Math.PI) / 180;
  const vx = Math.cos(rad);
  const vy = Math.sin(rad);
  const ux = -vy;
  const uy = vx;
  let uMin = Infinity;
  let uMax = -Infinity;
  for (const p of preset.packet) {
    const t = ux * p.x + uy * p.y;
    if (t < uMin) uMin = t;
    if (t > uMax) uMax = t;
  }
  if (!(uMax - uMin > 1e-9)) {
    uMin -= 1;
    uMax += 1;
  }
  return { ux, uy, vx, vy, uMin, uMax };
}

/** The ideal stroke at normalised position `t ∈ [-1, 1]`, in packet coords. */
export function curvePointAt(preset: FoldPreset, cut: CurveCut, t: number): Vec2 {
  const f = curveFrame(preset, cut);
  const u = f.uMin + ((t + 1) / 2) * (f.uMax - f.uMin);
  const v =
    cut.offset + cut.amplitude * Math.sin((cut.bends * Math.PI * (t + 1)) / 2);
  return { x: f.ux * u + f.vx * v, y: f.uy * u + f.vy * v };
}

/** How many chords the stroke is sampled into, and the error that buys. */
export function curveSampleCount(cut: Pick<CurveCut, 'amplitude' | 'bends'>): number {
  const a = Math.abs(cut.amplitude);
  if (a < CURVE_FLAT_EPS) return 2;
  const need = Math.PI * cut.bends * Math.sqrt(a / (8 * CURVE_CHORD_TOLERANCE));
  let n = Math.max(CURVE_MIN_SAMPLES, Math.min(CURVE_MAX_SAMPLES, Math.ceil(need)));
  if (n % 2 === 1) n += 1;
  return n;
}

/** Maximum distance between the sampled polyline and the ideal curve. */
export function curveChordError(cut: Pick<CurveCut, 'amplitude' | 'bends'>, samples?: number): number {
  const n = samples ?? curveSampleCount(cut);
  if (n < 2) return 0;
  return (Math.abs(cut.amplitude) * cut.bends ** 2 * Math.PI ** 2) / (8 * n ** 2);
}

/** The sampled stroke, in packet coordinates, from t = -1 to t = +1. */
export function curvePolyline(preset: FoldPreset, cut: CurveCut, samples?: number): Ring {
  const n = samples ?? curveSampleCount(cut);
  const out: Ring = [];
  for (let i = 0; i <= n; i++) out.push(curvePointAt(preset, cut, -1 + (2 * i) / n));
  return out;
}

/** Where the stroke's bulge peaks (the direct-manipulation handle sits here). */
export function curvePeak(preset: FoldPreset, cut: CurveCut): Vec2 {
  const t = 1 / cut.bends - 1;
  return curvePointAt(preset, cut, t);
}

function ensureCCW(ring: Ring): Ring {
  return ringArea(ring) < 0 ? [...ring].reverse() : ring;
}

/**
 * The removed region of a curved stroke: everything on the chosen side of the
 * graph (*), clipped to the packet.
 *
 * The polygon is the graph plus a wall far outside the packet, so the ring is
 * always simple: the graph is single-valued in u and the wall is outside every
 * possible value of `offset + amplitude`.
 */
export function curveRegion(preset: FoldPreset, cut: CurveCut): MultiPolygon {
  const f = curveFrame(preset, cut);
  const n = curveSampleCount(cut);
  const graph: Ring = [];
  for (let i = 0; i <= n; i++) {
    const t = -1 + (2 * i) / n;
    const u = f.uMin + ((t + 1) / 2) * (f.uMax - f.uMin);
    const v = cut.offset + cut.amplitude * Math.sin((cut.bends * Math.PI * (t + 1)) / 2);
    graph.push({ x: f.ux * u + f.vx * v, y: f.uy * u + f.vy * v });
  }
  const toWorld = (u: number, v: number): Vec2 => ({
    x: f.ux * u + f.vx * v,
    y: f.uy * u + f.vy * v,
  });
  const uLo = f.uMin - CURVE_END_EXTENSION;
  const uHi = f.uMax + CURVE_END_EXTENSION;
  const wall = cut.removedSide === 'positive' ? CURVE_WALL : -CURVE_WALL;
  // Trace the graph one way, then close through a wall outside the packet. The
  // winding differs per side, so the ring is normalised to CCW afterwards.
  const ring: Ring = [...graph, toWorld(uHi, wall), toWorld(uLo, wall)];
  if (ring.length < 3) return [];
  return intersectMP(poly(preset.packet), poly(ensureCCW(ring)));
}

/** The part of the stroke that lies inside the packet, for drawing. */
export type VisibleStroke = {
  points: Ring;
  /** Index of the first / last sample inside the packet. */
  from: number;
  to: number;
  /** Total length of the visible stroke, in paper units. */
  length: number;
  /** Certified deviation from the ideal curve. */
  error: number;
};

export function visibleStroke(preset: FoldPreset, cut: CurveCut): VisibleStroke | null {
  const pts = curvePolyline(preset, cut);
  const inside = pts.map((p) => pointInRing(p, preset.packet));
  const first = inside.indexOf(true);
  const last = inside.lastIndexOf(true);
  if (first < 0 || last <= first) return null;
  const slice = pts.slice(first, last + 1);
  let length = 0;
  for (let i = 1; i < slice.length; i++) {
    length += Math.hypot(slice[i].x - slice[i - 1].x, slice[i].y - slice[i - 1].y);
  }
  return { points: slice, from: first, to: last, length, error: curveChordError(cut) };
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

  if (norm.kind === 'curve') {
    return curveRegion(preset, norm);
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
  }

  // Everything that survives, computed ONCE in packet coordinates.
  //
  // Subtracting per patch used to fail silently: a curve whose edge lies
  // exactly on the packet boundary (or a transformed image of it that lands on
  // a patch edge) makes `polygon-clipping` return an empty intersection, and
  // the patch was then reported as untouched — the same cut, written with a
  // flipped normal, produced a different sheet. One subtraction in the packet
  // frame has no shared-edge degeneracy with the patch domains, and the
  // isometries then carry the result to every layer exactly.
  const survivingPacket = differenceMP(poly(preset.packet), removedPacket);

  const state = preset.patches.map((patch) => ({
    patch,
    region: transformMP(survivingPacket, patch.inverse),
    removed: transformMP(removedPacket, patch.inverse),
  }));

  // The authoritative sheet is `P` with every layer's pre-image removed.
  //
  // Subtract layer by layer instead of unioning the pre-images first. The eight
  // copies share edges (they tile P), and `polygon-clipping` can lose a whole
  // copy when two of them touch exactly — measured: at 23°/0.34 on the eight-
  // fold preset the union of the pre-images came out 12 % small, while eight
  // sequential differences gave the exact area. Each difference is independent,
  // so one fragile merge cannot move paper into or out of another layer.
  let paper = poly(SQUARE);
  for (const entry of state) paper = differenceMP(paper, entry.removed);
  // Concatenate rather than union: the eight pre-images are disjoint (each
  // lies inside its own patch, and the patches tile P), so a union adds no
  // information — but `unionMP` can drop a member when two copies share an
  // edge exactly, which made `paper + removed` differ from 4 by one layer on
  // the 团花 level. Concatenation is exact by construction and renders the same
  // with `fill-rule="evenodd"`.
  const removed = state.flatMap((s) => s.removed);
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
