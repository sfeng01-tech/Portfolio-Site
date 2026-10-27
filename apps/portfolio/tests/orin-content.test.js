import test from 'node:test';
import assert from 'node:assert/strict';
import { youtubeId, youtubeMetadata, repairYoutubeTitles } from '../server/youtube.js';
import { mutateContent, validateContentEdit, visibleDigest, visibleItems } from '../server/orin-content.js';
import itemsHandler from '../../../api/orin/items.js';
import { ownerHeaders } from './session-helper.js';

const id = 'a'.repeat(64);
const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const response = () => ({ headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('legacy video records use the database ID for deletion even with a missing or short JSON ID', async () => {
  const title = 'Why Aleena Left Meta to Start a Kerala Chayakada in Silicon Valley. ഒരു നാടൻ ചായക്കട';
  for (const legacyId of [undefined, 'dQw4w9WgXcQ', 'old-item-id']) {
    const [video] = visibleItems([{ id, item: { id: legacyId, title, url }, is_read: false, saved: false }]);
    assert.equal(video.id, id);
    assert.equal(video.title, title);
    const res = response();
    await mutateContent({ method: 'DELETE', body: { id: video.id } }, res, async () => async (_strings, requestedId) => {
      assert.equal(requestedId, id);
      return [{ id }];
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.deleted, true);
  }
});

test('legacy video title repair targets the database ID and caption responses retain it', async () => {
  const rows = [{ id, item: { id: 'legacy', url, title: 'Shared link from youtube.com' } }];
  await repairYoutubeTitles(rows, async (_strings, patch, requestedId) => {
    assert.equal(requestedId, id);
    return [{ item: { ...rows[0].item, ...JSON.parse(patch) } }];
  }, async () => ({ ok: true, json: async () => ({ title: 'Actual title' }) }));
  assert.equal(visibleItems(rows)[0].id, id);
  const res = response();
  await mutateContent({ method: 'PATCH', body: { id, title: 'My caption' } }, res, async () => async () => [{ id, item: { id: 'legacy', title: 'My caption' }, is_read: false, saved: false }]);
  assert.equal(res.body.item.id, id);
});

test('YouTube lookup supports shared video formats and rejects lookalike hosts', () => {
  for (const link of [url, 'https://youtu.be/dQw4w9WgXcQ?si=abc', 'https://m.youtube.com/shorts/dQw4w9WgXcQ', 'https://youtube.com/live/dQw4w9WgXcQ', 'https://music.youtube.com/watch?v=dQw4w9WgXcQ']) assert.equal(youtubeId(link), 'dQw4w9WgXcQ');
  for (const link of ['https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ', 'https://evil.test/youtube.com/watch?v=dQw4w9WgXcQ', 'http://youtu.be/dQw4w9WgXcQ', 'https://user@youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com/watch?v=invalid']) assert.equal(youtubeId(link), null);
});

test('metadata uses the fixed YouTube endpoint and falls back without losing shares', async () => {
  let calls = 0;
  const metadata = await youtubeMetadata(url, async (endpoint, options) => {
    calls++;
    assert.equal(endpoint.origin, 'https://www.youtube.com');
    assert.equal(endpoint.pathname, '/oembed');
    assert.equal(endpoint.searchParams.get('url'), url);
    assert.equal(options.redirect, 'error');
    return { ok: true, json: async () => ({ title: ' Actual video title ', author_name: 'Video creator', html: '<untrusted embed>' }) };
  });
  assert.deepEqual(metadata, { title: 'Actual video title', author: 'Video creator', titleSource: 'youtube' });
  assert.equal(calls, 1);
  assert.equal(await youtubeMetadata('https://evil.test/watch', () => { throw new Error('Must not fetch'); }), null);
  for (const fetcher of [async () => { throw new Error('timeout'); }, async () => ({ ok: false }), async () => ({ ok: true, json: async () => ({}) })]) assert.equal(await youtubeMetadata(url, fetcher), null);
});

test('legacy titles repair automatically and concurrent owner edits win', async () => {
  const rows = [{ item: { id, url, title: 'Shared link from youtube.com' } }, { item: { id: 'b'.repeat(64), url, title: 'My caption', titleSource: 'user' } }];
  let calls = 0;
  const sql = async (_strings, patch) => { calls++; return [{ item: { ...rows[0].item, ...JSON.parse(patch) } }]; };
  const fetcher = async () => ({ ok: true, json: async () => ({ title: 'Video title', author_name: 'Creator' }) });
  await repairYoutubeTitles(rows, sql, fetcher);
  assert.equal(calls, 1);
  assert.equal(rows[0].item.title, 'Video title');
  assert.equal(rows[1].item.title, 'My caption');
  const concurrent = [{ item: { id, url, title: 'Shared link from youtube.com' } }];
  await repairYoutubeTitles(concurrent, async () => [], fetcher);
  assert.equal(concurrent[0].item.title, 'Shared link from youtube.com');
});

test('deleted finds disappear from lists and digest citations without stale summaries', () => {
  const rows = [{ item: { id, url, deleted: true } }, { item: { id: 'b', url: 'https://example.com/keep' }, saved: true }];
  const digest = { summary: 'Summary of both videos', groups: [{ title: 'Both', summary: 'Both', urls: [url, 'https://example.com/keep'] }, { title: 'Removed', summary: 'Removed', urls: [url] }] };
  assert.deepEqual(visibleItems(rows).map(item => item.id), ['b']);
  const result = visibleDigest(digest, rows);
  assert.equal(result.summary, '');
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].summary, '');
  assert.deepEqual(result.groups[0].urls, ['https://example.com/keep']);
  assert.equal(result.itemCount, 1);
  assert.equal(digest.groups.length, 2);
});

test('content edits validate bounds, safe URLs, and explicit caption ownership', () => {
  assert.deepEqual(validateContentEdit({ title: ' Caption ', excerpt: '' }), { title: 'Caption', titleSource: 'user', excerpt: '' });
  for (const body of [{ title: '' }, { title: 'x'.repeat(501) }, { title: 'bad\u0007text' }, { excerpt: 'x'.repeat(12001) }, { url: 'javascript:alert(1)' }]) assert.throws(() => validateContentEdit(body));
});

test('content mutation validates before storage and handles missing records', async () => {
  const storage = () => { throw new Error('Storage must not be called'); };
  await assert.rejects(mutateContent({ method: 'DELETE', body: { id: 'invalid' } }, response(), storage), { status: 400 });
  await assert.rejects(mutateContent({ method: 'PATCH', body: { id, title: '' } }, response(), storage), { status: 400 });
  const missing = response();
  await mutateContent({ method: 'DELETE', body: { id } }, missing, async () => async () => []);
  assert.equal(missing.statusCode, 404);
  const edited = response();
  const item = { id, title: 'New caption' };
  await mutateContent({ method: 'PATCH', body: item }, edited, async () => async () => [{ item, is_read: true, saved: false }]);
  assert.deepEqual(edited.body.item, { ...item, read: true, saved: false });
});

test('delete and caption API enforce owner authentication and same-origin writes', async () => {
  for (const method of ['PATCH', 'DELETE']) {
    const anonymous = response();
    await itemsHandler({ method, headers: {}, body: { id, title: 'Caption' } }, anonymous);
    assert.equal(anonymous.statusCode, 401);
    const crossOrigin = response();
    await itemsHandler({ method, headers: await ownerHeaders({ origin: 'https://evil.test' }), body: { id, title: 'Caption' } }, crossOrigin);
    assert.equal(crossOrigin.statusCode, 403);
  }
});
