import test from 'node:test';
import assert from 'node:assert/strict';
import { filterPredicate } from './delete-source.mjs';

test('filter predicate covers source, url and host matching', () => {
  const bySource = filterPredicate({ source: 'hackernews' });
  assert.deepEqual([bySource.kind, bySource.value], ['source', 'hackernews']);
  assert.equal(bySource.matches({ source: 'hackernews', url: 'https://example.org/a' }), true);
  assert.equal(bySource.matches({ source: 'reddit', url: 'https://example.org/a' }), false);

  const byUrl = filterPredicate({ url: 'https://Feed.example.com/rss/' });
  assert.equal(byUrl.matches({ source: 'rss', url: 'https://feed.example.com/rss' }), true);
  assert.equal(byUrl.matches({ source: 'rss', url: 'https://feed.example.com/rss/extra' }), true);
  assert.equal(byUrl.matches({ source: 'rss', url: 'https://other.example.com/rss' }), false);

  const byHost = filterPredicate({ host: 'www.x.com' });
  assert.equal(byHost.matches({ source: 'twitter', url: 'https://x.com/user/status/1' }), true);
  assert.equal(byHost.matches({ source: 'twitter', url: 'https://x.com.evil.test/a' }), false);
  assert.equal(byHost.matches({ url: 'not a url' }), false);
});

test('filter predicate rejects combined filters', () => {
  assert.equal(filterPredicate({ source: 'rss', url: 'https://a.com' }), null);
});
