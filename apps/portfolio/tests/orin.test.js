import test from 'node:test';
import assert from 'node:assert/strict';
import { digestItemCount, requireIngestToken, requireOrinOwner, resolveDigestUpdate, safeUrl, suppressPreviousItems, validDate, validateCategory, validateIngest } from '../server/orin.js';
import digestHandler, { videoListParams } from '../../../api/orin/digest.js';
import itemsHandler from '../../../api/orin/items.js';
import ingestHandler from '../../../api/orin/ingest.js';
import preflightHandler from '../../../api/orin/preflight.js';
import preferencesHandler from '../../../api/orin/preferences.js';
import categoriesHandler from '../../../api/orin/categories.js';
import contributionsHandler from '../../../api/orin/contributions.js';
import { ownerHeaders, sessionCookie } from './session-helper.js';

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
  for (const [handler, method] of [[digestHandler, 'GET'], [itemsHandler, 'PATCH'], [contributionsHandler, 'POST']]) {
    const res = response();
    await handler({ method, headers: {}, query: {} }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
  }
});

test('video browsing accepts bounded literal search and pages', async () => {
  assert.deepEqual(videoListParams({}), { page: 1, search: '', offset: 0, pageSize: 24 });
  assert.deepEqual(videoListParams({ page: '3', q: '  GPU kernels  ' }), { page: 3, search: 'GPU kernels', offset: 48, pageSize: 24 });
  for (const page of ['0', '-1', '1.5', 'abc', '10001', ['1', '2']]) {
    assert.throws(() => videoListParams({ page }), /Invalid video page/);
  }
  for (const q of ['x'.repeat(121), 'line\nbreak', ['GPU']]) {
    assert.throws(() => videoListParams({ q }), /Invalid video search/);
  }
  const headers = { cookie: await sessionCookie() };
  for (const query of [{ kind: 'video', page: '0' }, { kind: 'video', q: 'x'.repeat(121) }]) {
    const res = response();
    await digestHandler({ method: 'GET', query, headers }, res);
    assert.equal(res.statusCode, 400);
  }
});

test('share contributions only accept POST requests', async () => {
  const res = response();
  await contributionsHandler({ method: 'GET', headers: {}, query: {} }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'POST');
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
});

test('PDF contributions validate the extracted text before database access', async () => {
  const originalUrl = process.env.ORIN_DATABASE_URL;
  delete process.env.ORIN_DATABASE_URL;
  const headers = await ownerHeaders();
  const pdf = { name: 'gpu-paper.pdf', text: 'x'.repeat(120) };
  try {
    for (const body of [{}, { url: '' }, { pdf: 'yes' }, { pdf: [] },
      { pdf: {} }, { pdf: { ...pdf, name: '' } }, { pdf: { ...pdf, name: 'x'.repeat(301) } },
      { pdf: { ...pdf, name: 'bad\u0007name.pdf' } }, { pdf: { ...pdf, text: '' } },
      { pdf: { ...pdf, text: 'too short' } }, { pdf: { ...pdf, text: 'x'.repeat(12001) } },
      { pdf: { ...pdf, text: 'x'.repeat(200) }, url: 'https://arxiv.org/abs/2601.12345' }]) {
      const res = response();
      await contributionsHandler({ method: 'POST', headers, body }, res);
      assert.equal(res.statusCode, 400, `expected 400 for ${JSON.stringify(body).slice(0, 60)}`);
    }
    // A well-formed PDF share passes validation and only fails on storage.
    const res = response();
    await contributionsHandler({ method: 'POST', headers, body: { pdf, date: '2026-10-25' } }, res);
    assert.equal(res.statusCode, 503);
  } finally {
    if (originalUrl === undefined) delete process.env.ORIN_DATABASE_URL; else process.env.ORIN_DATABASE_URL = originalUrl;
  }
});

