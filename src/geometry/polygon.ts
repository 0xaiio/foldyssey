/**
 * Polygon / MultiPolygon domain types, measurement, conversion and SVG path
 * generation.
 *
 * Ring orientation is normalised on export only; the internal model does not
 * rely on winding order, `fill-rule="evenodd"` is used for rendering so holes
 * are always real empty regions.
 */

import { clipDifference, clipIntersection, clipUnion, clipXor } from './clip';
import type { ClipMulti } from './clip';
import { type Vec2, round } from './vec';

/** A closed ring of points; the closing edge is implicit (last -> first). */
export type Ring = Vec2[];
/** Outer ring first, then zero or more hole rings. */
export type Polygon = Ring[];
export type MultiPolygon = Polygon[];

export type Mat = {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
};

export const IDENTITY: Mat = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

export const applyMat = (m: Mat, p: Vec2): Vec2 => ({
  x: m.a * p.x + m.c * p.y + m.tx,
  y: m.b * p.x + m.d * p.y + m.ty,
});

/* ------------------------------------------------------------------ *
 * Conversion to / from the boolean-op library
 * ------------------------------------------------------------------ */

export function toClip(mp: MultiPolygon): ClipMulti {
  const out: number[][][][] = [];
  for (const poly of mp) {
    const rings: number[][][] = [];
    for (const ring of poly) {
      if (ring.length < 3) continue;
      const r: number[][] = [];
      for (const p of ring) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        r.push([p.x, p.y]);
      }
      if (r.length >= 3) rings.push(r);
    }
    if (rings.length > 0) out.push(rings);
  }
  return out as unknown as ClipMulti;
}

export function fromClip(mp: ClipMulti): MultiPolygon {
  const out: MultiPolygon = [];
  for (const poly of mp as unknown as number[][][][]) {
    if (!Array.isArray(poly)) continue;
    const rings: Ring[] = [];
    for (const ring of poly) {
      if (!Array.isArray(ring) || ring.length < 3) continue;
      const r: Ring = [];
      for (const pt of ring) {
        if (!Array.isArray(pt) || pt.length < 2) continue;
        const x = Number(pt[0]);
        const y = Number(pt[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        r.push({ x, y });
      }
      const cleaned = cleanRing(r);
      if (cleaned.length >= 3) rings.push(cleaned);
    }
    if (rings.length > 0) out.push(rings);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Validation / clean-up
 * ------------------------------------------------------------------ */

export function cleanRing(ring: Ring, eps = 1e-10): Ring {
  const out: Ring = [];
  for (const p of ring) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.x - p.x) < eps && Math.abs(prev.y - p.y) < eps) continue;
    out.push(p);
  }
  // Drop a duplicated closing vertex if present.
  while (
    out.length > 1 &&
    Math.abs(out[0].x - out[out.length - 1].x) < eps &&
    Math.abs(out[0].y - out[out.length - 1].y) < eps
  ) {
    out.pop();
  }
  return out;
}

export function isFiniteMultiPolygon(mp: MultiPolygon): boolean {
  if (!Array.isArray(mp)) return false;
  for (const poly of mp) {
    if (!Array.isArray(poly) || poly.length === 0) return false;
    for (const ring of poly) {
      if (!Array.isArray(ring) || ring.length < 3) return false;
      for (const p of ring) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
      }
    }
  }
  return true;
}

