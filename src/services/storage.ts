/**
 * Local-only persistence. No account, no server, no network.
 *
 * Everything the gallery needs can be recomputed from the structured document,
 * so we never store a cached image as the source of truth.
 */

import type { Cut } from '../geometry/cut';
import type { FoldPresetId } from '../geometry/fold';

export const ARTWORKS_KEY = 'foldyssey.artworks.v1';
export const PROGRESS_KEY = 'foldyssey.progress.v1';
export const DRAFT_KEY = 'foldyssey.draft.v1';
// 1 -> 2: `cuts` became a union (line | notch | hole). The change is additive
// (a v1 line cut without `kind` is still read as a line), so old documents keep
// loading; the version is bumped so future migrations have a clean baseline.
export const SCHEMA_VERSION = 2;

export type StyleDoc = { paper: string; background: string };

export type Manufacturability = 'verified' | 'digital-only' | 'unchecked';

export type ArtworkDoc = {
  schemaVersion: number;
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  foldPreset: FoldPresetId;
  cuts: Cut[];
  style: StyleDoc;
  manufacturability: Manufacturability;
};

export type LevelProgress = {
  attempts: number;
  bestIou: number;
  cleared: boolean;
  updatedAt: number;
};

export type ProgressDoc = Record<string, LevelProgress>;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function getStore(): StorageLike | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const probe = '__foldyssey_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string, fallback: T): T {
  const store = getStore();
  if (!store) return fallback;
  try {
    const raw = store.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): { ok: boolean; error?: string } {
  const store = getStore();
  if (!store) return { ok: false, error: '当前浏览器不支持本地存储，作品无法保存。' };
  try {
    store.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error && /quota/i.test(err.message)
        ? '本地存储空间不足，请先删除一些作品。'
        : '保存失败，浏览器拒绝了本地存储写入。';
    return { ok: false, error: message };
  }
}

function isArtwork(value: unknown): value is ArtworkDoc {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<ArtworkDoc>;
  return (
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    typeof v.foldPreset === 'string' &&
    Array.isArray(v.cuts) &&
    // v1 documents stay readable: a line cut without `kind` is still a line.
    (v.schemaVersion === 1 || v.schemaVersion === SCHEMA_VERSION)
  );
}

export function loadArtworks(): ArtworkDoc[] {
  const raw = readJson<unknown>(ARTWORKS_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isArtwork)
    .map((doc) => ({ ...doc, schemaVersion: SCHEMA_VERSION }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveArtwork(doc: ArtworkDoc): { ok: boolean; error?: string } {
  const list = loadArtworks();
  const idx = list.findIndex((a) => a.id === doc.id);
  if (idx >= 0) list[idx] = doc;
  else list.unshift(doc);
  return writeJson(ARTWORKS_KEY, list);
}

export function deleteArtwork(id: string): { ok: boolean; error?: string } {
  const list = loadArtworks().filter((a) => a.id !== id);
  return writeJson(ARTWORKS_KEY, list);
}

export function loadProgress(): ProgressDoc {
  const raw = readJson<unknown>(PROGRESS_KEY, {});
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: ProgressDoc = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const p = v as Partial<LevelProgress>;
    out[k] = {
      attempts: Number.isFinite(p.attempts) ? Number(p.attempts) : 0,
      bestIou: Number.isFinite(p.bestIou) ? Number(p.bestIou) : 0,
      cleared: Boolean(p.cleared),
      updatedAt: Number.isFinite(p.updatedAt) ? Number(p.updatedAt) : 0,
    };
  }
  return out;
}

export function recordAttempt(levelId: string, iou: number, cleared: boolean): ProgressDoc {
  const all = loadProgress();
  const prev = all[levelId] ?? { attempts: 0, bestIou: 0, cleared: false, updatedAt: 0 };
  all[levelId] = {
    attempts: prev.attempts + 1,
    bestIou: Math.max(prev.bestIou, Number.isFinite(iou) ? iou : 0),
    cleared: prev.cleared || cleared,
    updatedAt: Date.now(),
  };
  writeJson(PROGRESS_KEY, all);
  return all;
}

export function resetProgress(): ProgressDoc {
  writeJson(PROGRESS_KEY, {});
  return {};
}

/** Index of the first level that has not been cleared yet. */
export function nextUnclearedIndex(levelIds: string[]): number {
  const progress = loadProgress();
  const idx = levelIds.findIndex((id) => !progress[id]?.cleared);
  return idx < 0 ? 0 : idx;
}

export function makeId(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `art-${Date.now().toString(36)}-${rand}`;
}
