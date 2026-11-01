import test from 'node:test';
import assert from 'node:assert/strict';
import { filterSearchResults, publicationDay, searchPreview } from '../src/components/orin/searchResults.js';

test('returned-match filters use publication dates, preserve relevance, and put missing dates last', () => {
  const items = [{ id: 'a', source: 'rss' }, { id: 'b', source: 'rss', publishedAt: '2026-10-20T12:00:00Z' }, { id: 'c', source: 'twitter', publishedAt: '2026-10-21' }];
  assert.deepEqual(filterSearchResults(items).map(item => item.id), ['a', 'b', 'c']);
  assert.deepEqual(filterSearchResults(items, { source: 'rss', after: '2026-10-20', before: '2026-10-20' }).map(item => item.id), ['b']);
  assert.deepEqual(filterSearchResults(items, { sort: 'newest' }).map(item => item.id), ['c', 'b', 'a']);
  assert.deepEqual(filterSearchResults(items, { sort: 'oldest' }).map(item => item.id), ['b', 'c', 'a']);
  assert.equal(publicationDay({ publishedAt: 'invalid' }), '');
  assert.deepEqual(items.map(item => item.id), ['a', 'b', 'c']);
});

test('previews suppress duplicated titles and flag incomplete archived material', () => {
  assert.equal(searchPreview({ title: 'GPU Paper', excerpt: 'GPU Paper.' }).excerpt, '');
  assert.equal(searchPreview({ excerpt: 'The page requires sign-in to view content.' }).limited, true);
  assert.equal(searchPreview({ excerpt: 'A complete technical summary.' }).limited, false);
  assert.equal(searchPreview({ excerpt: 'a'.repeat(300) }).excerpt.length, 258);
});