test('session identity must be an allowed ORIN user', async () => {
  const res = response();
  await digestHandler({ method: 'GET', query: {}, headers: { cookie: await sessionCookie({ login: 'someone-else' }) } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'Not authenticated');
});

test('owner mutations enforce JSON same-origin browser requests', async () => {
  const session = await sessionCookie();
  const headers = { host: 'portfolio.example', cookie: session, 'content-type': 'application/json' };
  await assert.rejects(requireOrinOwner({ headers }, true), error => error.status === 403);
  await assert.rejects(requireOrinOwner({ headers: { ...headers, origin: 'https://attacker.example' } }, true), error => error.status === 403);
});

test('ingest requires a separate strong secret and does not accept a GitHub session', async () => {
  const original = process.env.ORIN_INGEST_TOKEN;
  try {
    delete process.env.ORIN_INGEST_TOKEN;
    assert.throws(() => requireIngestToken({ headers: {} }), error => error.status === 503);
    process.env.ORIN_INGEST_TOKEN = 'a'.repeat(40);
    const session = await sessionCookie();
    assert.throws(() => requireIngestToken({ headers: { cookie: session } }), error => error.status === 401);
    requireIngestToken({ headers: { authorization: `Bearer ${'a'.repeat(40)}` } });
    const res = response();
    await ingestHandler({ method: 'POST', headers: { authorization: 'Bearer incorrect' } }, res);
    assert.equal(res.statusCode, 401);
  } finally { if (original === undefined) delete process.env.ORIN_INGEST_TOKEN; else process.env.ORIN_INGEST_TOKEN = original; }
});

test('owner sees explicit configuration error rather than fabricated digest data', async () => {
  const originalUrl = process.env.ORIN_DATABASE_URL;
  delete process.env.ORIN_DATABASE_URL;
  try {
    const res = response();
    await digestHandler({ method: 'GET', query: {}, headers: { cookie: await sessionCookie() } }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'ORIN database is not configured');
  } finally {
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

test('categories carry a bounded label plus who assigned it, and default to the model', () => {
  assert.equal(validateCategory('  Agents  '), 'Agents');
  for (const value of ['', 'x'.repeat(81), 7, null, undefined, true]) assert.throws(() => validateCategory(value), /Invalid category/);
  const labeled = validateIngest({ date: '2026-10-25', items: [{ ...entry, category: ' Agents ', categorySource: 'model' }] });
  assert.equal(labeled.items[0].category, 'Agents');
  assert.equal(labeled.items[0].categorySource, 'model');
  const bare = validateIngest({ date: '2026-10-25', items: [{ ...entry, category: 'Research' }] });
  assert.equal(bare.items[0].categorySource, 'model', 'collector labels default to the model source');
  const items = [{ ...entry, category: 'Agents' }];
  for (const broken of [{ ...entry, category: 'Agents', categorySource: 'browser' }, { ...entry, categorySource: 'user' }]) {
    assert.throws(() => validateIngest({ date: '2026-10-25', items: [broken] }));
  }
});

test('category/admin endpoints authenticate before touching private storage', async () => {
  const original = process.env.ORIN_INGEST_TOKEN;
  const originalUrl = process.env.ORIN_DATABASE_URL;
  delete process.env.ORIN_DATABASE_URL;
  const res = response();
  await categoriesHandler({ method: 'GET', headers: {}, query: {} }, res);
  assert.equal(res.statusCode, 401);
  try {
    process.env.ORIN_INGEST_TOKEN = 'a'.repeat(40);
    const collectorRes = response();
    await categoriesHandler({ method: 'GET', headers: { authorization: `Bearer ${'a'.repeat(40)}` } }, collectorRes);
    assert.equal(collectorRes.statusCode, 503);
    assert.equal(collectorRes.body.error, 'ORIN database is not configured');
  } finally {
    if (original === undefined) delete process.env.ORIN_INGEST_TOKEN; else process.env.ORIN_INGEST_TOKEN = original;
    if (originalUrl === undefined) delete process.env.ORIN_DATABASE_URL; else process.env.ORIN_DATABASE_URL = originalUrl;
  }
});

test('category reads allowed without errors while taxonomy writes stay owner-only and bounded', async () => {
  const headers = await ownerHeaders();
  // Body validation happens before any database access, so an unconfigured
  // database never masks a malformed payload.
  for (const [method, body] of [['POST', { label: '' }], ['POST', { label: 'x'.repeat(81) }], ['POST', {}], ['DELETE', { label: 9 }],
    ['DELETE', { label: 'Agents', action: 'explode' }], ['DELETE', { label: 'Agents', action: 'reassign' }],
    ['DELETE', { label: 'Agents', action: 'reassign', to: 7 }], ['DELETE', { label: 'Agents', action: 'reassign', to: 'x'.repeat(81) }],
    ['DELETE', { label: 'Agents', to: 'Inference' }]]) {
    const res = response();
    await categoriesHandler({ method, headers, body }, res);
    assert.equal(res.statusCode, 400);
  }
  // Unfile and reassign are explicit actions: label-only deletes never touch
  // items, so they stay 400-free before reaching storage.
  // Same-origin enforcement still applies to browser taxonomy writes.
  const res = response();
  await categoriesHandler({ method: 'POST', headers: { ...headers, origin: 'https://attacker.example' }, body: { label: 'Agents' } }, res);
  assert.equal(res.statusCode, 403);
});

test('owner category edits validate label work before reaching the database', async () => {
  const originalUrl = process.env.ORIN_DATABASE_URL;
  delete process.env.ORIN_DATABASE_URL;
  const headers = await ownerHeaders();
  try {
    for (const category of [5, true, { label: 'Agents' }, 'x'.repeat(81)]) {
      const res = response();
      await itemsHandler({ method: 'PATCH', headers, body: { id: 'a'.repeat(64), category } }, res);
      assert.equal(res.statusCode, 400);
    }
    // `category: null` is a deliberate clear, not a malformed request.
    const res = response();
    await itemsHandler({ method: 'PATCH', headers, body: { id: 'a'.repeat(64), category: null } }, res);
    assert.equal(res.statusCode, 503, 'well-formed edits proceed to storage');
  } finally {
    if (originalUrl === undefined) delete process.env.ORIN_DATABASE_URL; else process.env.ORIN_DATABASE_URL = originalUrl;
  }
});


test('worker feedback endpoint rejects browser sessions and invalid ingestion tokens', async () => {
  const original = process.env.ORIN_INGEST_TOKEN;
  process.env.ORIN_INGEST_TOKEN = 'a'.repeat(40);
  try {
    for (const headers of [{ cookie: await sessionCookie() }, { authorization: 'Bearer invalid' }]) {
      const res=response();
      await preferencesHandler({method:'GET',headers},res);
      assert.equal(res.statusCode,401);
      assert.equal(res.headers['Cache-Control'],'private, no-store');
    }
  } finally { if(original===undefined) delete process.env.ORIN_INGEST_TOKEN; else process.env.ORIN_INGEST_TOKEN=original; }
});

test('explicit feedback rejects booleans and out-of-range values before database access', async () => {
  const headers = await ownerHeaders();
  for(const feedback of [true,2,'1',null]) {
    const res=response();
    await itemsHandler({method:'PATCH',headers,body:{id:'a'.repeat(64),feedback}},res);
    assert.equal(res.statusCode,400);
  }
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

test('digest citation coverage is derived from unique URLs', () => {
  const second = { ...entry, url: 'https://arxiv.org/abs/2601.99999' };
  const payload = validateIngest({ date: '2026-10-25', items: [entry, second], digest: { title: 'Reading', groups: [{ title: 'GPU', urls: [entry.url, second.url] }] } });
  assert.equal(digestItemCount(payload.digest), 2);
  assert.equal(digestItemCount(null), 0);
  assert.equal(digestItemCount({}), 0);
  assert.equal(digestItemCount({ groups: [{ urls: [entry.url, entry.url] }, { urls: [entry.url] }] }), 1);
  assert.equal(digestItemCount({ groups: [{ urls: 'nope' }] }), 0);
});

test('a thin same-day digest cannot replace a richer one without an explicit override', () => {
  const second = { ...entry, url: 'https://arxiv.org/abs/2601.99999', title: 'Another GPU paper' };
  const rich = validateIngest({ date: '2026-10-25', items: [entry, second], digest: { title: 'Rich', groups: [{ title: 'GPU', urls: [entry.url] }, { title: 'More', urls: [second.url] }] } }).digest;
  const thin = validateIngest({ date: '2026-10-25', items: [entry], digest: { title: 'Thin', groups: [{ title: 'GPU', urls: [entry.url] }] } }).digest;

  const preserved = resolveDigestUpdate(rich, thin);
  assert.equal(preserved.preserved, true);
  assert.equal(preserved.reason, 'thinner-digest');
  assert.equal(preserved.digest.title, 'Rich');

  const replaced = resolveDigestUpdate(rich, thin, { replaceDigest: true });
  assert.equal(replaced.preserved, false);
  assert.equal(replaced.digest.title, 'Thin');

  assert.equal(resolveDigestUpdate(null, thin).digest, thin);
  assert.equal(resolveDigestUpdate(null, null).digest, null);
  const empty = resolveDigestUpdate(rich, null);
  assert.equal(empty.preserved, true);
  assert.equal(empty.reason, 'empty-digest');
  assert.deepEqual(resolveDigestUpdate(rich, rich).digest, rich);
  assert.equal(resolveDigestUpdate(rich, rich).preserved, false, 'equal coverage may republish');
});

test('digest status and the replace-digest override are strictly validated', () => {
  const ok = validateIngest({ date: '2026-10-25', items: [entry], digestStatus: { status: 'unavailable', message: 'Model timed out' } });
  assert.deepEqual(ok.digestStatus, { status: 'unavailable', message: 'Model timed out', model: '' });
  assert.equal(validateIngest({ date: '2026-10-25', items: [entry], digestStatus: { status: 'preserved', message: 'Kept previous digest', model: 'deepseek/deepseek-v4.1-flash-1017' } }).digestStatus.model, 'deepseek/deepseek-v4.1-flash-1017');
  for (const broken of [null, {}, { status: 'exploded', message: 'x' }, { status: 'ok' }, { status: 'ok', message: 'x'.repeat(501) }, { status: 'ok', message: 'x', model: 'y'.repeat(151) }]) {
    assert.throws(() => validateIngest({ date: '2026-10-25', items: [entry], digestStatus: broken }), /Invalid digest status|Invalid text field/);
  }
  assert.equal(validateIngest({ date: '2026-10-25', items: [entry], replaceDigest: true }).replaceDigest, true);
  for (const broken of ['yes', 1, null]) {
    assert.throws(() => validateIngest({ date: '2026-10-25', items: [entry], replaceDigest: broken }), /Invalid replace digest flag/);
  }
});

test('worker preflight validates its window before touching storage', async () => {
  const original = process.env.ORIN_INGEST_TOKEN;
  const originalUrl = process.env.ORIN_DATABASE_URL;
  try {
    delete process.env.ORIN_INGEST_TOKEN;
    const unconfigured = response();
    await preflightHandler({ method: 'GET', query: { date: '2026-10-25' }, headers: {} }, unconfigured);
    assert.equal(unconfigured.statusCode, 503);

    process.env.ORIN_INGEST_TOKEN = 'b'.repeat(40);
    const headers = { authorization: `Bearer ${'b'.repeat(40)}` };
    for (const date of [undefined, '', '2026-2-1', '2026-02-30', 'yesterday']) {
      const res = response();
      await preflightHandler({ method: 'GET', query: { date }, headers }, res);
      assert.equal(res.statusCode, 400, `date ${date}`);
      assert.equal(res.body.error, 'Valid date required');
    }

    const wrongMethod = response();
    await preflightHandler({ method: 'POST', query: {}, headers }, wrongMethod);
    assert.equal(wrongMethod.statusCode, 405);
    assert.equal(wrongMethod.headers.Allow, 'GET');

    // A valid request reaches storage, which is unconfigured here.
    delete process.env.ORIN_DATABASE_URL;
    const res = response();
    await preflightHandler({ method: 'GET', query: { date: '2026-10-25', days: '500' }, headers }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'ORIN database is not configured');
  } finally {
    if (original === undefined) delete process.env.ORIN_INGEST_TOKEN; else process.env.ORIN_INGEST_TOKEN = original;
    if (originalUrl === undefined) delete process.env.ORIN_DATABASE_URL; else process.env.ORIN_DATABASE_URL = originalUrl;
  }
});
