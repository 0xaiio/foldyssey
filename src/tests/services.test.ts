/**
 * Services: SVG/PNG export, local persistence and the AI→studio hand-off.
 *
 * These modules are small but they are the only places where the app touches
 * the browser (Blob, Canvas, localStorage, sessionStorage). The tests use
 * minimal fakes so the logic — escaping, file names, schema tolerance, quota
 * errors — is verified without a browser.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EXPORT_SIZE,
  artworkPath,
  buildSvg,
  downloadPng,
  downloadSvg,
  fileName,
  slugify,
  timestamp,
} from '../services/export';
import {
  ARTWORKS_KEY,
  PROGRESS_KEY,
  SCHEMA_VERSION,
  deleteArtwork,
  loadArtworks,
  loadProgress,
  makeId,
  nextUnclearedIndex,
  recordAttempt,
  resetProgress,
  saveArtwork,
  type ArtworkDoc,
} from '../services/storage';
import { AI_DRAFT_KEY, saveAiDraft, takeAiDraft } from '../ai/draft';
import type { MultiPolygon } from '../geometry/polygon';

const paper: MultiPolygon = [
  [
    [
      { x: -1, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 1 },
      { x: -1, y: 1 },
    ],
    [
      { x: -0.3, y: -0.3 },
      { x: 0.3, y: -0.3 },
      { x: 0.3, y: 0.3 },
      { x: -0.3, y: 0.3 },
    ],
  ],
];

class MemoryStorage {
  private map = new Map<string, string>();
  failWith: Error | null = null;

  get length() {
    return this.map.size;
  }
  getItem(key: string) {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string) {
    if (this.failWith) throw this.failWith;
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
}

describe('export: vector data', () => {
  it('builds one evenodd path from every ring, including holes', () => {
    const d = artworkPath(paper);
    expect(d.startsWith('M')).toBe(true);
    expect((d.match(/M/g) ?? []).length).toBe(2); // outer + hole
    expect((d.match(/Z/g) ?? []).length).toBe(2);
    const svg = buildSvg(paper, { paperColor: '#B93645', backgroundColor: '#F8F3E9', title: '団花' });
    expect(svg).toContain(`viewBox="0 0 ${EXPORT_SIZE} ${EXPORT_SIZE}"`);
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('fill="#B93645"');
    expect(svg).toContain('fill="#F8F3E9"');
    expect(svg).toContain('<title>団花</title>');
    expect(svg.trim().endsWith('</svg>')).toBe(true);
  });

  it('escapes XML in the title instead of injecting markup', () => {
    const svg = buildSvg(paper, {
      paperColor: '#000',
      backgroundColor: '#fff',
      title: '<script>&"\'</script>',
    });
    expect(svg).toContain('&lt;script&gt;&amp;&quot;&apos;&lt;/script&gt;');
    expect(svg).not.toContain('<script>');
  });

  it('falls back to a stable name when the title has no ASCII', () => {
    expect(slugify('团花')).toBe('papercut');
    expect(slugify('  ')).toBe('papercut');
    expect(slugify('Red Lotus')).toBe('red-lotus');
    expect(fileName('Red Lotus', 'svg')).toMatch(/^foldyssey-red-lotus-\d{8}\.svg$/);
    expect(timestamp(new Date(2026, 0, 5))).toBe('20260105');
    expect(timestamp(new Date(2026, 11, 31))).toBe('20261231');
  });

  it('downloadSvg hands a real SVG blob to the browser', () => {
    const { anchors, revoked } = installDom();
    const name = downloadSvg(paper, { paperColor: '#000', backgroundColor: '#fff', title: 'T' });
    expect(name).toMatch(/^foldyssey-t-\d{8}\.svg$/);
    expect(anchors).toHaveLength(1);
    expect(anchors[0].download).toBe(name);
    expect(anchors[0].href).toBe('blob:test');
    expect(anchors[0].clicked).toBe(true);
    expect(revoked.length).toBe(0); // revoked after a timeout, not immediately
  });

  it('downloadPng rasterises through canvas and names the file', () => {
    const { anchors, contexts } = installDom();
    const name = downloadPng(paper, { paperColor: '#000', backgroundColor: '#fff', title: 'P' }, 2);
    expect(name).toMatch(/^foldyssey-p-\d{8}\.png$/);
    expect(contexts[0].scaled).toEqual([2, 2]);
    // fillRect paints the background; one evenodd fill paints the paper.
    expect(contexts[0].fills.length).toBe(1);
    expect(contexts[0].fills[0].rule).toBe('evenodd');
    expect(anchors).toHaveLength(1);
  });

  it('downloadPng reports a missing 2D context instead of writing a blank file', () => {
    installDom({ context: null });
    expect(() => downloadPng(paper, { paperColor: '#000', backgroundColor: '#fff', title: 'P' })).toThrow(
      /Canvas/,
    );
  });
});

describe('storage: artworks and progress', () => {
  let store: MemoryStorage;

  beforeEach(() => {
    store = new MemoryStorage();
    vi.stubGlobal('window', { localStorage: store });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const doc = (id: string, updatedAt: number): ArtworkDoc => ({
    schemaVersion: SCHEMA_VERSION,
    id,
    title: `作品 ${id}`,
    createdAt: 1,
    updatedAt,
    foldPreset: 'radial8',
    cuts: [{ kind: 'line', nx: 1, ny: 0, offset: 0.5, removedSide: 'negative' }],
    style: { paper: '#B93645', background: '#F8F3E9' },
    manufacturability: 'digital-only',
  });

  it('saves, updates, sorts by recency and deletes', () => {
    expect(saveArtwork(doc('a', 10)).ok).toBe(true);
    expect(saveArtwork(doc('b', 20)).ok).toBe(true);
    expect(loadArtworks().map((d) => d.id)).toEqual(['b', 'a']);

    const updated = { ...doc('a', 30), title: '改过' };
    saveArtwork(updated);
    expect(loadArtworks().map((d) => d.id)).toEqual(['a', 'b']);
    expect(loadArtworks()[0].title).toBe('改过');

    deleteArtwork('a');
    expect(loadArtworks().map((d) => d.id)).toEqual(['b']);
  });

  it('ignores corrupt documents instead of throwing', () => {
    store.setItem(ARTWORKS_KEY, '{not json');
    expect(loadArtworks()).toEqual([]);
    store.setItem(ARTWORKS_KEY, JSON.stringify([null, 3, { id: 'x' }, doc('ok', 1)]));
    expect(loadArtworks().map((d) => d.id)).toEqual(['ok']);
  });

  it('upgrades a v1 document to the current schema on read', () => {
    store.setItem(ARTWORKS_KEY, JSON.stringify([{ ...doc('old', 1), schemaVersion: 1 }]));
    const [loaded] = loadArtworks();
    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('reports a blocked or full storage instead of pretending to save', () => {
    store.failWith = new Error('QuotaExceededError: quota');
    const res = saveArtwork(doc('x', 1));
    expect(res.ok).toBe(false);
    expect(res.error).toContain('空间不足');

    store.failWith = new Error('SecurityError');
    expect(saveArtwork(doc('x', 1)).error).toContain('拒绝了本地存储');

    vi.stubGlobal('window', undefined);
    expect(saveArtwork(doc('x', 1)).error).toContain('不支持本地存储');
  });

  it('records attempts without losing the best score', () => {
    const a = recordAttempt('corner', 0.7, false);
    expect(a.corner).toMatchObject({ attempts: 1, bestIou: 0.7, cleared: false });
    const b = recordAttempt('corner', 0.5, false);
    expect(b.corner.bestIou).toBeCloseTo(0.7, 12);
    expect(b.corner.attempts).toBe(2);
    const c = recordAttempt('corner', 0.96, true);
    expect(c.corner).toMatchObject({ attempts: 3, cleared: true });
    expect(c.corner.bestIou).toBeCloseTo(0.96, 12);
    // A NaN score must not poison the stored best.
    const d = recordAttempt('corner', Number.NaN, false);
    expect(Number.isFinite(d.corner.bestIou)).toBe(true);
  });

  it('loads progress defensively and resets it', () => {
    store.setItem(PROGRESS_KEY, JSON.stringify({ a: { attempts: 'x', bestIou: null, cleared: 1 } }));
    expect(loadProgress().a).toEqual({ attempts: 0, bestIou: 0, cleared: true, updatedAt: 0 });
    store.setItem(PROGRESS_KEY, JSON.stringify([1, 2, 3]));
    expect(loadProgress()).toEqual({});
    expect(resetProgress()).toEqual({});
    expect(loadProgress()).toEqual({});
  });

  it('finds the first uncleared level and wraps when all are done', () => {
    expect(nextUnclearedIndex(['a', 'b'])).toBe(0);
    recordAttempt('a', 1, true);
    expect(nextUnclearedIndex(['a', 'b'])).toBe(1);
    recordAttempt('b', 1, true);
    expect(nextUnclearedIndex(['a', 'b'])).toBe(0);
    expect(nextUnclearedIndex([])).toBe(0);
  });

  it('generates unique ids with a stable prefix', () => {
    const ids = new Set(Array.from({ length: 50 }, () => makeId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^art-[a-z0-9]+-[a-z0-9]+$/);
  });
});

describe('draft: AI page → studio', () => {
  let session: MemoryStorage;

  beforeEach(() => {
    session = new MemoryStorage();
    vi.stubGlobal('sessionStorage', session);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const draft = {
    foldPreset: 'radial8' as const,
    cuts: [{ kind: 'line' as const, nx: 1, ny: 0, offset: 0.4, removedSide: 'negative' as const }],
    style: { paper: '#B93645', background: '#F8F3E9' },
    title: '红团花',
  };

  it('round-trips a draft and clears it after reading', () => {
    saveAiDraft(draft);
    expect(session.getItem(AI_DRAFT_KEY)).toBeTruthy();
    expect(takeAiDraft()).toEqual(draft);
    expect(session.getItem(AI_DRAFT_KEY)).toBeNull();
    expect(takeAiDraft()).toBeNull();
  });

  it('rejects malformed drafts without throwing', () => {
    session.setItem(AI_DRAFT_KEY, '{oops');
    expect(takeAiDraft()).toBeNull();
    session.setItem(AI_DRAFT_KEY, JSON.stringify({ cuts: [] }));
    expect(takeAiDraft()).toBeNull();
    session.setItem(AI_DRAFT_KEY, JSON.stringify({ foldPreset: 'radial8' }));
    expect(takeAiDraft()).toBeNull();
  });

  it('survives a blocked sessionStorage', () => {
    session.failWith = new Error('blocked');
    expect(() => saveAiDraft(draft)).not.toThrow();
    vi.stubGlobal('sessionStorage', undefined);
    expect(takeAiDraft()).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Minimal DOM
 * ------------------------------------------------------------------ */

