import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedSourceUrl, canonicalUrl, normalizeItem, selectItems, validateDigest, dailyDate, observedPopularity } from './core.mjs';
import { parseFeed } from './sources.mjs';

test('source boundary rejects lookalike hosts, credentials and non-HTTPS', () => {
  assert.equal(allowedSourceUrl('twitter', 'https://x.com/search?q=ROCm'), true);
  assert.equal(allowedSourceUrl('google_news', 'https://news.google.com/rss/search?q=ROCm'), true);
  assert.equal(allowedSourceUrl('google_news', 'https://news.google.com.evil.test/rss'), false);
  for (const url of ['https://x.com.evil.test/post', 'http://x.com/post', 'https://user:secret@x.com/post', 'https://x.com:444/post']) assert.equal(allowedSourceUrl('twitter', url), false);
  assert.equal(canonicalUrl('https://x.com/a/status/1?utm_source=test#x'), 'https://x.com/a/status/1');
});

test('selection filters irrelevant, stale and previous-day items but permits same-day retries', () => {
  const now = new Date('2026-10-25T12:00:00Z');
  const item = n => normalizeItem({ url: `https://arxiv.org/abs/${n}`, title: 'GPU kernel research', excerpt: 'ROCm inference', publishedAt: '2026-10-25T00:00:00Z' }, 'arxiv', now);
  const config = { topics: ['GPU', 'ROCm'], maxAgeHours: 72, maxItems: 10 };
  const stale = { ...item(3), publishedAt: '2026-01-01T00:00:00Z' };
  const selected = selectItems([item(1), item(1), item(2), stale], config, { [item(1).url]: '2026-10-24', [item(2).url]: '2026-10-25' }, '2026-10-25', now);
  assert.deepEqual(selected.map(row => row.url), [item(2).url]);
});

test('model output may only cite supplied URLs', () => {
  const items = [{ url: 'https://arxiv.org/abs/1' }];
  assert.throws(() => validateDigest({ title: 'Digest', summary: 'Summary', groups: [{ title: 'GPU', summary: 'Summary', urls: ['https://evil.test/'] }] }, items), /unknown sources/);
  const raw = { title: 'Digest', summary: 'Summary', groups: [{ title: 'GPU', summary: 'Summary', urls: [items[0].url] }] };
  assert.deepEqual(validateDigest(raw, items), raw);
});

test('feed parsing uses HN discussion provenance and rejects XML entities', () => {
  const xml = '<rss><channel><item><title>GPU kernels</title><link>https://publisher.example/article</link><description><![CDATA[<a href="https://news.ycombinator.com/item?id=123">Comments</a>]]></description></item></channel></rss>';
  const items = parseFeed(xml, 'hackernews');
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://news.ycombinator.com/item?id=123');
  assert.throws(() => parseFeed('<!DOCTYPE foo [<!ENTITY x "boom">]><rss/>', 'rss'), /unsupported XML/);
});

test('Google News RSS results are accepted as a distinct source', () => {
  const xml = '<rss><channel><item><title>GPU inference breakthrough - Example News</title><link>https://news.google.com/rss/articles/CBMi-test</link><pubDate>Sun, 25 Oct 2026 18:00:00 GMT</pubDate><description>News about GPU inference.</description></item></channel></rss>';
  const items = parseFeed(xml, 'google_news');
  assert.equal(items.length, 1);
  assert.equal(items[0].source, 'google_news');
  assert.equal(items[0].url, 'https://news.google.com/rss/articles/CBMi-test');
});

test('digest date uses configured timezone across midnight UTC', () => {
  assert.equal(dailyDate('America/Los_Angeles', new Date('2026-10-25T01:00:00Z')), '2026-10-24');
});

test('observed popularity breaks relevance ties only within the same source', () => {
  const now = new Date('2026-10-25T12:00:00Z');
  const item = (id, source, metrics, time) => normalizeItem({ url: source === 'reddit' ? `https://www.reddit.com/r/LocalLLaMA/comments/${id}/` : `https://x.com/user/status/${id}`, title: 'GPU kernels', excerpt: 'GPU research', metrics, publishedAt: time }, source, now);
  const fresh = item('1', 'reddit', { score: 2 }, '2026-10-25T11:00:00Z');
  const popular = item('2', 'reddit', { score: 100 }, '2026-10-25T08:00:00Z');
  const twitter = item('3', 'twitter', { likes: 1000000 }, '2026-10-25T09:00:00Z');
  const unknown = item('4', 'reddit', undefined, '2026-10-25T10:00:00Z');
  const config = { topics: ['GPU'], maxItems: 10, maxAgeHours: 72 };
  const selected = selectItems([fresh, popular, twitter, unknown], config, {}, '2026-10-25', now);
  assert.equal(selected[0].url, popular.url);
  // Twitter retains its chronological cross-source slot despite much higher raw count.
  assert.equal(selected[2].url, twitter.url);
  assert.equal(observedPopularity(unknown), null);
  assert.equal(unknown.metrics, undefined);
  assert.ok(selected.indexOf(fresh) < selected.indexOf(unknown));
});
