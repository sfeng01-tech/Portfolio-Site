import test from 'node:test';
import assert from 'node:assert/strict';
import { readOrinView, orinViewUrl, validCaptureUrl } from '../src/components/orin/viewState.js';

const tabs = ['digest', 'archive', 'saved', 'brain'].map(value => ({ value }));
test('archive URLs restore the selected day across reload and history navigation', () => {
  const href = 'https://example.com/orin?tab=archive';
  const dayUrl = orinViewUrl(href, { tab: 'archive', archiveDay: '2026-10-31', date: '' });
  assert.deepEqual(readOrinView(dayUrl.search, tabs), { tab: 'archive', date: '', archiveDay: '2026-10-31' });
  const indexUrl = orinViewUrl(dayUrl.href, { tab: 'archive', archiveDay: null, date: '' });
  assert.equal(indexUrl.search, '?tab=archive');
  assert.equal(readOrinView(dayUrl.search, tabs).archiveDay, '2026-10-31');
});
test('daily dates survive URL round trips and unrelated tabs omit them', () => {
  const url = orinViewUrl('https://example.com/orin?tab=archive&date=2026-10-31', { tab: 'digest', date: '2026-10-30' });
  assert.deepEqual(readOrinView(url.search, tabs), { tab: 'digest', date: '2026-10-30', archiveDay: null });
  assert.equal(orinViewUrl(url.href, { tab: 'saved', date: '2026-10-30' }).search, '?tab=saved');
  assert.equal(readOrinView('?tab=archive&date=2026-02-31', tabs).archiveDay, null);
});
test('capture validation matches public HTTPS restrictions before submission', () => {
  assert.equal(validCaptureUrl('https://example.com/article?q=1'), true);
  for (const value of ['', 'not-a-url', 'http://example.com', 'javascript:alert(1)', 'https://user:pass@example.com', 'https://example.com:8443', 'https://localhost', 'https://127.0.0.1', 'https://host.local', 'https://host.internal', `https://example.com/${'x'.repeat(2048)}`]) {
    assert.equal(validCaptureUrl(value), false, value);
  }
});
