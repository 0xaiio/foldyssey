/**
 * Live integration test — hits the real WorkBuddy model channel.
 *
 * Skipped by default so `npm run test` stays offline and deterministic.
 * Run explicitly:
 *
 *   FOLDYSSEY_LIVE_AI=1 npx vitest run src/tests/ai.live.test.ts
 *
 * It costs one model call per run (the client also enforces a 5s interval and a
 * per-session budget).
 */
import { describe, expect, it } from 'vitest';

import { generateDesign } from '../ai/client';
import { multiPolygonArea } from '../geometry/polygon';

const live = process.env.FOLDYSSEY_LIVE_AI === '1';

describe.skipIf(!live)('ai live: real model call through the cloud channel', () => {
  it(
    'turns a Chinese theme into a renderable, schema-valid design',
    async () => {
      const res = await generateDesign('喜庆的八瓣红色窗花，适合春节挂窗');
      if (!res.ok) {
        console.error('AI failure:', JSON.stringify(res.failure));
      }
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      console.log('model   :', res.modelId, `${res.elapsedMs}ms`, res.usage ?? '');
      console.log('design  :', JSON.stringify(res.design));
      console.log('warnings:', res.warnings);

      expect(res.design.title.length).toBeGreaterThan(0);
      expect(res.design.note.length).toBeGreaterThan(0);
      expect(res.cuts.length).toBeGreaterThanOrEqual(1);
      expect(multiPolygonArea(res.paper)).toBeGreaterThan(0.32);
      expect(res.keepRatio).toBeGreaterThan(0.05);
    },
    90_000,
  );
});
