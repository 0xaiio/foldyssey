/**
 * Fold presets and the paper patch model.
 *
 * A preset partitions the initial square P = [-1,1]^2 into patches. Every
 * patch carries an isometry `forward` that maps it into the folded packet,
 * its inverse, and the ordered list of fold steps that moved it.
 *
 * Folding is modelled with the 3D fold projected onto the plane: a flap turning
 * by θ about the crease line L has its perpendicular distance scaled by cos θ.
 * That gives an affine map
 *
 *     M(θ) = cosθ·I + (1−cosθ)·A      t(θ) = (1−cosθ)·(q − A q)
 *
 * where A = d dᵀ is the projection onto the crease direction d and q a point on
 * the crease. At θ = π it is exactly the reflection across L, so the rendered
 * end state matches the geometry the cut engine uses; intermediate frames are an
 * honest 2D step-wise illustration.
 *
 * See docs/GEOMETRY_SPEC.md for the full specification.
 */

import { type Mat, type Ring, applyMat, IDENTITY } from './polygon';
import { type Vec2, clamp } from './vec';

export type FoldPresetId = 'none' | 'vertical' | 'horizontal' | 'orthogonal2' | 'radial8';

export type PaperPatch = {
  id: string;
  label: string;
  /** Patch domain in paper coordinates (a closed ring). */
  domain: Ring;
  /** Isometry mapping domain -> packet. */
  forward: Mat;
  /** Isometry mapping packet -> domain (inverse of `forward`). */
  inverse: Mat;
  /** Fold steps that move this patch, in the order they are applied. */
  history: string[];
  /** Paint order inside the folded stack; higher = closer to the viewer. */
  layer: number;
};

export type FoldStep = {
  id: string;
  /** A point on the crease. */
  point: Vec2;
  /** Unit direction of the crease. */
  dir: Vec2;
  /** Normalised time interval inside the fold, 0..1. */
  t0: number;
  t1: number;
  label: string;
};

export type FoldPreset = {
  id: FoldPresetId;
  label: string;
  shortLabel: string;
  description: string;
  patches: PaperPatch[];
  /** Outline of the folded packet in packet coordinates. */
  packet: Ring;
  steps: FoldStep[];
  creases: { from: Vec2; to: Vec2 }[];
  symmetry: 'none' | 'mirror' | 'quad' | 'octa';
  layerCount: number;
  /** Maximum symmetric copies of a hole for this preset. */
  copies: number;
  /** Convenience flag for the UI: this preset needs the 8-fold explanation. */
  isRadial?: boolean;
};

const square = (minX: number, minY: number, maxX: number, maxY: number): Ring => [
  { x: minX, y: minY },
  { x: maxX, y: minY },
  { x: maxX, y: maxY },
  { x: minX, y: maxY },
];

/* ------------------------------------------------------------------ *
 * Matrix helpers
 * ------------------------------------------------------------------ */

