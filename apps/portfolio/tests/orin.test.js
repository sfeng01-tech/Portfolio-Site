import test from 'node:test';
import assert from 'node:assert/strict';
import { requireIngestToken, requireOrinOwner, safeUrl, suppressPreviousItems, validDate, validateIngest } from '../server/orin.js';
import digestHandler from '../../../api/orin/digest.js';
import itemsHandler from '../../../api/orin/items.js';
import ingestHandler from '../../../api/orin/ingest.js';
import preferencesHandler from '../../../api/orin/preferences.js';

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
  assert.equal(safeUrl('https://news.google.com/rss/articles/CBMi-test', 'google_news'), 'https://news.google.com/rss/articles/CBMi-test');
  assert.throws(() => safeUrl('https://news.google.com.evil.test/rss/articles/1', 'google_news'));
  assert.equal(safeUrl('https://www.threads.com/@gpu_dev/post/abc', 'threads'), 'https://www.threads.com/@gpu_dev/post/abc');
  assert.throws(() => safeUrl('https://threads.com.evil.test/@gpu_dev/post/abc', 'threads'));
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

test('research and Substack sources pass ingestion with matching provenance', () => {
  for (const [source, url] of [['huggingface', 'https://huggingface.co/papers/2610.12345'], ['alphaxiv', 'https://www.alphaxiv.org/abs/2610.12345'], ['substack', 'https://example.substack.com/p/gpu'], ['substack', 'https://latent.space/p/gpu'], ['substack', 'https://www.interconnects.ai/p/gpu'], ['substack', 'https://newsletter.ruder.io/p/gpu'], ['substack', 'https://magazine.sebastianraschka.com/p/gpu']]) {
    const payload = validateIngest({ date: '2026-10-25', items: [{ ...entry, source, url }] });
    assert.equal(payload.items[0].source, source);
    assert.throws(() => safeUrl('https://evil.test/p/gpu', source));
    assert.throws(() => safeUrl('https://substack.com.evil.test/p/gpu', source));
  }
});

test('expanded daily collection accepts 40 source checks and rejects overflow', () => {
  const status = { source: 'rss', status: 'ok', message: 'Checked' };
  const payload = validateIngest({ date: '2026-10-25', items: [], sourceStatus: Array(40).fill(status) });
  assert.equal(payload.sourceStatus.length, 40);
  assert.throws(() => validateIngest({ date: '2026-10-25', items: [], sourceStatus: Array(41).fill(status) }), /Invalid source status/);
});


test('ranking metadata is bounded and paper identity is derived from the link', () => {
  const ranking = {method:'llm',score:90,tracks:['Quantization'],reason:'Memory-efficient inference.',discovery:false};
  const payload=validateIngest({date:'2026-10-25',items:[{...entry,ranking,paperId:'arxiv:fake'}]});
  assert.equal(payload.items[0].paperId,'arxiv:2601.12345');
  assert.equal(payload.items[0].ranking.score,90);
  assert.throws(()=>validateIngest({date:'2026-10-25',items:[{...entry,ranking:{...ranking,score:101}}]}));
  const suppressed=suppressPreviousItems(payload,[],['arxiv:2601.12345']);
  assert.equal(suppressed.items.length,0);
});


test('worker feedback endpoint rejects browser cookies and invalid ingestion tokens', async () => {
  const original = process.env.ORIN_INGEST_TOKEN;
  process.env.ORIN_INGEST_TOKEN = 'a'.repeat(40);
  try {
    for (const headers of [{cookie:'portfolio_github_token=valid'}, {authorization:'Bearer invalid'}]) {
      const res=response();
      await preferencesHandler({method:'GET',headers},res);
      assert.equal(res.statusCode,401);
      assert.equal(res.headers['Cache-Control'],'private, no-store');
    }
  } finally { if(original===undefined) delete process.env.ORIN_INGEST_TOKEN; else process.env.ORIN_INGEST_TOKEN=original; }
});

test('explicit feedback rejects booleans and out-of-range values before database access', async () => {
  const originalFetch=global.fetch;
  global.fetch=async()=>({ok:true,json:async()=>({login:process.env.GITHUB_REPOSITORY_OWNER||'sfeng01-tech'})});
  try {
    for(const feedback of [true,2,'1',null]) {
      const res=response();
      await itemsHandler({method:'PATCH',headers:{host:'portfolio.example','x-forwarded-proto':'https',origin:process.env.APP_ORIGIN?.replace(/\/$/,'')||'https://portfolio.example',cookie:'portfolio_github_token=valid','content-type':'application/json'},body:{id:'a'.repeat(64),feedback}},res);
      assert.equal(res.statusCode,400);
    }
  } finally {global.fetch=originalFetch;}
});

test('a same-day run is additive unless it explicitly asks to replace the day', () => {
  const merged = validateIngest({ date: '2026-10-25', items: [entry] });
  assert.equal(merged.replace, false, 'partial runs must not be able to shrink a published day');

  const explicit = validateIngest({ date: '2026-10-25', items: [entry], replace: true });
  assert.equal(explicit.replace, true);
  assert.throws(() => validateIngest({ date: '2026-10-25', items: [entry], replace: 'yes' }));
  assert.throws(() => validateIngest({ date: '2026-10-25', items: [entry], replace: 1 }));

  // The flag survives suppression pruning, which is how the handler sees it.
  const kept = suppressPreviousItems(explicit, [], []);
  assert.equal(kept.replace, true);
  assert.equal(kept.skipped, 0);

  const two = validateIngest({ date: '2026-10-25', items: [entry, { ...entry, url: 'https://arxiv.org/abs/2601.99999', title: 'Another GPU paper' }] });
  assert.equal(two.items.length, 2);
  const pruned = suppressPreviousItems(two, [two.items[0].id], []);
  assert.equal(pruned.items.length, 1);
  assert.equal(pruned.skipped, 1);
  assert.equal(pruned.replace, false, 'additive mode is the default even when items are pruned');
});
