import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteSourceItems, listSources, normalizeSourceName } from '../server/orin-source-repo.js';

// Minimal postgres.js stand-in: the caller uses tagged templates, so text is
// the plain query after flattening values into placeholders.
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

test('normalizeSourceName bounds and trims source labels', () => {
  assert.equal(normalizeSourceName(' hackernews '), 'hackernews');
  assert.throws(() => normalizeSourceName(''), { status: 400 });
  assert.throws(() => normalizeSourceName('a\u0000b'), { status: 400 });
  assert.throws(() => normalizeSourceName('x'.repeat(41)), { status: 400 });
  assert.throws(() => normalizeSourceName(42), { status: 400 });
});

test('listSources reports live and deleted counts', async () => {
  const { sql } = fakeSql([
    ['GROUP BY 1', [
      { source: 'hackernews', items: 10, deleted: 4 },
      { source: '', items: 2, deleted: 2 },
    ]],
  ]);
  const sources = await listSources(sql);
  assert.deepEqual(sources, [
    { source: 'hackernews', items: 10, deleted: 4 },
    { source: 'unknown', items: 2, deleted: 2 },
  ]);
});

test('deleteSourceItems targets one source and stamps the retention clock', async () => {
  const { sql, calls } = fakeSql([['UPDATE orin_items', [{ count: 2 }]]]);
  const count = await deleteSourceItems(sql, 'rss');
  assert.equal(count, 2);
  const update = calls.find(call => call.text.includes('UPDATE orin_items'));
  const patch = JSON.parse(update.args[0]);
  assert.equal(patch.deleted, true);
  assert.ok(typeof patch.deletedAt === 'string' && Number.isFinite(Date.parse(patch.deletedAt)));
  assert.ok(update.args[1] === 'rss');
  assert.ok(update.text.includes("item->>'source' = "));  assert.ok(update.text.includes('deleted') && update.text.includes('false'), 'already deleted rows must be skipped');
  assert.ok(update.text.includes('saved = false'), 'deleting a source clears the reading list flag');
});