const mirrorX: Mat = { a: -1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const mirrorY: Mat = { a: 1, b: 0, c: 0, d: -1, tx: 0, ty: 0 };
const mirrorXY: Mat = { a: -1, b: 0, c: 0, d: -1, tx: 0, ty: 0 };
const mirrorYX: Mat = { a: 0, b: 1, c: 1, d: 0, tx: 0, ty: 0 }; // reflect across y = x
const mirrorNegYX: Mat = { a: 0, b: -1, c: -1, d: 0, tx: 0, ty: 0 }; // reflect across y = -x
const rot90: Mat = { a: 0, b: 1, c: -1, d: 0, tx: 0, ty: 0 };
const rot270: Mat = { a: 0, b: -1, c: 1, d: 0, tx: 0, ty: 0 };

/** A∘B: apply B first, then A. */
export function composeMat(a: Mat, b: Mat): Mat {
  return {
    a: a.a * b.a + a.c * b.b,
    b: a.b * b.a + a.d * b.b,
    c: a.a * b.c + a.c * b.d,
    d: a.b * b.c + a.d * b.d,
    tx: a.a * b.tx + a.c * b.ty + a.tx,
    ty: a.b * b.tx + a.d * b.ty + a.ty,
  };
}

export function transposeMat(m: Mat): Mat {
  return { a: m.a, b: m.c, c: m.b, d: m.d, tx: -(m.a * m.tx + m.c * m.ty), ty: -(m.b * m.tx + m.d * m.ty) };
}

/* ------------------------------------------------------------------ *
 * Fold animation
 * ------------------------------------------------------------------ */

/** Progress of one fold step for a global foldedness value f in [0,1]. */
export function stepProgress(step: FoldStep, foldedness: number): number {
  const span = step.t1 - step.t0;
  if (span <= 1e-9) return foldedness >= step.t1 ? 1 : 0;
  return clamp((foldedness - step.t0) / span, 0, 1);
}

/**
 * Affine transform of a flap folded by θ = π·progress about `step`'s crease.
 * progress = 0 → identity, progress = 1 → exact mirror across the crease.
 */
export function foldStepMatrix(step: FoldStep, progress: number): Mat {
  const p = clamp(progress, 0, 1);
  if (p <= 0) return IDENTITY;
  const cos = Math.cos(Math.PI * p);
  const k = 1 - cos;
  const { x: qx, y: qy } = step.point;
  const { x: dx, y: dy } = step.dir;

  // A = d dᵀ (projection onto the crease direction)
  const a00 = dx * dx;
  const a01 = dx * dy;
  const a11 = dy * dy;

  const a = cos + k * a00;
  const b = k * a01;
  const c = k * a01;
  const d = cos + k * a11;

  const aqX = a00 * qx + a01 * qy;
  const aqY = a01 * qx + a11 * qy;

  return { a, b, c, d, tx: k * (qx - aqX), ty: k * (qy - aqY) };
}

/**
 * Matrix used to render a patch at a given foldedness.
 *
 * foldedness = 0 -> the patch sits at its original position.
 * foldedness = 1 -> the patch is exactly at `patch.forward`.
 *
 * The steps are composed in the order the paper was folded, so a patch that is
 * moved twice follows the same path a real sheet would.
 */
export function patchRenderMatrix(
  patch: PaperPatch,
  preset: FoldPreset,
  foldedness: number,
): Mat {
  const f = clamp(foldedness, 0, 1);
  let m: Mat = IDENTITY;
  for (const id of patch.history) {
    const step = preset.steps.find((s) => s.id === id);
    if (!step) continue;
    m = composeMat(foldStepMatrix(step, stepProgress(step, f)), m);
  }
  return m;
}

/** Patches ordered so that higher layer indices paint last (on top). */
export function patchesInPaintOrder(preset: FoldPreset): PaperPatch[] {
  return [...preset.patches].sort((a, b) => a.layer - b.layer);
}

/* ------------------------------------------------------------------ *
 * Presets
 * ------------------------------------------------------------------ */

const NONE: FoldPreset = {
  id: 'none',
  label: '不折叠',
  shortLabel: '整张',
  description: '一张完整的纸。剪一刀就削掉一侧，是最直观的入门。',
  patches: [
    {
      id: 'full',
      label: '整张纸',
      domain: square(-1, -1, 1, 1),
      forward: IDENTITY,
      inverse: IDENTITY,
      history: [],
      layer: 1,
    },
  ],
  packet: square(-1, -1, 1, 1),
  steps: [],
  creases: [],
  symmetry: 'none',
  layerCount: 1,
  copies: 1,
};

const VERTICAL: FoldPreset = {
  id: 'vertical',
  label: '沿竖直中线对折',
  shortLabel: '竖折',
  description: '左半张翻到右半张上。一刀剪出的镂空，展开后沿竖直中轴左右镜像。',
  patches: [
    {
      id: 'right',
      label: '右半张',
      domain: square(0, -1, 1, 1),
      forward: IDENTITY,
      inverse: IDENTITY,
      history: [],
      layer: 2,
    },
    {
      id: 'left',
      label: '左半张',
      domain: square(-1, -1, 0, 1),
      forward: mirrorX,
      inverse: mirrorX,
      history: ['v'],
      layer: 1,
    },
  ],
  packet: square(0, -1, 1, 1),
  steps: [{ id: 'v', point: { x: 0, y: 0 }, dir: { x: 0, y: 1 }, t0: 0, t1: 1, label: '左半张向右翻折' }],
  creases: [{ from: { x: 0, y: -1 }, to: { x: 0, y: 1 } }],
  symmetry: 'mirror',
  layerCount: 2,
  copies: 2,
};

const HORIZONTAL: FoldPreset = {
  id: 'horizontal',
  label: '沿水平中线对折',
  shortLabel: '横折',
  description: '下半张翻到上半张上。展开后图案沿水平中轴上下镜像。',
  patches: [
    {
      id: 'top',
      label: '上半张',
      domain: square(-1, 0, 1, 1),
      forward: IDENTITY,
      inverse: IDENTITY,
      history: [],
      layer: 2,
    },
    {
      id: 'bottom',
      label: '下半张',
      domain: square(-1, -1, 1, 0),
      forward: mirrorY,
      inverse: mirrorY,
      history: ['h'],
      layer: 1,
    },
  ],
  packet: square(-1, 0, 1, 1),
  steps: [{ id: 'h', point: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, t0: 0, t1: 1, label: '下半张向上翻折' }],
  creases: [{ from: { x: -1, y: 0 }, to: { x: 1, y: 0 } }],
  symmetry: 'mirror',
  layerCount: 2,
  copies: 2,
};

const ORTHOGONAL2: FoldPreset = {
  id: 'orthogonal2',
  label: '正交双折（竖折 + 横折）',
  shortLabel: '双折',
  description:
    '先沿竖直中线对折，再沿水平中线对折。四层纸叠成一包，一刀的图案展开后同时沿两条轴镜像。',
  patches: [
    {
      id: 'q1',
      label: '第一象限（顶层）',
      domain: square(0, 0, 1, 1),
      forward: IDENTITY,
      inverse: IDENTITY,
      history: [],
      layer: 4,
    },
    {
      id: 'q2',
      label: '第二象限',
      domain: square(-1, 0, 0, 1),
      forward: mirrorX,
      inverse: mirrorX,
      history: ['v'],
      layer: 3,
    },
    {
      id: 'q3',
      label: '第三象限',
      domain: square(-1, -1, 0, 0),
      forward: mirrorXY,
      inverse: mirrorXY,
      history: ['v', 'h'],
      layer: 2,
    },
    {
      id: 'q4',
      label: '第四象限',
      domain: square(0, -1, 1, 0),
      forward: mirrorY,
      inverse: mirrorY,
      history: ['h'],
      layer: 1,
    },
  ],
  packet: square(0, 0, 1, 1),
  steps: [
    { id: 'v', point: { x: 0, y: 0 }, dir: { x: 0, y: 1 }, t0: 0, t1: 0.55, label: '左半张向右翻折' },
    { id: 'h', point: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, t0: 0.45, t1: 1, label: '下半张向上翻折' },
  ],
  creases: [
    { from: { x: 0, y: -1 }, to: { x: 0, y: 1 } },
    { from: { x: -1, y: 0 }, to: { x: 1, y: 0 } },
  ],
  symmetry: 'quad',
  layerCount: 4,
  copies: 4,
};

/* ------------------------------------------------------------------ *
 * radial8 — the classic window-flower fold (D4, 8 layers)
 * ------------------------------------------------------------------ */

/** Fundamental domain: the 45° wedge 0 ≤ v ≤ u ≤ 1. */
const WEDGE: Ring = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
];

