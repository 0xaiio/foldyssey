/**
 * Minimal 2D vector helpers.
 *
 * Coordinate convention for the whole project (see docs/GEOMETRY_SPEC.md):
 *   - Paper space: the initial sheet is [-1, 1] x [-1, 1] (a = 1).
 *   - Packet space: the folded stack lives in the first quadrant-ish packet
 *     region declared by each fold preset.
 *   - SVG space: viewBox "-1.3 -1.3 2.6 2.6", y axis pointing DOWN on screen.
 *     Rendering flips y explicitly, geometry never does.
 */

export type Vec2 = { x: number; y: number };

export const vec = (x: number, y: number): Vec2 => ({ x, y });

export const add = (p: Vec2, q: Vec2): Vec2 => ({ x: p.x + q.x, y: p.y + q.y });
export const sub = (p: Vec2, q: Vec2): Vec2 => ({ x: p.x - q.x, y: p.y - q.y });
export const scale = (p: Vec2, k: number): Vec2 => ({ x: p.x * k, y: p.y * k });
export const dot = (p: Vec2, q: Vec2): number => p.x * q.x + p.y * q.y;
export const cross = (p: Vec2, q: Vec2): number => p.x * q.y - p.y * q.x;
export const length = (p: Vec2): number => Math.hypot(p.x, p.y);
export const dist = (p: Vec2, q: Vec2): number => Math.hypot(p.x - q.x, p.y - q.y);

export function normalize(p: Vec2): Vec2 {
  const l = length(p);
  if (!Number.isFinite(l) || l < 1e-12) return { x: 0, y: 0 };
  return { x: p.x / l, y: p.y / l };
}

/** Rotate 90 degrees counter-clockwise. */
export const perp = (p: Vec2): Vec2 => ({ x: -p.y, y: p.x });

export const clamp = (x: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, x));

export const isFiniteVec = (p: Vec2): boolean =>
  Number.isFinite(p.x) && Number.isFinite(p.y);

/** Round to a small number of decimals, used to keep SVG paths readable. */
export const round = (x: number, digits = 5): number => {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
};
