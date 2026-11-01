import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveShareLink, repairLinkTitles } from '../server/link-resolve.js';
import { youtubeId } from '../server/youtube.js';

const htmlResponse = body => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
const jsonResponse = payload => new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });

const OG_PAGE = `<!doctype html><html><body>
<meta property="og:title" content="A KV cache you can fork | Paper Blog">
<meta property="og:description" content="How prefix caching removes redundant token work.">
<meta name="author" content="Ada Lovelace">
<p>filler text so the description stays plausible</p></body></html>`;

test('youtube routing uses the dedicated id parser and oEmbed path', () => {
  for (const url of ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/shorts/dQw4w9WgXcQ']) {
    assert.equal(youtubeId(url), 'dQw4w9WgXcQ');
  }
  assert.equal(youtubeId('https://example.org/watch?v=dQw4w9WgXcQ'), null);
});

test('generic pages resolve og metadata through the bounded reader', async () => {
  const fetchImpl = (url, options) => {
    assert.match(url, /^https:\/\/example\.org\/post/);
    assert.equal(options.redirect, 'manual');
    return htmlResponse(OG_PAGE);
  };
  const resolved = await resolveShareLink('https://example.org/post/1?utm_source=chat', { fetcher: fetchImpl });
  assert.equal(resolved.via, 'page');
  assert.equal(resolved.titleSource, 'page');
  assert.equal(resolved.title, 'A KV cache you can fork | Paper Blog');
  assert.match(resolved.excerpt, /prefix caching/);
  assert.equal(resolved.author, 'Ada Lovelace');
});

test('github links route through the repo API and keep their title source', async () => {
  const fetchImpl = () => jsonResponse({ name: 'flashinfer', description: 'A kernels library.', owner: { login: 'flashinfer-ai' } });
  const resolved = await resolveShareLink('https://github.com/flashinfer-ai/flashinfer/tree/main', { fetcher: fetchImpl });
  assert.equal(resolved.via, 'github');
  assert.equal(resolved.titleSource, 'github');
  assert.equal(resolved.title, 'Flashinfer');
  assert.equal(resolved.excerpt, 'A kernels library.');
});

test('unsupported and walled sources resolve to nothing', async () => {
  assert.equal(await resolveShareLink('not a url'), null);
  assert.equal(await resolveShareLink('http://localhost:8080/private'), null);
  assert.equal(await resolveShareLink('https://x.com/user/status/123'), null);
  assert.equal(await resolveShareLink('https://example.org/blocked', {
    fetcher: () => new Response('denied', { status: 403, headers: { 'content-type': 'text/html' } }),
  }), null);
});

function fakeSql(handlers) {
  const calls = [];
  const sql = (strings, ...args) => {
    const text = strings.join('?');
    calls.push({ text, args });
    for (const [match, respond] of handlers) if (text.includes(match)) return respond;
    throw new Error(`Unhandled fake query: ${text.slice(0, 90)}`);
  };
  return { sql, calls };
}

test('repair pass backfills placeholders with og metadata and guards edits', async () => {
  const oldId = 'a'.repeat(64);
  const freshId = 'b'.repeat(64);
  const realId = 'c'.repeat(64);
  const rows = [
    { id: freshId, item: { title: 'Shared link from example.org', url: 'https://example.org/new', deleted: false }, is_read: false, saved: false },
    { id: oldId, item: { title: 'Shared link from example.com', url: 'https://example.com/old', deleted: false }, is_read: false, saved: false },
    { id: realId, item: { title: 'Owner typed this', url: 'https://example.net/2', deleted: false }, is_read: false, saved: false },
  ];
  const { sql, calls } = fakeSql([['UPDATE orin_items', [{ item: { title: 'Recovered headline', titleSource: 'page', titleCheckedAt: '2020-01-01T00:00:00Z' }, is_read: true, saved: true }]]]);
  const updated = await repairLinkTitles(rows, sql, { fetcher: () => htmlResponse('<meta property="og:title" content="Recovered headline"><body>words</body>') });
  // Two placeholder candidates repaired; the owner-typed title and walled/missing pages stay untouched.
  assert.equal(calls.filter(call => call.text.includes('UPDATE orin_items')).length, 2);
  assert.equal(updated[0].item.title, 'Recovered headline');
  assert.ok(updated[0].item.titleSource === 'page');
  assert.equal(updated[1].is_read, true);
  assert.equal(rows[2].item.title, 'Owner typed this');
  const patch = JSON.parse(calls[0].args[0]);
  assert.ok(patch.titleCheckedAt);
  assert.equal(patch.title, 'Recovered headline'); // placeholder rows take the fetched title
});
