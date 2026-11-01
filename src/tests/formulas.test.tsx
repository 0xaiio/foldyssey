/**
 * Formula pipeline: LaTeX source -> build-time MathJax SVG.
 *
 * The generated file is committed so the app builds without MathJax, which
 * means it can go stale. These tests make that impossible to miss: the source
 * file's hash is baked into the generated module, and every SVG is checked for
 * the properties the page relies on (self-contained, inherits colour, no
 * scripts, finite geometry).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { Formula } from '../components/Formula';
import { FORMULAS, FORMULA_SOURCE_HASH } from '../content/formulas.generated';
// @ts-expect-error - the LaTeX source is a build-time .mjs outside the TS project
import { FORMULAS as SOURCE } from '../../tools/formulas.source.mjs';

const SOURCE_FILE = fileURLToPath(new URL('../../tools/formulas.source.mjs', import.meta.url));

describe('formulas: the generated module matches its LaTeX source', () => {
  it('is regenerated whenever the source file changes', async () => {
    const { createHash } = await import('node:crypto');
    const expected = createHash('sha256').update(readFileSync(SOURCE_FILE, 'utf8')).digest('hex').slice(0, 16);
    expect(FORMULA_SOURCE_HASH, 'run `npm run build:formulas`').toBe(expected);
  });

  it('covers exactly the same names as the source', () => {
    expect(Object.keys(FORMULAS).sort()).toEqual(Object.keys(SOURCE).sort());
    const source = SOURCE as Record<string, { tex: string; display: boolean }>;
    for (const [name, entry] of Object.entries(source)) {
      expect(FORMULAS[name as keyof typeof FORMULAS].tex, name).toBe(entry.tex);
      expect(FORMULAS[name as keyof typeof FORMULAS].display, name).toBe(entry.display);
    }
  });

  it('keeps the display formula a closed LaTeX expression', () => {
    expect(FORMULAS.unfold.display).toBe(true);
    expect(FORMULAS.unfold.tex).toContain('\\bigcup_i');
    expect(FORMULAS.unfold.tex).toContain('\\setminus');
    expect((FORMULAS.unfold.tex.match(/\\left/g) ?? []).length).toBe(
      (FORMULAS.unfold.tex.match(/\\right/g) ?? []).length,
    );
    for (const [name, f] of Object.entries(FORMULAS)) {
      if (name !== 'unfold') expect(f.display, name).toBe(false);
    }
  });
});

describe('formulas: every SVG is self-contained and safe to inline', () => {
  for (const [name, formula] of Object.entries(FORMULAS)) {
    it(name, () => {
      const svg = formula.svg;
      expect(svg.startsWith('<svg ')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg).not.toContain('<mjx-container');
      expect(svg).not.toContain('<script');
      expect(svg).not.toContain('onload=');
      // No external references: no <image>, no xlink:href, no @font-face.
      expect(svg).not.toContain('<image');
      expect(svg).not.toContain('xlink:href');
      expect(svg).not.toContain('@font-face');
      // Glyphs are paths, and every one of them inherits the text colour.
      expect(svg).toContain('<path');
      expect(svg).toContain('currentColor');
      expect(svg).not.toMatch(/fill="(?!currentColor|none)[^"]*"/);
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).toContain('focusable="false"');
      expect(svg).not.toContain('NaN');
      expect(svg).not.toContain('Infinity');

      const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1]?.trim().split(/\s+/).map(Number);
      expect(viewBox, name).toHaveLength(4);
      for (const v of viewBox!) expect(Number.isFinite(v)).toBe(true);
      expect(viewBox![2], `${name} width`).toBeGreaterThan(0);
      expect(viewBox![3], `${name} height`).toBeGreaterThan(0);

      // MathJax writes the baseline offset itself (`-0.5ex`, or `0` for a
      // symbol with no depth); that is what makes an inline formula sit on the
      // text baseline instead of floating.
      expect(svg).toMatch(/style="vertical-align: -?[0-9.]+(ex)?;"/);
    });
  }

  it('does not leave rare Unicode maths glyphs in the drawing', () => {
    // The whole point: these used to be typed literally and depended on font
    // fallback. After compilation they are paths, never text.
    for (const [name, formula] of Object.entries(FORMULAS)) {
      for (const ch of ['⋃', '∪', '∩', 'ᵢ', '⁻', '−']) {
        expect(formula.svg, `${name} contains ${ch}`).not.toContain(ch);
      }
    }
  });

  it('labels are human readings, not LaTeX', () => {
    for (const [name, formula] of Object.entries(FORMULAS)) {
      expect(formula.label.length, name).toBeGreaterThan(4);
      expect(formula.label, name).not.toContain('\\');
      expect(formula.label, name).not.toContain('{');
    }
  });
});

describe('formulas: the React wrapper', () => {
  it('renders the drawing hidden and the reading exposed', () => {
    const html = renderToStaticMarkup(<Formula name="paper" />);
    expect(html).toContain('class="mathformula"');
    expect(html).toContain('role="math"');
    expect(html).toContain('aria-label="纸张 P 是负一到一闭区间的平方"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('<svg ');
    expect(html).not.toContain('&lt;svg'); // injected as markup, not escaped
  });

  it('marks the display variant and centres it via CSS, not inline styles', () => {
    const html = renderToStaticMarkup(<Formula name="unfold" />);
    expect(html).toContain('mathformula mathformula--display');
    expect(html).not.toContain('style="text-align');
  });
});
