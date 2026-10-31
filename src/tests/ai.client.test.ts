/**
 * AI client: quotas, model resolution, the two-attempt JSON pipeline and the
 * failure taxonomy.
 *
 * The cloud SDK is mocked at the module boundary: everything else in this file
 * is the real code. `sessionStorage` is a Map so quota persistence is testable
 * without a browser.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Cut } from '../geometry/cut';
import { multiPolygonArea } from '../geometry/polygon';

const state = vi.hoisted(() => ({
  models: [] as { id: string; disabled?: boolean }[],
  listThrows: null as Error | null,
  create: null as null | ((args: unknown) => Promise<AsyncIterable<unknown>>),
  calls: 0,
}));

vi.mock('@tencent-ai/workbuddy-cloud-sdk', () => ({
  createWorkBuddyCloud: () => ({
    llm: {
      models: {
        list: async () => {
          if (state.listThrows) throw state.listThrows;
          return state.models;
        },
      },
      chat: {
        completions: {
          create: async (args: unknown) => {
            state.calls += 1;
            if (!state.create) throw new Error('no create stub');
            return state.create(args);
          },
        },
      },
    },
  }),
}));

const client = await import('../ai/client');
const { generateDesign, mapError, remainingQuota, __resetAiClientForTests } = client;

class MemoryStorage {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

const storage = new MemoryStorage();

function streamOf(chunks: unknown[]): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c;
    },
  };
}

function textStream(text: string, tokens = 42) {
  return streamOf([{ choices: [{ delta: { content: text } }] }, { usage: { total_tokens: tokens } }]);
}

const VALID = JSON.stringify({
  theme: 'spring_festival',
  style: 'papercut',
  symmetry: { order: 8 },
  palette: { paper: '#B93645', background: '#F8F3E9', accent: '#C9A46A' },
  elements: [
    { type: 'core', shape: 'diamond', size: 0.18 },
    { type: 'petal', count: 8, depth: 0.5, width: 0.3 },
  ],
  title: '红团花',
  note: '八折团花',
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-31T09:00:00Z'));
  storage.clear();
  vi.stubGlobal('sessionStorage', storage);
  __resetAiClientForTests();
  state.models = [{ id: 'glm-5.3-flash' }, { id: 'glm-5.3' }];
  state.listThrows = null;
  state.calls = 0;
  state.create = async () => textStream(VALID);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  __resetAiClientForTests();
});

describe('ai client: input and quota gates', () => {
  it('rejects a brief shorter than four characters without calling the model', async () => {
    const res = await generateDesign(' 花 ');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure.kind).toBe('input');
    expect(state.calls).toBe(0);
  });

  it('enforces a five-second interval between calls', async () => {
    const first = await generateDesign('八瓣红窗花');
    expect(first.ok).toBe(true);
    const second = await generateDesign('八瓣红窗花');
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.failure.kind).toBe('rate');
      expect(second.failure.message).toContain('5 秒');
    }
    vi.setSystemTime(new Date('2026-10-31T09:00:05Z'));
    expect((await generateDesign('八瓣红窗花')).ok).toBe(true);
  });

  it('stops at twelve generations per session and reports the quota', async () => {
    for (let i = 0; i < 12; i++) {
      vi.setSystemTime(new Date(Date.now() + 5000));
      expect((await generateDesign('八瓣红窗花')).ok).toBe(true);
      expect(remainingQuota()).toBe(11 - i);
    }
    vi.setSystemTime(new Date(Date.now() + 5000));
    const blocked = await generateDesign('八瓣红窗花');
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.failure.kind).toBe('rate');
    expect(state.calls).toBe(12);
  });

  it('ignores a corrupt usage record instead of locking the user out', async () => {
    storage.setItem('foldyssey.ai.usage.v1', '{oops');
    expect(remainingQuota()).toBe(12);
    expect((await generateDesign('八瓣红窗花')).ok).toBe(true);
  });

  it('rejects a second call while one is still in flight', async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((res) => {
      release = res;
    });
    state.create = async () => ({
      async *[Symbol.asyncIterator]() {
        await gate;
        yield { choices: [{ delta: { content: VALID } }] };
      },
    });
    const first = generateDesign('八瓣红窗花');
    const second = await generateDesign('八瓣红窗花');
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.failure.kind).toBe('busy');
    release!();
    expect((await first).ok).toBe(true);
  });
});

describe('ai client: model resolution', () => {
  it('prefers the fast model and caches the choice', async () => {
    const a = await generateDesign('八瓣红窗花');
    expect(a.ok && a.modelId).toBe('glm-5.3-flash');
    vi.setSystemTime(new Date(Date.now() + 5000));
    const b = await generateDesign('八瓣红窗花');
    expect(b.ok && b.modelId).toBe('glm-5.3-flash');
  });

  it('falls back to the first usable model when none is preferred', async () => {
    state.models = [{ id: 'custom-a' }, { id: 'custom-b', disabled: true }];
    const res = await generateDesign('八瓣红窗花');
    expect(res.ok && res.modelId).toBe('custom-a');
  });

  it('reports an empty model catalogue and an all-disabled one', async () => {
    state.models = [];
    const empty = await generateDesign('八瓣红窗花');
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.failure.kind).toBe('model');

    __resetAiClientForTests();
    storage.clear();
    state.models = [{ id: 'x', disabled: true }];
    const disabled = await generateDesign('八瓣红窗花');
    expect(disabled.ok).toBe(false);
    if (!disabled.ok) {
      expect(disabled.failure.kind).toBe('model');
      expect(disabled.failure.retryable).toBe(false);
    }
    expect(state.calls).toBe(0);
  });

  it('maps a model-list failure without attempting a completion', async () => {
    state.listThrows = Object.assign(new Error('boom'), { status: 401 });
    const res = await generateDesign('八瓣红窗花');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure.kind).toBe('auth');
    expect(state.calls).toBe(0);
  });
});

describe('ai client: the two-attempt JSON pipeline', () => {
  it('returns real geometry on the first reply', async () => {
    const res = await generateDesign('八瓣红窗花');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.attempt).toBe(1);
    expect(res.design.title).toBe('红团花');
    expect(res.cuts.length).toBeGreaterThan(0);
    for (const cut of res.cuts) expect((cut as Cut).kind).toBeTruthy();
    expect(multiPolygonArea(res.paper)).toBeGreaterThan(0.2);
    expect(res.keepRatio).toBeGreaterThan(0);
    expect(res.keepRatio).toBeLessThanOrEqual(1);
    expect(res.usage?.total_tokens).toBe(42);
    expect(res.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('retries once with the repair instruction when the reply is not JSON', async () => {
    let round = 0;
    state.create = async () => {
      round += 1;
      return round === 1 ? textStream('好的，这是图案：', 10) : textStream(VALID, 20);
    };
    const res = await generateDesign('八瓣红窗花');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.attempt).toBe(2);
    expect(res.usage?.total_tokens).toBe(20);
    expect(state.calls).toBe(2);
  });

  it('gives up after two unparseable replies and keeps a short detail', async () => {
    state.create = async () => textStream('not json at all');
    const res = await generateDesign('八瓣红窗花');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.failure.kind).toBe('invalid');
      expect(res.failure.retryable).toBe(true);
      expect((res.failure.detail ?? '').length).toBeLessThanOrEqual(120);
    }
    expect(state.calls).toBe(2);
  });

  it('passes the system prompt, the user brief and the repair note in order', async () => {
    const seen: { role: string; content: string }[][] = [];
    let round = 0;
    state.create = async (args: unknown) => {
      const a = args as { messages: { role: string; content: string }[]; temperature: number };
      seen.push(a.messages);
      round += 1;
      return round === 1 ? textStream('nope') : textStream(VALID);
    };
    await generateDesign('蓝白雪花');
    expect(seen).toHaveLength(2);
    expect(seen[0].map((m) => m.role)).toEqual(['system', 'user']);
    expect(seen[0][1].content).toContain('蓝白雪花');
    expect(seen[1]).toHaveLength(3);
    expect(seen[1][2].content).toContain('JSON');
  });

  it('keeps the last usage count even when the reply had to be repaired', async () => {
    let round = 0;
    state.create = async () => {
      round += 1;
      return round === 1 ? textStream('x', 7) : textStream(VALID, 33);
    };
    const res = await generateDesign('八瓣红窗花');
    expect(res.ok && res.usage?.total_tokens).toBe(33);
  });
});

describe('ai client: failure taxonomy', () => {
  const failureOf = async (err: unknown) => {
    state.create = async () => {
      throw err;
    };
    const res = await generateDesign('八瓣红窗花');
    expect(res.ok).toBe(false);
    return res.ok ? null : res.failure;
  };

  it('maps timeout, auth, quota, request, gateway and internal codes', async () => {
    expect((await failureOf(Object.assign(new Error('x'), { name: 'AbortError' })))?.kind).toBe('timeout');

    __resetAiClientForTests();
    vi.setSystemTime(new Date(Date.now() + 10_000));
    storage.clear();
    expect((await failureOf(Object.assign(new Error('x'), { status: 403 })))?.kind).toBe('auth');

    __resetAiClientForTests();
    vi.setSystemTime(new Date(Date.now() + 10_000));
    storage.clear();
    const quota = await failureOf(Object.assign(new Error('x'), { error: { code: 'quota_rate_limited' } }));
    expect(quota?.kind).toBe('quota');
    expect(quota?.retryable).toBe(true);

    __resetAiClientForTests();
    vi.setSystemTime(new Date(Date.now() + 10_000));
    storage.clear();
    expect((await failureOf(Object.assign(new Error('x'), { code: 'request_invalid' })))?.kind).toBe('invalid');

    __resetAiClientForTests();
    vi.setSystemTime(new Date(Date.now() + 10_000));
    storage.clear();
    expect((await failureOf(Object.assign(new Error('x'), { code: 'gateway_down' })))?.kind).toBe('model');

    __resetAiClientForTests();
    vi.setSystemTime(new Date(Date.now() + 10_000));
    storage.clear();
    expect((await failureOf(Object.assign(new Error('x'), { code: 'internal_oops' })))?.kind).toBe('model');
  });

  it('reports offline and generic network failures', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const offline = mapError(new Error('fetch failed'));
    expect(offline.kind).toBe('network');
    expect(offline.message).toContain('离线');

    vi.stubGlobal('navigator', { onLine: true });
    const generic = mapError(new Error('socket hang up'), '生成失败');
    expect(generic.kind).toBe('network');
    expect(generic.message).toContain('生成失败');
    expect(generic.message.length).toBeLessThanOrEqual(100);
  });

  it('never leaks a raw stack into the headline (it goes to detail)', async () => {
    const failure = mapError(new Error('Error: secret at /home/user/app/src/ai/client.ts:42'));
    expect(failure.message).not.toContain('/home/user');
    expect(failure.message.length).toBeLessThanOrEqual(100);
    expect(failure.detail).toContain('/home/user');
  });

  it('creates a fresh client after the reset hook', async () => {
    expect((await generateDesign('八瓣红窗花')).ok).toBe(true);
    __resetAiClientForTests();
    storage.clear();
    vi.setSystemTime(new Date(Date.now() + 10_000));
    expect((await generateDesign('蓝白雪花')).ok).toBe(true);
  });
});