type FakeAnchor = {
  href: string;
  download: string;
  rel: string;
  clicked: boolean;
  remove: () => void;
  click: () => void;
};

function installDom(options: { context?: null | { scaled: number[]; fills: { rule?: string }[] } } = {}) {
  const anchors: FakeAnchor[] = [];
  const revoked: string[] = [];
  const contexts: { scaled: number[]; fills: { rule?: string }[] }[] = [];

  const canvasContext =
    options.context === null
      ? null
      : {
          scale: vi.fn(),
          fillRect: vi.fn(),
          fill: vi.fn(),
          set fillStyle(_v: string) {},
        };

  const doc = {
    createElement(tag: string) {
      if (tag === 'canvas') {
        const ctx = canvasContext;
        const record = { scaled: [] as number[], fills: [] as { rule?: string }[] };
        if (ctx) {
          ctx.scale = vi.fn((x: number, y: number) => {
            record.scaled.push(x, y);
          });
          ctx.fill = vi.fn((_path: unknown, rule?: string) => {
            record.fills.push({ rule });
          });
          contexts.push(record);
        }
        return {
          width: 0,
          height: 0,
          getContext: () => ctx,
          toBlob: (cb: (b: unknown) => void) => cb({ size: 1 }),
        };
      }
      const a: FakeAnchor = {
        href: '',
        download: '',
        rel: '',
        clicked: false,
        remove: () => {},
        click: () => {
          a.clicked = true;
        },
      };
      anchors.push(a);
      return a;
    },
    body: { appendChild: vi.fn() },
  };

  vi.stubGlobal('document', doc);
  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:test',
    revokeObjectURL: (u: string) => revoked.push(u),
  });
  vi.stubGlobal(
    'Path2D',
    class {
      constructor(public d: string) {}
    },
  );
  return { anchors, revoked, contexts };
}