type Sector = { id: string; label: string; forward: Mat; history: string[] };

/**
 * forward maps the sector onto the wedge; history is the folds that move it.
 * Derived by walking the three folds in order (see docs/GEOMETRY_SPEC.md §3).
 */
const SECTORS: Sector[] = [
  { id: 's0', label: '0°–45°（顶层）', forward: IDENTITY, history: [] },
  { id: 's1', label: '45°–90°', forward: mirrorYX, history: ['d'] },
  { id: 's2', label: '90°–135°', forward: rot270, history: ['v', 'd'] },
  { id: 's3', label: '135°–180°', forward: mirrorX, history: ['v'] },
  { id: 's4', label: '180°–225°', forward: mirrorXY, history: ['v', 'h'] },
  { id: 's5', label: '225°–270°', forward: mirrorNegYX, history: ['v', 'h', 'd'] },
  { id: 's6', label: '270°–315°', forward: rot90, history: ['h', 'd'] },
  { id: 's7', label: '315°–360°', forward: mirrorY, history: ['h'] },
];

const RADIAL8: FoldPreset = {
  id: 'radial8',
  label: '团花八折（竖折 + 横折 + 对角折）',
  shortLabel: '八折',
  description:
    '把纸折成 45° 的尖角：八层叠在同一块楔形纸包上。一刀下去，展开是一个八重对称的团花——' +
    '这是传统窗花最常用的折法。',
  patches: SECTORS.map((s, i) => ({
    id: s.id,
    label: s.label,
    domain: WEDGE.map((p) => applyMat(transposeMat(s.forward), p)),
    forward: s.forward,
    inverse: transposeMat(s.forward),
    history: s.history,
    layer: 8 - i,
  })),
  packet: WEDGE,
  steps: [
    { id: 'v', point: { x: 0, y: 0 }, dir: { x: 0, y: 1 }, t0: 0, t1: 0.34, label: '左半张向右翻折' },
    { id: 'h', point: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, t0: 0.28, t1: 0.62, label: '下半张向上翻折' },
    { id: 'd', point: { x: 0, y: 0 }, dir: { x: Math.SQRT1_2, y: Math.SQRT1_2 }, t0: 0.56, t1: 1, label: '沿对角线折成尖角' },
  ],
  creases: [
    { from: { x: 0, y: -1 }, to: { x: 0, y: 1 } },
    { from: { x: -1, y: 0 }, to: { x: 1, y: 0 } },
    { from: { x: -1, y: -1 }, to: { x: 1, y: 1 } },
  ],
  symmetry: 'octa',
  layerCount: 8,
  copies: 8,
  isRadial: true,
};

export const FOLD_PRESETS: FoldPreset[] = [NONE, VERTICAL, HORIZONTAL, ORTHOGONAL2, RADIAL8];

export const FOLD_PRESET_MAP: Record<FoldPresetId, FoldPreset> = {
  none: NONE,
  vertical: VERTICAL,
  horizontal: HORIZONTAL,
  orthogonal2: ORTHOGONAL2,
  radial8: RADIAL8,
};

export function getPreset(id: FoldPresetId): FoldPreset {
  return FOLD_PRESET_MAP[id] ?? NONE;
}
