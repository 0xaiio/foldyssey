import { useCallback, useMemo, useRef } from 'react';

import type { Cut, CutOutcome } from '../geometry/cut';
import {
  CURVE_AMPLITUDE_LIMIT,
  CUT_OFFSET_LIMIT,
  cutFromAngle,
  NOTCH_REACH,
  clipRayToRing,
  curveUnderFlippedNormal,
  holeOutline,
  normalizeCut,
  visibleStroke,
} from '../geometry/cut';
import { type FoldPreset, patchRenderMatrix } from '../geometry/fold';
import {
  type MultiPolygon,
  multiPolygonBounds,
  multiPolygonToPath,
  pointInRing,
} from '../geometry/polygon';
import { type Vec2, clamp } from '../geometry/vec';

export const FULL_VIEW = { x: -1.26, y: -1.26, w: 2.52, h: 2.52 };

type Box = { x: number; y: number; w: number; h: number };

export type PaperStageProps = {
  preset: FoldPreset;
  outcome: CutOutcome;
  foldedness: number;
  cut?: Cut | null;
  showCutLine?: boolean;
  /** Region that will be removed, in packet coordinates (preview before cutting). */
  previewRemoved?: MultiPolygon | null;
  onCutChange?: (cut: Cut) => void;
  paperColor?: string;
  accentColor?: string;
  showCreases?: boolean;
  targetOutline?: MultiPolygon | null;
  diffExtra?: MultiPolygon | null;
  diffMissing?: MultiPolygon | null;
  removedOpacity?: number;
  fall?: number;
  /** Keep the camera on the whole sheet even when folded. */
  noZoom?: boolean;
  className?: string;
  ariaLabel?: string;
};

type DragMode = 'translate' | 'rotate' | 'bend' | null;

/** A handle on the cut. `k` is the sine factor at a bend handle (see `applyDrag`). */
type Handle = { p: Vec2; role: Exclude<DragMode, null>; k?: number };

type CutGeom = {
  /** SVG sub-paths for the blade line. */
  paths: string[];
  /** Dashed construction lines (the chord a curve bends away from). */
  guides: { a: Vec2; b: Vec2 }[];
  /** Inflection markers: where the blade changes which way it turns. */
  inflections: Vec2[];
  handles: Handle[];
  r: number;
  hit: number;
};

const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a || 1), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Square view box that frames the folded packet with a margin.
 *
 * NOTE the sign of y: the drawing group is flipped with `scale(1,-1)` so the
 * maths frame (y up) becomes the SVG frame (y down). A view box is expressed in
 * SVG coordinates, therefore its vertical centre must be the *negated* maths
 * centre. Getting this wrong silently crops the packet.
 */
function packetView(preset: FoldPreset): Box {
  const b = multiPolygonBounds([[preset.packet]]);
  const cx = (b.minX + b.maxX) / 2;
  const cy = -(b.minY + b.maxY) / 2;
  const w = Math.max(b.maxX - b.minX, b.maxY - b.minY) + 0.46;
  return { x: cx - w / 2, y: cy - w / 2, w, h: w };
}

function lerpBox(a: Box, b: Box, t: number): Box {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    w: a.w + (b.w - a.w) * t,
    h: a.h + (b.h - a.h) * t,
  };
}

