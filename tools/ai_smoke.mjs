/**
 * Node smoke test for the WorkBuddy LLM channel.
 *
 * Verifies, without a browser, that the app's cloud environment answers:
 *   1. models.list() returns at least one selectable model
 *   2. a streaming chat completion returns text
 *
 * Usage: node tools/ai_smoke.mjs
 * The endpoint / publishableKey are the PUBLIC config returned by the cloud
 * service (safe to ship; the server enforces the app Origin).
 */
import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk';

const ENDPOINT = 'https://foldyssey.app.workbuddy.host';
const PUBLISHABLE_KEY = 'wbpk_l9MabRuQZEm757fiKlnw4Z_taYgzsRvoEMSRKN6JJf40TP19ZF8g4lP';

const cloud = createWorkBuddyCloud({ endpoint: ENDPOINT, publishableKey: PUBLISHABLE_KEY });

const models = await cloud.llm.models.list();
console.log('models:', models.length);
for (const m of models.slice(0, 8)) {
  console.log('  -', m.id, '|', m.name, '| disabled=', m.disabled);
}

const model = models.find((m) => m.disabled !== true);
if (!model) {
  console.error('no selectable model');
  process.exit(2);
}

let text = '';
let usage = null;
try {
  const stream = await cloud.llm.chat.completions.create({
    model: model.id,
    messages: [
      { role: 'system', content: 'You are a terse assistant. Reply with JSON only.' },
      { role: 'user', content: '返回 {"ok":true} 这个 JSON，不要任何其他文字。' },
    ],
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0.2,
  });
  for await (const chunk of stream) {
    const d = chunk.choices?.[0]?.delta;
    if (d?.content) text += d.content;
    if (chunk.usage) usage = chunk.usage;
  }
} catch (err) {
  console.error('LLM error:', err?.error?.code ?? err?.code ?? err?.message);
  console.error('status:', err?.status, 'requestId:', err?.requestId);
  process.exit(3);
}

console.log('reply:', JSON.stringify(text.slice(0, 300)));
console.log('usage:', usage ? JSON.stringify(usage) : 'none');
