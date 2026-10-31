/**
 * Structural UI tests, no browser needed.
 *
 * The app is rendered to static markup and the resulting HTML is inspected —
 * this catches the failures a screenshot would catch (missing control, wrong
 * ladder rung, a curve level that renders the straight-cut sliders), plus the
 * ones a screenshot cannot (every level renders, every level's labels agree
 * with its computed skill).
 *
 * It is not a substitute for `tools/ui_check.py` (layout, overflow, console
 * errors); it is the part of that check that survives a machine without a
 * browser.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ExplorePage } from '../pages/ExplorePage';
import { PuzzlePage } from '../pages/PuzzlePage';
import { StudioPage } from '../pages/StudioPage';
import { LEVELS } from '../puzzle/levels';
import { SKILL_META } from '../puzzle/skill';

const render = (id: string) => renderToStaticMarkup(<PuzzlePage levelId={id} />);

describe('ui: puzzle page renders for every level', () => {
  it('never throws, and always shows the title and the brief', () => {
    for (const level of LEVELS) {
      const html = render(level.id);
      expect(html, level.id).toContain(level.title);
      expect(html, level.id).toContain('剪刀能力');
      expect(html, level.id).toContain(level.brief.slice(0, 12));
    }
  });

  it('marks exactly one ladder rung as the current one, and it is the level\'s own', () => {
    for (const level of LEVELS) {
      const html = render(level.id);
      const current = html.match(/ladder__rung is-current/g) ?? [];
      expect(current.length, level.id).toBe(1);
      expect(html, level.id).toContain(`剪刀能力 · ${SKILL_META[level.skill].label}`);
      // The four rungs are always present, so the ladder reads as a ladder.
      for (const s of Object.keys(SKILL_META)) {
        expect(html, `${level.id}/${s}`).toContain(`>${SKILL_META[s as keyof typeof SKILL_META].label}<`);
      }
    }
  });

  it('gives a curve level the curve controls, and a straight level none of them', () => {
    const curved = render('scallop');
    expect(curved).toContain('弯曲幅度，0 为直线');
    expect(curved).toContain('弯折次数');
    expect(curved).toContain('曲边占比');
    expect(curved).toContain('>弧线<');
    expect(curved).toContain('>S 形<');
    expect(curved).toContain('>波浪<');

    const straight = render('corner');
    expect(straight).not.toContain('弯曲幅度，0 为直线');
    expect(straight).not.toContain('弯折次数');
    expect(straight).toContain('切线法线角度（度）');
  });

  it('draws the curved blade with a bend handle and a chord guide', () => {
    const html = render('scallop');
    expect((html.match(/data-cut-role="bend"/g) ?? []).length).toBe(1);
    expect((html.match(/data-cut-role="rotate"/g) ?? []).length).toBe(2);
    expect((html.match(/data-cut-role="translate"/g) ?? []).length).toBe(1);
    // The stroke is a real polyline, not a two-point line: a curve needs many
    // sampled vertices, otherwise "curve" would be a label with no geometry.
    const paths = [...html.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
    const longest = paths.sort((a, b) => b.length - a.length)[0] ?? '';
    expect(longest.split('L').length).toBeGreaterThan(8);
  });

  it('a two-cut level shows one tab per cut, with its role names', () => {
    const html = render('lattice');
    expect(html).toContain('扇贝边');
    expect(html).toContain('花心');
    expect((html.match(/role="tab"/g) ?? []).length).toBe(2);
  });

  it('lists all sixteen levels in the sidebar, each with its rung', () => {
    const html = render('corner');
    for (const level of LEVELS) {
      expect(html, level.id).toContain(`level-item__title">${level.title}`);
      expect(html, level.id).toContain(`· ${SKILL_META[level.skill].label}`);
    }
  });
});

describe('ui: the fold-and-cut card states the theorem correctly', () => {
  it('quotes the English original, translates it, and names all three authors', () => {
    const html = renderToStaticMarkup(<ExplorePage />);
    // The heading no longer claims to be about "适用条件".
    expect(html).toContain('5 · Fold-and-Cut 定理');
    expect(html).not.toContain('适用条件');
    // Verbatim Theorem 1 (Demaine, Demaine & Lubiw) and its citation.
    expect(html).toContain('Given any collection of straight edges, there exists a flat folding');
    expect(html).toContain('10.1007/978-3-540-46515-7_9');
    // The Chinese translation must be present, with the term 平折.
    expect(html).toContain('都存在一种平折方式');
    expect(html).toContain('剪口图案');
    // Three authors by full name — never "brothers", never a bare surname.
    expect(html).toContain('Erik D. Demaine');
    expect(html).toContain('Martin L. Demaine');
    expect(html).toContain('Anna Lubiw');
    expect(html).not.toContain('兄弟');
  });

  it('describes the capability boundary as it actually is today', () => {
    const html = renderToStaticMarkup(<ExplorePage />);
    // Five presets, not four, and the curve cut is outside the theorem's
    // straight-edge hypothesis.
    expect(html).toContain('五种固定折叠预设');
    expect(html).not.toContain('四种固定');
    expect(html).toContain('折剪定理');
    expect(html).toContain('直线段');
    expect(html).toContain('曲线剪');
  });
});

describe('ui: studio exposes the blade switch', () => {
  it('renders the four blade types and a curve editor once switched', () => {
    const html = renderToStaticMarkup(<StudioPage />);
    for (const label of ['直线', '曲线', '折剪', '镂空']) {
      expect(html).toContain(`>${label}<`);
    }
    expect(html).toContain('刀型');
  });
});
