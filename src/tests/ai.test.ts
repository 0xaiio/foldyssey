import { describe, expect, it } from 'vitest';

import {
  FOLD_BY_ORDER,
  MAX_ELEMENTS,
  elementToCuts,
  MIN_KEEP_AREA,
  coerceColor,
  coerceDesign,
  coerceOrder,
  coerceTheme,
  describeDesign,
  normalizeDesign,
  parseDesignJson,
  sanitizeText,
} from '../ai/schema';
import { applyCuts } from '../geometry/cut';
import { multiPolygonArea, multiPolygonToPath } from '../geometry/polygon';

const valid = {
  theme: 'spring_festival',
  style: 'traditional_papercut',
  symmetry: { order: 8 },
  palette: { paper: '#B93645', background: '#F8F3E9' },
  elements: [
    { type: 'core', size: 0.32 },
    { type: 'petal', angle: 22.5, tip: 0.56, width: 0.3 },
    { type: 'hole', shape: 'diamond', angle: 45, radius: 0.88, size: 0.1, stretch: 1.9, rotation: 22.5 },
    { type: 'rim', inset: 0.12 },
  ],
  title: '八瓣迎春',
  note: '八折把每一刀复制成八份，先开八边形花心，再从边缘剪出八片花瓣。',
};

describe('ai schema: model output is untrusted input', () => {
  it('accepts a well-formed design and returns real geometry', () => {
    const r = normalizeDesign(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cuts).toHaveLength(4);
    expect(r.design.foldPreset).toBe('radial8');
    expect(r.design.structure).toEqual({ core: 1, petal: 1, hole: 1, sawtooth: 0, rim: 1, slash: 0 });
    expect(multiPolygonArea(r.paper)).toBeGreaterThan(MIN_KEEP_AREA);
    expect(r.keepRatio).toBeGreaterThan(0);
    expect(r.keepRatio).toBeLessThan(1);
  });

  // The regression that caused 7 of 9 failures in the field survey: the model
  // invented `winter_snowflake`, and a closed enum rejected the whole design.
  it('maps an invented theme name instead of rejecting the design', () => {
    for (const theme of ['winter_snowflake', 'snow', '六瓣雪花', 'frost']) {
      const r = normalizeDesign({ ...valid, theme });
      expect(r.ok, theme).toBe(true);
      if (r.ok) expect(r.design.theme, theme).toBe('snowflake');
    }
    expect(coerceTheme('geometric_papercut')).toBe('modern_geo');
    expect(coerceTheme('midautumn')).toBe('mid_autumn');
    expect(coerceTheme('zodiac_rabbit')).toBe('spring_festival');
    expect(coerceTheme('')).toBe('spring_festival');
  });

  it('infers the theme from the user prompt when the model gives none', () => {
    const r = normalizeDesign({ ...valid, theme: undefined }, '蓝白雪花，细密一点');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.design.theme).toBe('snowflake');
    expect(normalizeDesign({ ...valid, theme: undefined }, '中秋圆月').ok).toBe(true);
    expect(coerceTheme(undefined, '中秋圆月')).toBe('mid_autumn');
  });

  it('drops unknown top-level keys instead of rejecting the document', () => {
    const r = normalizeDesign({ ...valid, evil: '<script>alert(1)</script>', complexity: 'high' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify(r.design)).not.toContain('script');
  });

  it('ignores an unrecognised element but keeps the rest', () => {
    const r = normalizeDesign({
      ...valid,
      elements: [{ type: 'dragon', size: 0.4 }, { type: 'core', size: 0.3 }, { type: 'petal', tip: 0.5 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.join('')).toContain('无法识别');
    expect(r.design.cutCount).toBeGreaterThanOrEqual(2);
  });

  it('fills missing element fields with usable defaults', () => {
    const r = normalizeDesign({
      ...valid,
      elements: [{ type: 'petal' }, { type: 'hole' }, { type: 'core' }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cuts.length).toBe(3);
  });

  it('clamps out-of-range numbers instead of rejecting them', () => {
    const r = normalizeDesign({
      ...valid,
      elements: [
        { type: 'core', size: 9 },
        { type: 'petal', angle: -40, tip: 5, width: 9 },
        { type: 'hole', shape: 'circle', radius: 8, size: 3, stretch: 0.01, rotation: 999 },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(multiPolygonArea(r.paper)).toBeGreaterThan(MIN_KEEP_AREA);
  });

  it('accepts numbers sent as strings', () => {
    const r = normalizeDesign({
      ...valid,
      elements: [{ type: 'core', size: '0.3' }, { type: 'petal', angle: '22.5', tip: '0.5', width: '0.3' }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Two elements were given; the structure floor may add one more.
    expect(r.design.cutCount).toBeGreaterThanOrEqual(2);
    expect(r.design.structure.core).toBe(1);
    expect(r.design.structure.petal).toBe(1);
  });

  it('normalises every colour-ish string to safe hex (no CSS injection)', () => {
    const bad = ['red', '#fff', 'rgb(185, 54, 69)', 'url(javascript:alert(1))', '#B93645;background:url(x)'];
    for (const paper of bad) {
      const colour = coerceColor(paper, '#B93645');
      expect(colour, paper).toMatch(/^#[0-9A-F]{6}$/);
    }
    const r = normalizeDesign({ ...valid, palette: { paper: 'blue', background: 'ivory' } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.design.palette.paper).toBe('#2B5C8A');
      expect(r.design.palette.background).toBe('#F8F3E9');
    }
  });

  it('maps symmetry orders it cannot fold onto one it can', () => {
    expect(coerceOrder(6, 'snowflake').order).toBe(8);
    expect(coerceOrder(6, 'snowflake').note).toContain('八重');
    expect(coerceOrder(3, 'spring_festival').order).toBe(4);
    expect(coerceOrder(12, 'spring_festival').order).toBe(8);
    expect(coerceOrder(1, 'spring_festival').order).toBe(1);
    expect(coerceOrder(undefined, 'snowflake').order).toBe(8);
    expect(coerceOrder(undefined, 'modern_geo').order).toBe(4);
  });

  it('keeps a design whose order is not supported, using the nearest one', () => {
    const r = normalizeDesign({ ...valid, symmetry: { order: 6 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.design.foldPreset).toBe('radial8');
    expect(r.warnings.join('')).toContain('八重');
  });

  it('still reads the v1 `motifs` array', () => {
    const r = normalizeDesign({
      ...valid,
      elements: undefined,
      motifs: [
        { type: 'diamond', size: 0.46, rotation: 45 },
        { type: 'chamfer', size: 0.28, rotation: 45 },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // v1 motifs are mapped, then the structure floor tops the design up.
    expect(r.design.cutCount).toBeGreaterThanOrEqual(2);
    expect(r.design.structure.core).toBe(1);
    expect(r.design.structure.petal + r.design.structure.hole).toBeGreaterThan(0);
  });

  it('rebuilds a usable design when the reply has no elements at all', () => {
    const r = normalizeDesign({ theme: 'snowflake' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.design.theme).toBe('snowflake');
    expect(r.design.cutCount).toBeGreaterThanOrEqual(3);
    expect(multiPolygonArea(r.paper)).toBeGreaterThan(MIN_KEEP_AREA);
  });

  it('never ships a flat design: a lone core gets petals and holes', () => {
    const r = normalizeDesign({
      ...valid,
      elements: [{ type: 'core', size: 0.3 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.design.structure.petal + r.design.structure.hole).toBeGreaterThan(0);
    expect(r.warnings.join('')).toContain('补了一刀');
  });

  it('rewrites a note that claims a symmetry we cannot produce', () => {
    const r = normalizeDesign({ ...valid, note: '六出雪花，六角对称，细密耐看。' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.design.note).not.toContain('六出');
    expect(r.warnings.join('')).toContain('六重');
  });

  it('caps the element count and says so', () => {
    const many = Array.from({ length: MAX_ELEMENTS + 3 }, (_, i) => ({ type: 'hole', size: 0.06 + i * 0.01 }));
    const r = normalizeDesign({ ...valid, elements: many });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The model's list is capped; the structure floor may add one more.
    expect(r.design.elements.length).toBeLessThanOrEqual(MAX_ELEMENTS + 1);
    expect(r.warnings.join('')).toContain('元素超过');
  });

  it('drops elements the chosen fold cannot express', () => {
    const r = normalizeDesign({ ...valid, symmetry: { order: 2 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(multiPolygonArea(r.paper)).toBeGreaterThan(MIN_KEEP_AREA);
  });

  it('keeps every reachable element/order combination renderable', () => {
    const elements = [
      { type: 'core', size: 0.3 },
      { type: 'petal', angle: 22.5, tip: 0.5, width: 0.3 },
      { type: 'hole', shape: 'leaf', angle: 45, radius: 0.7, size: 0.1, stretch: 2, rotation: 20 },
      { type: 'rim', inset: 0.1 },
      { type: 'slash', angle: 30, offset: 0.8, side: 'negative' },
    ];
    for (const order of [1, 2, 4, 8] as const) {
      for (const el of elements) {
        const r = normalizeDesign({ ...valid, symmetry: { order }, elements: [el] });
        expect(r.ok, `${order}/${el.type}`).toBe(true);
        if (r.ok) {
          expect(multiPolygonArea(r.paper), `${order}/${el.type}`).toBeGreaterThanOrEqual(MIN_KEEP_AREA - 1e-9);
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
    expect(FOLD_BY_ORDER[8]).toBe('radial8');
  });

  it('describes the design for the UI without touching geometry', () => {
    const r = normalizeDesign(valid);
    if (!r.ok) return;
    expect(describeDesign(r.design)).toContain('八折');
    expect(describeDesign(r.design)).toContain('4 刀');
    expect(describeDesign(r.design)).toContain('花瓣');
  });

  it('coerceDesign keeps the strict schema happy for hostile input', () => {
    const shapes = [
      null,
      42,
      'snowflake',
      [],
      { theme: 7, style: [], symmetry: 'quad', palette: 3, elements: 'none', title: 9, note: {} },
      { elements: Array.from({ length: 9 }, () => ({ type: '???' })) },
    ];
    for (const raw of shapes) {
      const coerced = coerceDesign(raw, '红色窗花');
      expect(coerced.design.elements.length, JSON.stringify(raw)).toBeGreaterThan(0);
      expect(normalizeDesign(raw, '红色窗花').ok, JSON.stringify(raw)).toBe(true);
    }
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

  it('truncates an over-long title instead of rejecting everything', () => {
    const r = normalizeDesign({ ...valid, title: '八'.repeat(40) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.design.title.length).toBeLessThanOrEqual(24);
  });
});

describe('ai schema: sawtooth rows', () => {
  it('one sawtooth element expands into 8 x count teeth', () => {
    const r = normalizeDesign({
      theme: 'snowflake',
      style: 'traditional_papercut',
      symmetry: { order: 8 },
      palette: { paper: '#2B5C8A', background: '#F2F7FB' },
      elements: [
        { type: 'core', size: 0.24 },
        { type: 'sawtooth', count: 4, depth: 0.1, pitch: 0.2, phase: 0 },
      ],
      title: '齿边',
      note: '边缘咬出三十二个锯齿，展开后四边都是齿。',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cuts).toHaveLength(5); // 1 core + 4 teeth
    expect(r.design.structure.sawtooth).toBe(1);
    // the teeth really take material off the border
    const core = elementToCuts({ type: 'core', size: 0.24 }, 'radial8');
    const teeth = elementToCuts({ type: 'sawtooth', count: 4, depth: 0.1, pitch: 0.2, phase: 0 }, 'radial8');
    const plain = multiPolygonArea(applyCuts('radial8', core).paper);
    const toothed = multiPolygonArea(applyCuts('radial8', [...core, ...teeth]).paper);
    expect(toothed).toBeLessThan(plain - 0.05);
  });

  it('tooth size is bounded so the row can never eat the sheet', () => {
    const r = normalizeDesign({
      theme: 'spring_festival',
      style: 'traditional_papercut',
      symmetry: { order: 8 },
      palette: { paper: '#B93645', background: '#F8F3E9' },
      elements: [
        { type: 'core', size: 0.3 },
        { type: 'sawtooth', count: 8, depth: 5, pitch: 9, phase: 0 },
      ],
      title: '齿边',
      note: '极端齿深与齿距都必须被收进合法范围。',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.keepRatio).toBeGreaterThan(0.08);
  });

  it('sawtooth falls back gracefully on a fold with no wedge', () => {
    const r = normalizeDesign({
      theme: 'spring_festival',
      style: 'minimal',
      symmetry: { order: 1 },
      palette: { paper: '#B93645', background: '#F8F3E9' },
      elements: [{ type: 'sawtooth', count: 3, depth: 0.1, pitch: 0.2, phase: 0 }],
      title: '齿边',
      note: '不折时锯齿仍可用，只是沿整条纸边排列。',
    });
    expect(r.ok).toBe(true);
  });
});
