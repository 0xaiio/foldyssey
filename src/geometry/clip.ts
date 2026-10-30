/**
 * Thin adapter around `polygon-clipping`.
 *
 * The library is a polygon boolean-operation engine, NOT an origami engine.
 * Everything about folds, layers, inverse maps and cut semantics lives in
 * `fold.ts` / `cut.ts`; this module only converts data shapes and wraps the
 * four boolean operations with defensive validation.
 */

type ClipRing = number[][];
type ClipPoly = ClipRing[];
type ClipMulti = ClipPoly[];

type Clipper = {
  union: (geom: ClipMulti, ...geoms: ClipMulti[]) => ClipMulti;
  intersection: (geom: ClipMulti, ...geoms: ClipMulti[]) => ClipMulti;
  difference: (geom: ClipMulti, ...geoms: ClipMulti[]) => ClipMulti;
  xor: (geom: ClipMulti, ...geoms: ClipMulti[]) => ClipMulti;
};

// Robust to both `export default` and named-export interop shapes.
import * as pcNamespace from 'polygon-clipping';

const ns = pcNamespace as unknown as Clipper & { default?: Clipper };
const clipper: Clipper = (ns.default ?? ns) as Clipper;

const EMPTY: ClipMulti = [];

function safe(fn: () => ClipMulti): ClipMulti {
  try {
    const out = fn();
    return Array.isArray(out) ? out : EMPTY;
  } catch {
    // Degenerate / non-simple input: treat as empty rather than crashing the app.
    return EMPTY;
  }
}

export function clipUnion(...geoms: ClipMulti[]): ClipMulti {
  const valid = geoms.filter((g) => Array.isArray(g) && g.length > 0);
  if (valid.length === 0) return EMPTY;
  if (valid.length === 1) return valid[0];
  return safe(() => clipper.union(valid[0], ...valid.slice(1)));
}

export function clipIntersection(a: ClipMulti, b: ClipMulti): ClipMulti {
  if (!a?.length || !b?.length) return EMPTY;
  return safe(() => clipper.intersection(a, b));
}

export function clipDifference(a: ClipMulti, b: ClipMulti): ClipMulti {
  if (!a?.length) return EMPTY;
  if (!b?.length) return a;
  return safe(() => clipper.difference(a, b));
}

export function clipXor(a: ClipMulti, b: ClipMulti): ClipMulti {
  if (!a?.length && !b?.length) return EMPTY;
  if (!a?.length) return b;
  if (!b?.length) return a;
  return safe(() => clipper.xor(a, b));
}

export type { ClipMulti, ClipPoly, ClipRing };