export function PaperStage({
  preset,
  outcome,
  foldedness,
  cut,
  showCutLine = false,
  previewRemoved,
  onCutChange,
  paperColor = '#B93645',
  accentColor = '#D84A49',
  showCreases = true,
  targetOutline,
  diffExtra,
  diffMissing,
  removedOpacity = 0,
  fall = 0,
  noZoom = false,
  className,
  ariaLabel = '剪纸纸张预览',
}: PaperStageProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ mode: DragMode; pointerId: number; k: number }>({
    mode: null,
    pointerId: -1,
    k: 1,
  });

  // Camera: zoom gently onto the folded packet so the packet stays usable.
  const view = useMemo<Box>(() => {
    if (noZoom) return FULL_VIEW;
    const z = smoothstep(0.72, 1, foldedness);
    return lerpBox(FULL_VIEW, packetView(preset), z);
  }, [foldedness, preset, noZoom]);

  const viewRef = useRef(view);
  viewRef.current = view;

  const pivot = useMemo<Vec2>(() => {
    const b = multiPolygonBounds([[preset.packet]]);
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  }, [preset.packet]);

  const toMath = useCallback((clientX: number, clientY: number): Vec2 => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const vb = viewRef.current;
    const rect = svg.getBoundingClientRect();
    const scale = Math.min(rect.width / vb.w, rect.height / vb.h) || 1;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return {
      x: vb.x + vb.w / 2 + (clientX - cx) / scale,
      // vb.y is an SVG (y-down) coordinate, the maths point is its negation.
      y: -(vb.y + vb.h / 2) - (clientY - cy) / scale,
    };
  }, []);

  const applyDrag = useCallback(
    (p: Vec2, mode: DragMode, k = 1) => {
      if (!onCutChange || !cut || !mode) return;

      if (cut.kind === 'notch') {
        const rad = (cut.angle * Math.PI) / 180;
        const u = { x: Math.cos(rad), y: Math.sin(rad) };
        if (mode === 'translate') {
          const projected = u.x * p.x + u.y * p.y;
          onCutChange({ ...cut, distance: clamp(projected, 0, CUT_OFFSET_LIMIT) });
        } else {
          const dx = p.x - pivot.x;
          const dy = p.y - pivot.y;
          if (Math.hypot(dx, dy) < 1e-6) return;
          const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
          // Snap to the slider's half-degree grid: a drag should not leave the
          // cut on 22.37° while the control reads 22.5°.
          const snapped = Math.round((((deg % 180) + 180) % 180) * 2) / 2;
          onCutChange({ ...cut, angle: snapped });
        }
        return;
      }

      if (cut.kind === 'hole') {
        if (mode === 'translate') {
          const r = Math.hypot(p.x, p.y);
          const deg = (Math.atan2(p.y, p.x) * 180) / Math.PI;
          onCutChange({
            ...cut,
            radius: clamp(r, 0, 1.05),
            angle: Math.round((((deg % 360) + 360) % 360) * 2) / 2,
          });
        } else {
          const cx = Math.cos((cut.angle * Math.PI) / 180) * cut.radius;
          const cy = Math.sin((cut.angle * Math.PI) / 180) * cut.radius;
          const dx = p.x - cx;
          const dy = p.y - cy;
          if (Math.hypot(dx, dy) < 1e-6) return;
          const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
          onCutChange({ ...cut, rotation: Math.round((((deg % 180) + 180) % 180)) });
        }
        return;
      }

      if (cut.kind === 'curve') {
        const rad = (cut.angle * Math.PI) / 180;
        const vx = Math.cos(rad);
        const vy = Math.sin(rad);
        if (mode === 'translate') {
          const projected = vx * p.x + vy * p.y;
          onCutChange({ ...cut, offset: clamp(projected, -CUT_OFFSET_LIMIT, CUT_OFFSET_LIMIT) });
          return;
        }
        if (mode === 'bend') {
          // The handle sits at a known crest, where v·p = offset + A·k.
          if (Math.abs(k) < 0.2) return;
          const a = clamp((vx * p.x + vy * p.y - cut.offset) / k, -CURVE_AMPLITUDE_LIMIT, CURVE_AMPLITUDE_LIMIT);
          onCutChange({ ...cut, amplitude: Math.round(a * 100) / 100 });
          return;
        }
        const dx = p.x - pivot.x;
        const dy = p.y - pivot.y;
        if (Math.hypot(dx, dy) < 1e-6) return;
        const phi = Math.atan2(dy, dx) + Math.PI / 2;
        const nx = Math.cos(phi);
        const ny = Math.sin(phi);
        const distance = cut.offset - (vx * pivot.x + vy * pivot.y);
        const offset = nx * pivot.x + ny * pivot.y + distance;
        const a = Math.atan2(ny, nx);
        const next = { ...cut, angle: Math.round(((a * 180) / Math.PI) * 2) / 2, offset };
        // The slider lives in [0, 180): when the pointer puts the normal in the
        // lower half-plane, rewrite the same stroke with the opposite normal.
        onCutChange(a < 0 ? curveUnderFlippedNormal(next) : next);
        return;
      }

      if (mode === 'translate') {
        const projected = cut.nx * p.x + cut.ny * p.y;
        onCutChange({ ...cut, offset: clamp(projected, -CUT_OFFSET_LIMIT, CUT_OFFSET_LIMIT) });
        return;
      }
      const dx = p.x - pivot.x;
      const dy = p.y - pivot.y;
      if (Math.hypot(dx, dy) < 1e-6) return;
      const phi = Math.atan2(dy, dx) + Math.PI / 2;
      const nx = Math.cos(phi);
      const ny = Math.sin(phi);
      const distance = cut.offset - (cut.nx * pivot.x + cut.ny * pivot.y);
      const offset = nx * pivot.x + ny * pivot.y + distance;
      // Normalise the normal into [0, 180) and onto the half-degree grid, so the
      // state always matches what the angle slider shows.
      let deg = (Math.atan2(ny, nx) * 180) / Math.PI;
      let side = cut.removedSide;
      let signedOffset = offset;
      if (deg < 0) {
        deg += 180;
        signedOffset = -offset;
        side = side === 'positive' ? 'negative' : 'positive';
      }
      onCutChange(cutFromAngle(Math.round(deg * 2) / 2, signedOffset, side));
    },
    [cut, onCutChange, pivot.x, pivot.y],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!onCutChange || !cut || !showCutLine) return;
      const target = e.target as Element | null;
      const roleEl = target?.closest?.('[data-cut-role]') as Element | null;
      const role = roleEl?.getAttribute('data-cut-role') as DragMode | null;
      const kAttr = roleEl?.getAttribute('data-cut-k');
      const k = kAttr == null ? 1 : Number(kAttr);
      // Touch users get the handles only, so the page can still scroll over the
      // canvas; a mouse can click anywhere to move the stroke (the old
      // behaviour). `touch-action: pan-y` on the SVG backs this up in CSS.
      if (!role && e.pointerType !== 'mouse') return;
      const mode: DragMode = role ?? 'translate';
      dragRef.current = { mode, pointerId: e.pointerId, k };
      e.currentTarget.setPointerCapture?.(e.pointerId);
      applyDrag(toMath(e.clientX, e.clientY), mode, k);
    },
    [applyDrag, cut, onCutChange, showCutLine, toMath],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const { mode, pointerId, k } = dragRef.current;
      if (!mode || pointerId !== e.pointerId) return;
      applyDrag(toMath(e.clientX, e.clientY), mode, k);
    },
    [applyDrag, toMath],
  );

  const endDrag = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current.pointerId === e.pointerId) {
      dragRef.current = { mode: null, pointerId: -1, k: 1 };
    }
  }, []);

  const patches = useMemo(
    () => [...outcome.patches].sort((a, b) => a.patch.layer - b.patch.layer),
    [outcome],
  );

  const cutGeom = useMemo<CutGeom | null>(() => {
    if (!cut) return null;
    const norm = normalizeCut(cut);
    if (!norm) return null;
    const r = view.w * 0.028;
    const hit = view.w * 0.075;
    const pathOf = (pts: Vec2[], close: boolean): string =>
      pts.length < 2
        ? ''
        : `M${pts.map((p) => `${p.x.toFixed(5)} ${p.y.toFixed(5)}`).join('L')}${close ? 'Z' : ''}`;

    if (norm.kind === 'notch') {
      const rad = (norm.angle * Math.PI) / 180;
      const u = { x: Math.cos(rad), y: Math.sin(rad) };
      const per = { x: -u.y, y: u.x };
      const apex = { x: u.x * norm.distance, y: u.y * norm.distance };
      const half = norm.width / 2;
      const armDir = (sgn: number) => {
        const target = {
          x: apex.x + u.x * NOTCH_REACH + per.x * half * sgn,
          y: apex.y + u.y * NOTCH_REACH + per.y * half * sgn,
        };
        const len = Math.hypot(target.x - apex.x, target.y - apex.y) || 1;
        const dir = { x: (target.x - apex.x) / len, y: (target.y - apex.y) / len };
        const t = Math.min(clipRayToRing(preset.packet, apex, dir), NOTCH_REACH);
        return { x: apex.x + dir.x * t, y: apex.y + dir.y * t };
      };
      const left = armDir(1);
      const right = armDir(-1);
      return {
        paths: [pathOf([left, apex, right], false)],
        guides: [],
        inflections: [apex],
        handles: [
          { p: apex, role: 'translate' },
          { p: left, role: 'rotate' },
          { p: right, role: 'rotate' },
        ],
        r,
        hit,
      };
    }

    if (norm.kind === 'hole') {
      const ring = holeOutline(norm);
      const centre = {
        x: Math.cos((norm.angle * Math.PI) / 180) * norm.radius,
        y: Math.sin((norm.angle * Math.PI) / 180) * norm.radius,
      };
      return {
        paths: [pathOf(ring, true)],
        guides: [],
        inflections: [],
        handles: [
          { p: centre, role: 'translate' },
          { p: ring[0] ?? centre, role: 'rotate' },
        ],
        r: r * 0.8,
        hit,
      };
    }

    if (norm.kind === 'curve') {
      const stroke = visibleStroke(preset, norm);
      if (!stroke) return null;
      const pts = stroke.points;
      const rad = (norm.angle * Math.PI) / 180;
      const vx = Math.cos(rad);
      const vy = Math.sin(rad);
      // The bend handle goes on the visible sample that deviates most from the
      // chord, so it is always on screen — and `k` records the sine factor
      // there, which is what makes the drag follow the finger.
      let best = 0;
      let bestAbs = -1;
      pts.forEach((p, i) => {
        const dev = Math.abs(vx * p.x + vy * p.y - norm.offset);
        if (dev > bestAbs) {
          bestAbs = dev;
          best = i;
        }
      });
      const bendPoint = pts[best];
      const dev = vx * bendPoint.x + vy * bendPoint.y - norm.offset;
      const k = Math.abs(norm.amplitude) > 1e-6 ? clamp(dev / norm.amplitude, -1, 1) : 1;
      const inflections: Vec2[] = [];
      for (let m = 1; m < norm.bends; m++) {
        const t = (2 * m) / norm.bends - 1;
        const u = (t + 1) / 2;
        const idx = Math.round(u * (pts.length - 1));
        const p = pts[idx];
        if (p && pointInRing(p, preset.packet)) inflections.push(p);
      }
      return {
        paths: [pathOf(pts, false)],
        guides: [{ a: pts[0], b: pts[pts.length - 1] }],
        inflections,
        handles: [
          { p: pts[Math.floor(pts.length / 2)], role: 'translate' },
          { p: pts[0], role: 'rotate' },
          { p: pts[pts.length - 1], role: 'rotate' },
          { p: bendPoint, role: 'bend', k: Math.abs(k) < 0.2 ? (k < 0 ? -1 : 1) : k },
        ],
        r,
        hit,
      };
    }

    const t = { x: -norm.ny, y: norm.nx };
    const center = { x: norm.nx * norm.offset, y: norm.ny * norm.offset };
    const L = view.w * 0.42;
    const a = { x: center.x - t.x * L, y: center.y - t.y * L };
    const b = { x: center.x + t.x * L, y: center.y + t.y * L };
    return {
      paths: [pathOf([a, b], false)],
      guides: [],
      inflections: [],
      handles: [
        { p: a, role: 'rotate' },
        { p: b, role: 'rotate' },
      ],
      r,
      hit,
    };
  }, [cut, view.w, preset]);

  const flapStroke = smoothstep(0.06, 0.3, foldedness);
  const silhouette = 1 - smoothstep(0.02, 0.22, foldedness);
  const flat = foldedness < 0.02;
  const unionPath = useMemo(() => multiPolygonToPath(outcome.paper), [outcome.paper]);
  const ghostOpacity = 1 - smoothstep(0.05, 0.5, foldedness);
  // Fold guides: faint on the flat sheet, strongest mid-fold, gone once the
  // packet is closed (where they would just sit on the packet edges).
  const creaseOpacity =
    0.9 * (1 - smoothstep(0.88, 0.99, foldedness)) * (0.45 + 0.55 * smoothstep(0.05, 0.4, foldedness));
  const fallMat = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: -0.55 * fall };

  return (
    <svg
      ref={svgRef}
      className={`stage${className ? ` ${className}` : ''}`}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      role="img"
      aria-label={ariaLabel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{ touchAction: onCutChange && showCutLine ? 'pan-y' : 'auto' }}
    >
      <defs>
        {/* userSpaceOnUse: every flap samples the same light field, so the
            unfolded sheet reads as one piece of paper instead of a mosaic. */}
        <linearGradient
          id="foldyssey-paper-shade"
          gradientUnits="userSpaceOnUse"
          x1={-1}
          y1={1}
          x2={1}
          y2={-1}
        >
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.3" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.03" />
          <stop offset="100%" stopColor="#1b1b1a" stopOpacity="0.17" />
        </linearGradient>
        <filter id="foldyssey-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0.018" stdDeviation="0.028" floodColor="#2a2320" floodOpacity="0.3" />
        </filter>
        {/* "Cut here" hatch: readable on any paper colour, unlike a tinted fill. */}
        <pattern
          id="foldyssey-hatch"
          width="0.06"
          height="0.06"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="0.06" stroke="#FFFDF7" strokeWidth="0.008" strokeOpacity="0.62" />
        </pattern>
      </defs>

      <g transform="scale(1,-1)">
        {ghostOpacity > 0.02 && (
          <rect
            x={-1}
            y={-1}
            width={2}
            height={2}
            fill="none"
            stroke={`rgba(36,39,37,${0.18 * ghostOpacity})`}
            strokeWidth={0.006}
            strokeDasharray="0.035 0.03"
          />
        )}

        <g filter="url(#foldyssey-shadow)">
          {/* Flat sheet: draw the union once. Per-patch fills would leave
              hairline antialiasing seams along the fold lines. */}
          {flat ? (
            <g>
              <path d={unionPath} fill={paperColor} fillRule="evenodd" />
              <path d={unionPath} fill="url(#foldyssey-paper-shade)" fillRule="evenodd" />
              <path
                d={unionPath}
                fill="none"
                stroke="rgba(28,24,22,0.32)"
                strokeWidth={0.008}
                fillRule="evenodd"
              />
            </g>
          ) : (
            patches.map((entry) => {
              const patch = entry.patch;
              const mat = patchRenderMatrix(patch, preset, foldedness);
              const d = multiPolygonToPath(entry.region, { mat });
              if (!d) return null;
              return (
                <g key={patch.id}>
                  <path d={d} fill={paperColor} fillRule="evenodd" />
                  <path d={d} fill="url(#foldyssey-paper-shade)" fillRule="evenodd" />
                  {flapStroke > 0.01 && (
                    <path
                      d={d}
                      fill="none"
                      stroke={`rgba(28,24,22,${0.32 * flapStroke})`}
                      strokeWidth={0.007}
                      fillRule="evenodd"
                    />
                  )}
                </g>
              );
            })
          )}
        </g>

        {/* Clean silhouette while the flaps are in motion. */}
        {!flat && silhouette > 0.01 && (
          <path
            d={unionPath}
            fill="none"
            stroke={`rgba(28,24,22,${0.3 * silhouette})`}
            strokeWidth={0.008}
            fillRule="evenodd"
          />
        )}

        {removedOpacity > 0 &&
          outcome.patches.map((entry) => {
            const mat = patchRenderMatrix(entry.patch, preset, foldedness);
            const moving = {
              a: mat.a,
              b: mat.b,
              c: mat.c,
              d: mat.d,
              tx: mat.tx + fallMat.tx,
              ty: mat.ty + fallMat.ty,
            };
            const d = multiPolygonToPath(entry.removed, { mat: moving });
            if (!d) return null;
            return (
              <path
                key={`removed-${entry.patch.id}`}
                d={d}
                fill={paperColor}
                fillOpacity={0.9 * removedOpacity}
                stroke={`rgba(28,24,22,${0.2 * removedOpacity})`}
                strokeWidth={0.005}
                fillRule="evenodd"
              />
            );
          })}

        {previewRemoved && previewRemoved.length > 0 && (
          <g>
            <path d={multiPolygonToPath(previewRemoved)} fill="url(#foldyssey-hatch)" fillRule="evenodd" />
            <path
              d={multiPolygonToPath(previewRemoved)}
              fill="none"
              stroke={accentColor}
              strokeOpacity={0.95}
              strokeWidth={0.009}
              strokeDasharray="0.05 0.035"
              fillRule="evenodd"
            />
          </g>
        )}

        {showCreases &&
          creaseOpacity > 0.02 &&
          preset.creases.map((c, i) => (
            <line
              key={`crease-${i}`}
              x1={c.from.x}
              y1={c.from.y}
              x2={c.to.x}
              y2={c.to.y}
              stroke={`rgba(201,164,106,${creaseOpacity})`}
              strokeWidth={0.008}
              strokeDasharray="0.04 0.03"
              strokeLinecap="round"
            />
          ))}

        {targetOutline && targetOutline.length > 0 && (
          <path
            d={multiPolygonToPath(targetOutline)}
            fill="none"
            stroke="#C9A46A"
            strokeWidth={0.01}
            strokeDasharray="0.055 0.04"
            fillRule="evenodd"
            opacity={0.95}
          />
        )}
        {diffExtra && diffExtra.length > 0 && (
          <path d={multiPolygonToPath(diffExtra)} fill="#378C86" fillOpacity={0.45} fillRule="evenodd" />
        )}
        {diffMissing && diffMissing.length > 0 && (
          <path d={multiPolygonToPath(diffMissing)} fill="#C9A46A" fillOpacity={0.6} fillRule="evenodd" />
        )}

        {showCutLine && cutGeom && (
          <g>
            {/* The chord a curved stroke bends away from: makes "how far it is
                bent" visible without adding another slider readout. */}
            {cutGeom.guides.map((g, i) => (
              <line
                key={`cut-guide-${i}`}
                x1={g.a.x}
                y1={g.a.y}
                x2={g.b.x}
                y2={g.b.y}
                stroke={`rgba(36,39,37,0.34)`}
                strokeWidth={cutGeom.r * 0.22}
                strokeDasharray={`${cutGeom.r * 0.9} ${cutGeom.r * 0.7}`}
                strokeLinecap="round"
              />
            ))}
            {cutGeom.paths.map((d, i) => (
              <g key={`cut-path-${i}`}>
                <path
                  d={d}
                  fill="none"
                  stroke="#FFFDF7"
                  strokeWidth={cutGeom.r * 1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.85}
                />
                <path
                  d={d}
                  fill="none"
                  stroke={accentColor}
                  strokeWidth={cutGeom.r * 0.62}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            ))}
            {/* Inflections: where the blade stops turning one way and starts
                turning the other. A straight cut has none, an S has one. */}
            {cutGeom.inflections.map((p, i) => (
              <circle
                key={`cut-inflection-${i}`}
                cx={p.x}
                cy={p.y}
                r={cutGeom.r * 0.42}
                fill="#FFFDF7"
                stroke={accentColor}
                strokeWidth={cutGeom.r * 0.16}
                opacity={0.9}
              />
            ))}
            {cutGeom.handles.map((hnd, i) => (
              <g
                key={`cut-handle-${i}`}
                data-cut-role={hnd.role}
                data-cut-k={hnd.k}
                style={{ cursor: hnd.role === 'bend' ? 'ns-resize' : 'grab', touchAction: 'none' }}
              >
                <circle cx={hnd.p.x} cy={hnd.p.y} r={cutGeom.hit} fill="transparent" />
                {hnd.role === 'bend' ? (
                  // A diamond, so the one handle that changes shape reads
                  // differently from the three that move the stroke.
                  <rect
                    x={hnd.p.x - cutGeom.r * 0.95}
                    y={hnd.p.y - cutGeom.r * 0.95}
                    width={cutGeom.r * 1.9}
                    height={cutGeom.r * 1.9}
                    transform={`rotate(45 ${hnd.p.x} ${hnd.p.y})`}
                    rx={cutGeom.r * 0.2}
                    fill="#FFFDF7"
                    stroke={accentColor}
                    strokeWidth={cutGeom.r * 0.3}
                  />
                ) : (
                  <circle
                    cx={hnd.p.x}
                    cy={hnd.p.y}
                    r={cutGeom.r}
                    fill="#FFFDF7"
                    stroke={accentColor}
                    strokeWidth={cutGeom.r * 0.28}
                  />
                )}
              </g>
            ))}
          </g>
        )}
      </g>
    </svg>
  );
}
