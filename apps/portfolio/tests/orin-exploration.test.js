import test from 'node:test';
import assert from 'node:assert/strict';
import { researchHandoff } from '../src/components/orin/exploration.js';

test('research handoff preserves the question and normalizes selected items and cited sources', () => {
  const id = 'a'.repeat(64);
  const result = researchHandoff('Q'.repeat(1600), [
    { id, title: 'Saved item', resolvedUrl: 'https://example.org/item', url: 'http://example.org/old', excerpt: 'Saved evidence' },
    { kind: 'item', sourceId: id, title: 'Cited item', url: 'https://example.org/item', snippet: 'Cited evidence' },
    { kind: 'note', sourceId: 'note-id', title: 'A note', url: null },
    { id: 'invalid', url: 'javascript:alert(1)' },
    { url: 'https://user:secret@example.org/private' }
  ]);
  assert.equal(result.question.length, 1600); // The review must allow editing, not silently truncate.
  assert.deepEqual(result.sources, [{ itemId: id, url: 'https://example.org/item', title: 'Cited item', excerpt: 'Cited evidence' }]);
  assert.match(result.notice, /3 sources have no HTTPS link/);
});

test('research handoff never turns note IDs into item IDs and bounds transferred excerpts', () => {
  const result = researchHandoff('Q', [{ kind: 'note', sourceId: 'a'.repeat(64), title: 'T'.repeat(600), url: 'https://example.org/note', snippet: 'x'.repeat(6000) }]);
  assert.equal(result.sources[0].itemId, undefined);
  assert.equal(result.sources[0].title.length, 500);
  assert.equal(result.sources[0].excerpt.length, 4000);
  assert.equal(result.notice, '');
});
