import test from 'node:test';
import assert from 'node:assert/strict';
import { requireIngestToken, requireOrinOwner, safeUrl, suppressPreviousItems, validDate, validateIngest } from '../server/orin.js';
import digestHandler from '../api/orin/digest.js';
import itemsHandler from '../api/orin/items.js';
import ingestHandler from '../api/orin/ingest.js';

const entry = { source: 'arxiv', url: 'https://arxiv.org/abs/2601.12345', title: 'A GPU paper', excerpt: 'Untrusted extracted text', author: '', topics: ['ROCm'] };
const response = () => ({ headers: {}, statusCode: 200, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('ingest validates bounds and deduplicates canonical article URLs', () => {
  const result = validateIngest({ date: '2026-10-25', items: [entry, { ...entry, url: `${entry.url}?utm_source=test#top` }] });
  assert.equal(result.items.length, 1);
  assert.match(result.items[0].id, /^[a-f0-9]{64}$/);
  for (const invalid of [{ ...entry, title: 'x'.repeat(501) }, { ...entry, metrics: { likes: Infinity } }, { ...entry, source: 'unknown' }, { ...entry, topics: Array(21).fill('GPU') }]) {
    assert.throws(() => validateIngest({ date: '2026-10-25', items: [invalid] }));
  }
  assert.throws(() => validateIngest({ date: '2026-02-30', items: [entry] }));
  assert.throws(() => validateIngest({ date: '2026-10-25', items: Array(101).fill(entry) }));
});

test('URLs reject unsafe schemes, credentials, local targets, and mismatched sources', () => {
  for (const url of ['javascript:alert(1)', 'http://arxiv.org/abs/1', 'https://localhost/a', 'https://127.0.0.1/a', 'https://a.local/x', 'https://user:pass@arxiv.org/a']) assert.throws(() => safeUrl(url));
  assert.throws(() => safeUrl('https://evil.example/x', 'twitter'));
  assert.equal(safeUrl('https://x.com/person/status/1', 'twitter'), 'https://x.com/person/status/1');
  assert.equal(validDate('2026-02-30'), false);
});

test('model grouping cannot reference articles that were not ingested', () => {
  assert.throws(() => validateIngest({ date: '2026-10-25', items: [entry], digest: { title: 'Daily digest', groups: [{ title: 'Papers', summary: '', urls: ['https://arxiv.org/abs/9999'] }] } }));
});

test('read and write endpoints reject anonymous requests before querying private storage', async () => {
  for (const [handler, method] of [[digestHandler, 'GET'], [itemsHandler, 'PATCH']]) {
    const res = response();
    await handler({ method, headers: {}, query: {} }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
  }
});

test('GitHub identity must match the configured repository owner', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ login: 'someone-else' }) });
  try {
    await assert.rejects(requireOrinOwner({ headers: { cookie: 'portfolio_github_token=valid-for-other-user' } }), error => error.status === 401);
  } finally { global.fetch = originalFetch; }
});

test('owner mutations enforce JSON same-origin browser requests', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ login: process.env.GITHUB_REPOSITORY_OWNER || 'sfeng01-tech' }) });
  const headers = { host: 'portfolio.example', cookie: 'portfolio_github_token=valid', 'content-type': 'application/json' };
  try {
    await assert.rejects(requireOrinOwner({ headers }, true), error => error.status === 403);
    await assert.rejects(requireOrinOwner({ headers: { ...headers, origin: 'https://attacker.example' } }, true), error => error.status === 403);
  } finally { global.fetch = originalFetch; }
});

test('ingest requires a separate strong secret and does not accept a GitHub cookie', async () => {
  const original = process.env.ORIN_INGEST_TOKEN;
  try {
    delete process.env.ORIN_INGEST_TOKEN;
    assert.throws(() => requireIngestToken({ headers: {} }), error => error.status === 503);
    process.env.ORIN_INGEST_TOKEN = 'a'.repeat(40);
    assert.throws(() => requireIngestToken({ headers: { cookie: 'portfolio_github_token=valid' } }), error => error.status === 401);
    requireIngestToken({ headers: { authorization: `Bearer ${'a'.repeat(40)}` } });
    const res = response();
    await ingestHandler({ method: 'POST', headers: { authorization: 'Bearer incorrect' } }, res);
    assert.equal(res.statusCode, 401);
  } finally { if (original === undefined) delete process.env.ORIN_INGEST_TOKEN; else process.env.ORIN_INGEST_TOKEN = original; }
});

test('owner sees explicit configuration error rather than fabricated digest data', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.ORIN_DATABASE_URL;
  global.fetch = async () => ({ ok: true, json: async () => ({ login: process.env.GITHUB_REPOSITORY_OWNER || 'sfeng01-tech' }) });
  delete process.env.ORIN_DATABASE_URL;
  try {
    const res = response();
    await digestHandler({ method: 'GET', query: {}, headers: { cookie: 'portfolio_github_token=valid' } }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'ORIN database is not configured');
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.ORIN_DATABASE_URL; else process.env.ORIN_DATABASE_URL = originalUrl;
  }
});


test('previous-day articles are suppressed and stale summaries are removed', () => {
  const second = { ...entry, url: 'https://arxiv.org/abs/2601.99999' };
  const payload = validateIngest({ date: '2026-10-25', items: [entry, second], digest: { title: 'Reading', summary: 'Both papers', groups: [{ title: 'GPU', summary: 'Both papers connect', urls: [entry.url, second.url] }] } });
  const result = suppressPreviousItems(payload, [payload.items[0].id]);
  assert.equal(result.skipped, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.digest.summary, '');
  assert.equal(result.digest.groups[0].summary, '');
  assert.deepEqual(result.digest.groups[0].urls, [second.url]);
  assert.equal(suppressPreviousItems(payload, []).items.length, 2);
});
