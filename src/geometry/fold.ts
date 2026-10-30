/**
 * Fold presets and the paper patch model.
 *
 * A preset partitions the initial square P = [-1,1]^2 into patches. Every
 * patch carries an isometry `forward` that maps it into the folded packet,
 * plus its inverse. All four v1 presets use folds along the coordinate axes
 * through the origin, so every map is a diagonal sign matrix — but the types
 * and the interpolation below do not assume that beyond `flips`.
 *
 * See docs/GEOMETRY_SPEC.md for the full specification.
 */

import { type Mat, type Ring, IDENTITY } from './polygon';
import { type Vec2, clamp } from './vec';

export type FoldPresetId = 'none' | 'vertical' | 'horizontal' | 'orthogonal2';

export type PaperPatch = {
  id: string;
  label: string;
  /** Patch domain in paper coordinates (a closed ring). */
  domain: Ring;
  /** Isometry mapping domain -> packet. */
  forward: Mat;
  /** Isometry mapping packet -> domain (inverse of `forward`). */
  inverse: Mat;
  /** Which axes this patch is mirrored across when folded. */
  flips: { x: boolean; y: boolean };
  /** Paint order inside the folded stack; higher = closer to the viewer. */
  layer: number;
};

export type FoldStep = {
  axis: 'x' | 'y';
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
  symmetry: 'none' | 'mirror' | 'quad';
  layerCount: number;
  /** Maximum symmetric copies of a hole for this preset. */
  copies: number;
};

const square = (minX: number, minY: number, maxX: number, maxY: number): Ring => [
  { x: minX, y: minY },
  { x: maxX, y: minY },
  { x: maxX, y: maxY },
  { x: minX, y: maxY },
];

const mirrorX: Mat = { a: -1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const mirrorY: Mat = { a: 1, b: 0, c: 0, d: -1, tx: 0, ty: 0 };
const mirrorXY: Mat = { a: -1, b: 0, c: 0, d: -1, tx: 0, ty: 0 };

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
      flips: { x: false, y: false },
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
      flips: { x: false, y: false },
      layer: 2,
    },
    {
      id: 'left',
      label: '左半张',
      domain: square(-1, -1, 0, 1),
      forward: mirrorX,
      inverse: mirrorX,
      flips: { x: true, y: false },
      layer: 1,
    },
  ],
  packet: square(0, -1, 1, 1),
  steps: [{ axis: 'x', t0: 0, t1: 1, label: '左半张向右翻折' }],
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
      flips: { x: false, y: false },
      layer: 2,
    },
    {
      id: 'bottom',
      label: '下半张',
      domain: square(-1, -1, 1, 0),
      forward: mirrorY,
      inverse: mirrorY,
      flips: { x: false, y: true },
      layer: 1,
    },
  ],
  packet: square(-1, 0, 1, 1),
  steps: [{ axis: 'y', t0: 0, t1: 1, label: '下半张向上翻折' }],
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
      flips: { x: false, y: false },
      layer: 4,
    },
    {
      id: 'q2',
      label: '第二象限',
      domain: square(-1, 0, 0, 1),
      forward: mirrorX,
      inverse: mirrorX,
      flips: { x: true, y: false },
      layer: 3,
    },
    {
      id: 'q3',
      label: '第三象限',
      domain: square(-1, -1, 0, 0),
      forward: mirrorXY,
      inverse: mirrorXY,
      flips: { x: true, y: true },
      layer: 2,
    },
    {
      id: 'q4',
      label: '第四象限',
      domain: square(0, -1, 1, 0),
      forward: mirrorY,
      inverse: mirrorY,
      flips: { x: false, y: true },
      layer: 1,
    },
  ],
  packet: square(0, 0, 1, 1),
  steps: [
    { axis: 'x', t0: 0, t1: 0.55, label: '左半张向右翻折' },
    { axis: 'y', t0: 0.45, t1: 1, label: '下半张向上翻折' },
  ],
  creases: [
    { from: { x: 0, y: -1 }, to: { x: 0, y: 1 } },
    { from: { x: -1, y: 0 }, to: { x: 1, y: 0 } },
  ],
  symmetry: 'quad',
  layerCount: 4,
  copies: 4,
};

export const FOLD_PRESETS: FoldPreset[] = [NONE, VERTICAL, HORIZONTAL, ORTHOGONAL2];

export const FOLD_PRESET_MAP: Record<FoldPresetId, FoldPreset> = {
  none: NONE,
  vertical: VERTICAL,
  horizontal: HORIZONTAL,
  orthogonal2: ORTHOGONAL2,
};

export function getPreset(id: FoldPresetId): FoldPreset {
  return FOLD_PRESET_MAP[id] ?? NONE;
}

/** Progress of one fold step for a global foldedness value f in [0,1]. */
export function stepProgress(step: FoldStep, foldedness: number): number {
  const span = step.t1 - step.t0;
  if (span <= 1e-9) return foldedness >= step.t1 ? 1 : 0;
  return clamp((foldedness - step.t0) / span, 0, 1);
}

/**
 * Matrix used to render a patch at a given foldedness.
 *
 * foldedness = 0 -> patch sits at its original position.
 * foldedness = 1 -> patch is fully mapped onto the packet.
 *
 * Each mirrored axis is interpolated as a scale from +1 to -1 through 0,
 * which is exactly the orthographic "flatten onto the crease" view of a fold.
 * Points and end states are exact; the intermediate frames are an honest 2D
 * step-wise illustration, not a physical simulation.
 */
export function patchRenderMatrix(
  patch: PaperPatch,
  preset: FoldPreset,
  foldedness: number,
): Mat {
  const f = clamp(foldedness, 0, 1);
  const px = patch.flips.x
    ? stepProgress(
        preset.steps.find((s) => s.axis === 'x') ?? { axis: 'x', t0: 0, t1: 1, label: '' },
        f,
      )
    : 0;
  const py = patch.flips.y
    ? stepProgress(
        preset.steps.find((s) => s.axis === 'y') ?? { axis: 'y', t0: 0, t1: 1, label: '' },
        f,
      )
    : 0;
  return { a: 1 - 2 * px, b: 0, c: 0, d: 1 - 2 * py, tx: 0, ty: 0 };
}

/** Patches ordered so that higher layer indices paint last (on top). */
export function patchesInPaintOrder(preset: FoldPreset): PaperPatch[] {
  return [...preset.patches].sort((a, b) => a.layer - b.layer);
}
