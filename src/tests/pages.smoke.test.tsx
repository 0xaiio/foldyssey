/**
 * Page-level structural smoke tests.
 *
 * The browser could not be started in this environment (see TEST_REPORT), so
 * every page is rendered with `react-dom/server` instead. That does not prove
 * layout, but it does prove: each route renders without throwing, every level's
 * SVG path is finite (no `NaN` leaked out of the geometry), and the copy that
 * must match the engine (counts, blade names, version) is actually on screen.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { App } from '../app/App';
import { LEVELS } from '../puzzle/levels';
import { SKILL_META } from '../puzzle/skill';
import { AboutPage } from '../pages/AboutPage';
import { AiPage } from '../pages/AiPage';
import { ExplorePage } from '../pages/ExplorePage';
import { GalleryPage } from '../pages/GalleryPage';
import { HomePage } from '../pages/HomePage';
import { PuzzlePage } from '../pages/PuzzlePage';
import { StudioPage } from '../pages/StudioPage';

describe('pages: every route renders', () => {
  const pages: [string, () => string][] = [
    ['home', () => renderToStaticMarkup(<HomePage />)],
    ['explore', () => renderToStaticMarkup(<ExplorePage />)],
    ['gallery', () => renderToStaticMarkup(<GalleryPage />)],
    ['studio', () => renderToStaticMarkup(<StudioPage />)],
    ['ai', () => renderToStaticMarkup(<AiPage />)],
    ['about', () => renderToStaticMarkup(<AboutPage />)],
  ];

  for (const [name, render] of pages) {
    it(`${name} renders without throwing or leaking NaN into an SVG path`, () => {
      const html = render();
      expect(html.length).toBeGreaterThan(400);
      expect(html).not.toContain('NaN');
      expect(html).not.toContain('undefined');
      expect(html).not.toContain('[object Object]');
    });
  }

  it('home advertises the shipped number of levels and presets', () => {
    const html = renderToStaticMarkup(<HomePage />);
    expect(html).toContain(`${LEVELS.length}`);
    expect(html).toContain('八折');
    expect(html).toContain('曲线');
  });

  it('the studio can express every blade type', () => {
    const html = renderToStaticMarkup(<StudioPage />);
    for (const label of ['直线', '曲线', '折剪', '镂空']) expect(html, label).toContain(label);
    expect(html).toContain('刀型');
  });

  it('the AI page states the input limit it enforces', () => {
    const html = renderToStaticMarkup(<AiPage />);
    expect(html).toContain('maxLength="120"');
    expect(html).toContain('极简方框');
    expect(html).toContain('青花团纹');
    expect(html).toContain('粗线大花');
  });
});

describe('shell: navigation is link-based', () => {
  it('renders real anchors with the current page marked', () => {
    const html = renderToStaticMarkup(<App />);
    for (const path of ['/', '/puzzle', '/studio', '/ai', '/gallery', '/explore', '/about']) {
      expect(html, path).toContain(`href="#${path}"`);
    }
    expect((html.match(/class="nav__link/g) ?? []).length).toBe(7);
    expect((html.match(/aria-current="page"/g) ?? []).length).toBe(1);
  });
});

describe('pages: every level renders and its geometry is finite', () => {
  for (const level of LEVELS) {
    it(`${level.index}. ${level.title}`, () => {
      const html = renderToStaticMarkup(<PuzzlePage levelId={level.id} />);
      expect(html).toContain(level.title);
      expect(html).toContain(level.stageLabel);
      expect(html).toContain(SKILL_META[level.skill].label);
      expect(html).not.toContain('NaN');
      // A coordinate that overflowed shows up as NaN/Infinity inside `d`.
      // (The regex is not restricted to M/L/Z because the page also carries
      // decorative icon paths with curves.)
      for (const m of html.matchAll(/\sd="([^"]*)"/g)) {
        expect(m[1], level.id).not.toMatch(/NaN|Infinity/);
        expect(m[1].length, level.id).toBeGreaterThan(8);
      }
    });
  }

  it('an unknown level id falls back to the first level instead of crashing', () => {
    const html = renderToStaticMarkup(<PuzzlePage levelId="does-not-exist" />);
    expect(html).toContain(LEVELS[0].title);
  });

  it('the ladder marks exactly one current rung on every level', () => {
    for (const level of LEVELS) {
      const html = renderToStaticMarkup(<PuzzlePage levelId={level.id} />);
      expect((html.match(/ladder__rung is-current/g) ?? []).length, level.id).toBe(1);
    }
  });
});
