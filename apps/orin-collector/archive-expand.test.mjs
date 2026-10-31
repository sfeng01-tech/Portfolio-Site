import test from 'node:test';
import assert from 'node:assert/strict';
import { digestRequest, expandBatch, expansionRequest, rewriteDayDigest, validateExpansion } from './archive-expand.mjs';

function chatResponse(content, usage = { total_tokens: 42 }) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage }), { status: 200, headers: { 'content-type': 'application/json' } });
}

const evidence = [
  { id: 'a', url: 'https://www.linkedin.com/in/tomiko-mceathron', title: 'Tomiko Mceathron — LinkedIn profile', originalTitle: 'Person', via: 'host', category: 'Research' },
  { id: 'b', url: 'https://share.google/abc', resolvedUrl: 'https://example.com/kv-cache', title: 'Kv Cache (example.com)', originalTitle: 'Google Shared Link', via: 'fallback', originalExcerpt: 'ignored' },
];

test('the expansion request carries only retrieved evidence and short ids', () => {
  const request = expansionRequest(evidence);
  assert.deepEqual(request.rows.map(row => row.id), ['e0', 'e1']);
  assert.equal(request.rows[0].host, 'linkedin.com');
  assert.equal(request.rows[0].pageTitle, '', 'no page title was retrieved for a walled host');
  assert.equal(request.rows[1].resolvedUrl, 'https://example.com/kv-cache');
  assert.deepEqual(request.responseFormat.json_schema.schema.properties.items.items.properties.id.enum, ['e0', 'e1']);
  assert.match(request.messages[0].content, /untrusted DATA/);
  assert.match(request.messages[0].content, /Never invent/);
  const payload = JSON.parse(request.messages[1].content);
  assert.equal(payload.items[0].availability, 'page requires sign-in; metadata derived from the URL only');
  assert.equal(JSON.stringify(payload).includes('ignored'), false, 'boilerplate from an earlier pass is not evidence');
});

test('every expanded id must come back exactly once with bounded text', () => {
  const request = expansionRequest(evidence);
  assert.deepEqual(validateExpansion({ items: [
    { id: 'e0', title: 'Tomiko Mceathron, LinkedIn', excerpt: 'A LinkedIn profile for Tomiko Mceathron that requires sign-in to read.' },
    { id: 'e1', title: 'A KV cache you can fork', excerpt: 'A blog post about giving a KV cache identity and copy-on-write forks.' },
  ] }, request.rows, evidence).map(row => row.id), ['a', 'b']);
  assert.throws(() => validateExpansion({ items: [{ id: 'e0', title: 'One', excerpt: 'x'.repeat(40) }] }, request.rows, evidence), /Incomplete/);
  assert.throws(() => validateExpansion({ items: [
    { id: 'e0', title: 'One', excerpt: 'x'.repeat(40) }, { id: 'e0', title: 'Two', excerpt: 'x'.repeat(40) },
  ] }, request.rows, evidence), /Unexpected/);
  assert.throws(() => validateExpansion({ items: [
    { id: 'e0', title: 'One', excerpt: 'short' }, { id: 'e1', title: 'Two', excerpt: 'x'.repeat(40) },
  ] }, request.rows, evidence), /Invalid archive expansion text/);
});

test('expandBatch posts a strict schema and maps ids back to artifacts', async () => {
  let body;
  const response = await expandBatch(evidence, {
    apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
      assert.equal(options.headers.Authorization, 'Bearer test-key');
      body = JSON.parse(options.body);
      return chatResponse({ items: [
        { id: 'e0', title: 'Tomiko Mceathron, LinkedIn', excerpt: 'A LinkedIn profile for Tomiko Mceathron that requires sign-in to read.' },
        { id: 'e1', title: 'A KV cache you can fork', excerpt: 'A blog post about giving a KV cache identity and copy-on-write forks.' },
      ] }, { total_tokens: 120 });
    },
  });
  assert.equal(body.model, 'google/gemini-2.5-flash-lite');
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.deepEqual(response.items.map(row => row.id), ['a', 'b']);
  assert.equal(response.usage.total_tokens, 120);
  await assert.rejects(() => expandBatch(evidence, { apiKey: '', fetchImpl: async () => chatResponse({}) }), /OPENROUTER_API_KEY/);
});

