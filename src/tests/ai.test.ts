import { describe, expect, it } from 'vitest';

import {
  FOLD_BY_ORDER,
  MIN_KEEP_AREA,
  MOTIF_TYPES,
  normalizeDesign,
  parseDesignJson,
  sanitizeText,
} from '../ai/schema';
import { describeDesign } from '../ai/schema';
import { multiPolygonArea, multiPolygonToPath } from '../geometry/polygon';

const valid = {
  theme: 'spring_festival',
  style: 'traditional_papercut',
  symmetry: { type: 'quad', order: 4 },
  palette: { paper: '#B93645', background: '#F8F3E9' },
  motifs: [
    { type: 'diamond', size: 0.46, rotation: 45 },
    { type: 'chamfer', size: 0.28, rotation: 45 },
  ],
  title: '八瓣迎春',
  note: '四重镜像把一个三角形缺口复制成四份，围出菱形孔。',
};

describe('ai schema: model output is untrusted input', () => {
  it('accepts a well-formed design and returns real geometry', () => {
    const r = normalizeDesign(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cuts).toHaveLength(2);
    expect(r.design.foldPreset).toBe('orthogonal2');
    expect(multiPolygonArea(r.paper)).toBeGreaterThan(MIN_KEEP_AREA);
    expect(r.keepRatio).toBeGreaterThan(0);
    expect(r.keepRatio).toBeLessThan(1);
  });

  it('rejects unknown top-level keys instead of silently ignoring them', () => {
    const r = normalizeDesign({ ...valid, evil: '<script>alert(1)</script>' });
    expect(r.ok).toBe(false);
  });

  it('rejects unknown motif types', () => {
    const r = normalizeDesign({
      ...valid,
      motifs: [{ type: 'dragon', size: 0.4, rotation: 10 }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain('type');
  });

  it('rejects out-of-range numbers', () => {
    expect(normalizeDesign({ ...valid, motifs: [{ type: 'diamond', size: 3, rotation: 0 }] }).ok).toBe(false);
    expect(normalizeDesign({ ...valid, motifs: [{ type: 'diamond', size: 0.4, rotation: -5 }] }).ok).toBe(false);
    expect(normalizeDesign({ ...valid, motifs: [{ type: 'diamond', size: 0.4, rotation: Number.NaN }] }).ok).toBe(false);
  });

  it('rejects colours that are not plain hex (no CSS injection)', () => {
    for (const paper of ['red', '#fff', 'url(javascript:alert(1))', '#B93645;background:url(x)']) {
      const r = normalizeDesign({ ...valid, palette: { paper, background: '#F8F3E9' } });
      expect(r.ok, paper).toBe(false);
    }
  });

  it('rejects symmetry orders this build cannot fold', () => {
    for (const order of [3, 6, 8, 16]) {
      const r = normalizeDesign({ ...valid, symmetry: { type: 'quad', order } });
      expect(r.ok, String(order)).toBe(false);
    }
  });

  it('more than three motifs is refused', () => {
    const motif = { type: 'diamond', size: 0.3, rotation: 45 };
    const r = normalizeDesign({ ...valid, motifs: [motif, motif, motif, motif] });
    expect(r.ok).toBe(false);
  });

  it('degrades an inconsistent symmetry type with a warning instead of crashing', () => {
    const r = normalizeDesign({ ...valid, symmetry: { type: 'none', order: 4 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.design.foldPreset).toBe('orthogonal2');
    expect(r.warnings.join('')).toContain('order=4');
  });

  it('fixes a low-contrast palette and says so', () => {
    const r = normalizeDesign({ ...valid, palette: { paper: '#F8F3E9', background: '#F5EFE4' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.design.palette.background).not.toBe('#F5EFE4');
    expect(r.warnings.join('')).toContain('对比');
  });

  it('keeps every reachable parameter combination renderable', () => {
    for (const order of [1, 2, 4] as const) {
      for (const type of MOTIF_TYPES) {
        for (const size of [0.08, 0.5, 0.95]) {
          const r = normalizeDesign({
            ...valid,
            symmetry: { type: order === 1 ? 'none' : order === 2 ? 'mirror' : 'quad', order },
            motifs: [{ type, size, rotation: 33 }],
          });
          expect(r.ok, `${order}/${type}/${size}`).toBe(true);
          if (r.ok) {
            expect(multiPolygonArea(r.paper), `${order}/${type}/${size}`).toBeGreaterThanOrEqual(MIN_KEEP_AREA - 1e-9);
          }
        }
      }
    }
  });

  it('is deterministic: same design, same path', () => {
    const a = normalizeDesign(valid);
    const b = normalizeDesign(valid);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(multiPolygonToPath(a.paper)).toBe(multiPolygonToPath(b.paper));
  });

  it('maps every supported order to a fold preset that exists', () => {
    expect(FOLD_BY_ORDER[1]).toBe('none');
    expect(FOLD_BY_ORDER[2]).toBe('vertical');
    expect(FOLD_BY_ORDER[4]).toBe('orthogonal2');
  });

  it('describes the design for the UI without touching geometry', () => {
    const r = normalizeDesign(valid);
    if (!r.ok) return;
    expect(describeDesign(r.design)).toContain('正交双折');
    expect(describeDesign(r.design)).toContain('2 条切口');
  });
});

describe('ai schema: parsing model text', () => {
  it('tolerates fenced JSON and surrounding prose', () => {
    const text = '好的，这是设计：\n```json\n{"a":1}\n```\n希望你喜欢。';
    expect(parseDesignJson(text)).toEqual({ a: 1 });
  });

  it('throws when there is no JSON object', () => {
    expect(() => parseDesignJson('抱歉，我无法完成。')).toThrow();
  });

  it('strips control characters and clamps length', () => {
    expect(sanitizeText('  红\u0000色\n窗花  ', 20)).toBe('红 色 窗花');
    expect(sanitizeText('一'.repeat(60), 10)).toHaveLength(10);
    expect(sanitizeText(null, 10)).toBe('');
  });

  it('truncates an over-long title before validation instead of rejecting everything', () => {
    const r = normalizeDesign({ ...valid, title: '八'.repeat(40) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.design.title.length).toBeLessThanOrEqual(24);
  });
});