/** Remove slivers and near-zero-area polygons produced by boolean ops. */
export function cleanMultiPolygon(mp: MultiPolygon, minArea = 1e-9): MultiPolygon {
  const out: MultiPolygon = [];
  for (const poly of mp) {
    if (!poly.length) continue;
    const area = Math.abs(polygonArea(poly));
    if (area < minArea) continue;
    const rings = poly.map((r) => cleanRing(r)).filter((r) => r.length >= 3);
    if (rings.length === 0) continue;
    out.push(rings);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Measurement
 * ------------------------------------------------------------------ */

/** Signed shoelace area (CCW positive in a y-up frame). */
export function ringArea(ring: Ring): number {
  if (ring.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}

export function ringPerimeter(ring: Ring): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    s += Math.hypot(q.x - p.x, q.y - p.y);
  }
  return s;
}

export function polygonArea(poly: Polygon): number {
  if (!poly.length) return 0;
  const outer = Math.abs(ringArea(poly[0]));
  let holes = 0;
  for (let i = 1; i < poly.length; i++) holes += Math.abs(ringArea(poly[i]));
  return Math.max(0, outer - holes);
}

export function multiPolygonArea(mp: MultiPolygon): number {
  let s = 0;
  for (const poly of mp) s += polygonArea(poly);
  return s;
}

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export function boundsOf(points: Vec2[]): Bounds {
  if (!points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function multiPolygonBounds(mp: MultiPolygon): Bounds {
  const pts: Vec2[] = [];
  for (const poly of mp) for (const ring of poly) for (const p of ring) pts.push(p);
  return boundsOf(pts);
}

/* ------------------------------------------------------------------ *
 * Deterministic point-in-polygon (used by tests and by the Explore page)
 * ------------------------------------------------------------------ */

export function pointInRing(pt: Vec2, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    const intersects =
      a.y > pt.y !== b.y > pt.y &&
      pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y || Number.EPSILON) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInMultiPolygon(pt: Vec2, mp: MultiPolygon): boolean {
  for (const poly of mp) {
    if (!poly.length) continue;
    if (!pointInRing(pt, poly[0])) continue;
    let inHole = false;
    for (let i = 1; i < poly.length; i++) {
      if (pointInRing(pt, poly[i])) inHole = true;
    }
    if (!inHole) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * Boolean ops (Vec2 domain in, Vec2 domain out)
 * ------------------------------------------------------------------ */

/**
 * Union, applied incrementally.
 *
 * `polygon-clipping` throws (and we turn that into an empty result) when any
 * member is degenerate — a hole ring that touches the outer ring, a sliver with
 * two coincident vertices, etc. Doing the union in one shot means one bad patch
 * erases the whole sheet, which is how a hole cut used to blank the paper after
 * a later rim cut. Incremental union keeps the good accumulation and skips the
 * member that cannot be merged.
 */
export function unionMP(...list: MultiPolygon[]): MultiPolygon {
  const valid = list.filter((m) => m.length > 0);
  if (valid.length === 0) return [];
  if (valid.length === 1) return valid[0];

  let acc = valid[0];
  for (let i = 1; i < valid.length; i++) {
    const next = cleanMultiPolygon(fromClip(clipUnion(toClip(acc), toClip(valid[i]))));
    // A union of two non-empty sets cannot be empty; if it is, the member is
    // invalid (not "nothing there"), so keep what we already have.
    if (next.length === 0) continue;
    acc = next;
  }
  return acc;
}

export function intersectMP(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  if (!a.length || !b.length) return [];
  return cleanMultiPolygon(fromClip(clipIntersection(toClip(a), toClip(b))));
}

/**
 * Difference, with the same "one bad member must not erase everything" rule as
 * `unionMP`.
 *
 * A tooth diamond whose centre sits on the packet edge can turn degenerate when
 * its angle is nudged, and `polygon-clipping` then throws — which used to blank
 * the whole sheet (`A \ B` returning empty). The fast path stays one call; the
 * fallback subtracts member by member and skips the one that poisons the op.
 */
export function differenceMP(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  if (!a.length) return [];
  if (!b.length) return a;

  const whole = cleanMultiPolygon(fromClip(clipDifference(toClip(a), toClip(b))));
  if (whole.length > 0) return whole;

  // Empty result: either B really covers A, or a degenerate member broke it.
  // Area alone is not enough to claim coverage — a huge B far away from A has a
  // large area and covers nothing — so require B's bounding box to contain A's
  // before taking the shortcut. (In the app A is always the sheet and B a
  // region clipped to the packet, but the helper is used directly in tests.)
  const aArea = multiPolygonArea(a);
  const bArea = multiPolygonArea(b);
  const aBox = multiPolygonBounds(a);
  const bBox = multiPolygonBounds(b);
  const bboxCovers =
    bBox.minX <= aBox.minX + 1e-9 &&
    bBox.minY <= aBox.minY + 1e-9 &&
    bBox.maxX >= aBox.maxX - 1e-9 &&
    bBox.maxY >= aBox.maxY - 1e-9;
  if (aArea > 1e-12 && bboxCovers && bArea >= aArea * 0.98) return [];

  let acc = a;
  for (const poly of b) {
    // `toClip` takes a MultiPolygon, so a single polygon must be wrapped once
    // — `[toClip([poly])]` would be a ClipMulti nested inside a ClipMulti and
    // the boolean engine would reject it, silently turning the fallback into
    // "subtract nothing".
    const next = cleanMultiPolygon(fromClip(clipDifference(toClip(acc), toClip([poly]))));
    if (next.length === 0) continue;
    acc = next;
  }
  return acc;
}

export function xorMP(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  if (!a.length && !b.length) return [];
  if (!a.length) return b;
  if (!b.length) return a;
  return cleanMultiPolygon(fromClip(clipXor(toClip(a), toClip(b))));
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

/**
 * Build one SVG path covering every ring. Combined with
 * `fill-rule="evenodd"` this renders holes as real transparent regions.
 *
 * `mat` optionally maps every point (used for fold animation).
 * `flipY` converts the maths frame (y up) into the SVG frame (y down).
 */
export function multiPolygonToPath(
  mp: MultiPolygon,
  options?: { mat?: Mat; flipY?: boolean; digits?: number },
): string {
  const mat = options?.mat;
  const flipY = options?.flipY ?? false;
  const digits = options?.digits ?? 5;
  const chunks: string[] = [];

  for (const poly of mp) {
    for (const ring of poly) {
      if (ring.length < 3) continue;
      let d = '';
      for (let i = 0; i < ring.length; i++) {
        const src = mat ? applyMat(mat, ring[i]) : ring[i];
        const x = round(src.x, digits);
        const y = round(flipY ? -src.y : src.y, digits);
        d += `${i === 0 ? 'M' : 'L'}${x} ${y}`;
      }
      d += 'Z';
      chunks.push(d);
    }
  }
  return chunks.join(' ');
}

/** Normalised SVG path for export (absolute units 0..size). */
export function exportPath(mp: MultiPolygon, size: number, padding = 0): string {
  const b = multiPolygonBounds(mp);
  const w = Math.max(1e-6, b.maxX - b.minX);
  const h = Math.max(1e-6, b.maxY - b.minY);
  const k = (size - padding * 2) / Math.max(w, h);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const mat: Mat = {
    a: k,
    b: 0,
    c: 0,
    d: -k,
    tx: size / 2 - k * cx,
    ty: size / 2 + k * cy,
  };
  return multiPolygonToPath(mp, { mat, digits: 3 });
}

export const SQUARE: Ring = [
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
];

export const PAPER_AREA = 4; // area of [-1,1]^2