test('a day digest may only cite the URLs that were shared that day', async () => {
  const items = [
    { url: 'https://youtu.be/dEZP1qUNTOk', title: 'Beam on GPUs', excerpt: 'Serverless GPU talk.', category: 'Research' },
    { url: 'https://example.com/kv-cache', title: 'A KV cache you can fork', excerpt: 'Copy-on-write KV cache.', category: 'Research' },
  ];
  const request = digestRequest('2026-10-03', items, { title: 'WhatsApp chat — Oct 3, 2026' });
  assert.equal(request.responseFormat.json_schema.strict, true);
  assert.match(request.messages[0].content, /Copy URLs character for character/);
  const payload = JSON.parse(request.messages[1].content);
  assert.equal(payload.title, 'WhatsApp chat — Oct 3, 2026');
  assert.equal(payload.items[0].description, 'Serverless GPU talk.');

  const { digest } = await rewriteDayDigest('2026-10-03', items, {
    apiKey: 'test-key', title: 'WhatsApp chat — Oct 3, 2026',
    fetchImpl: async () => chatResponse({ summary: 'Two links were shared.', groups: [
      { title: 'Infrastructure', summary: 'A serverless GPU talk and a KV cache post.', urls: ['https://youtu.be/dEZP1qUNTOk', 'https://invented.example.com/x'] },
    ] }),
  });
  assert.deepEqual(digest.groups[0].urls, ['https://youtu.be/dEZP1qUNTOk'], 'invented URLs are dropped');
  assert.equal(digest.itemCount, 1);
  assert.equal(digest.title, 'WhatsApp chat — Oct 3, 2026');

  await assert.rejects(() => rewriteDayDigest('2026-10-03', items, {
    apiKey: 'test-key',
    fetchImpl: async () => chatResponse({ summary: 'Two links were shared.', groups: [{ title: 'Nothing real', summary: 'No real citations.', urls: ['https://invented.example.com/x'] }] }),
  }), /no valid source citations/);
});

test('a provider that rejects the schema is retried once as plain JSON', async () => {
  const bodies = [];
  const { items } = await expandBatch(evidence, {
    apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      bodies.push(JSON.parse(options.body));
      if (bodies.length === 1) return new Response(JSON.stringify({ error: { message: 'The specified schema produces a constraint that has too many states' } }), { status: 400 });
      return chatResponse({ items: [
        { id: 'e0', title: 'Tomiko Mceathron, LinkedIn', excerpt: 'A LinkedIn profile for Tomiko Mceathron that requires sign-in to read.' },
        { id: 'e1', title: 'A KV cache you can fork', excerpt: 'A blog post about giving a KV cache identity and copy-on-write forks.' },
      ] });
    },
  });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].response_format.type, 'json_schema');
  assert.equal(bodies[1].response_format, undefined);
  assert.deepEqual(items.map(row => row.id), ['a', 'b']);
});

test('a rate-limited provider is retried before the batch is given up', async () => {
  let calls = 0;
  const response = await expandBatch(evidence, {
    apiKey: 'test-key', timeoutMs: 2_000,
    fetchImpl: async () => {
      calls++;
      if (calls < 3) return new Response('rate limited', { status: 429, headers: { 'retry-after': '0' } });
      return chatResponse({ items: [
        { id: 'e0', title: 'Tomiko Mceathron, LinkedIn', excerpt: 'A LinkedIn profile for Tomiko Mceathron that requires sign-in to read.' },
        { id: 'e1', title: 'A KV cache you can fork', excerpt: 'A blog post about giving a KV cache identity and copy-on-write forks.' },
      ] });
    },
  });
  assert.equal(calls, 3);
  assert.equal(response.items.length, 2);

  let failing = 0;
  await assert.rejects(() => expandBatch(evidence, {
    apiKey: 'test-key', timeoutMs: 2_000,
    fetchImpl: async () => { failing++; return new Response('rate limited', { status: 429 }); },
  }), /OpenRouter HTTP 429/);
  assert.equal(failing, 4, 'four attempts before giving up');
});

test('an upstream model error is surfaced instead of stored', async () => {
  await assert.rejects(() => expandBatch(evidence, {
    apiKey: 'test-key',
    fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'provider overloaded' } }), { status: 200 }),
  }), /provider overloaded/);
  await assert.rejects(() => expandBatch(evidence, {
    apiKey: 'test-key',
    fetchImpl: async () => new Response('rate limited', { status: 429 }),
  }), /OpenRouter HTTP 429/);
});
