import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrinStore, handleJsonRpc, MCP_TOOLS } from './server.mjs';

function fakeSql(rowsByPattern) {
  const calls = [];
  const sql = (strings, ...values) => {
    const query = strings.join('?');
    calls.push({ query, values });
    for (const [pattern, rows] of rowsByPattern) {
      if (query.includes(pattern)) return [...rows];
    }
    return [];
  };
  return { sql, calls };
}

const itemId = 'a'.repeat(64);
const item = {
  id: itemId,
  source: 'arxiv',
  url: 'https://arxiv.org/abs/2601.12345',
  title: 'A GPU paper',
  excerpt: 'Quantization and kernels',
  author: 'Example',
  topics: ['GPU kernels']
};

test('MCP exposes only read-only ORIN tools', () => {
  assert.deepEqual(MCP_TOOLS.map(tool => tool.name), [
    'orin_get_digest',
    'orin_list_dates',
    'orin_search_items',
    'orin_get_item'
  ]);
});

test('MCP initializes, lists tools, and calls the digest store', async () => {
  const { sql } = fakeSql([
    ['FROM orin_digests ORDER BY day DESC LIMIT 90', [{ day: '2026-10-25' }]],
    ['FROM orin_digests WHERE day', [{ digest: { title: 'Daily' }, source_status: [] }]],
    ['JOIN orin_digest_items', [{ item, is_read: true, saved: false }]]
  ]);
  const store = createOrinStore({ sql });

  const initialized = await handleJsonRpc({ jsonrpc: '2.0', id: 1, method: 'initialize' }, store);
  assert.equal(initialized.result.protocolVersion, '2025-06-18');
  assert.deepEqual(initialized.result.capabilities.tools, {});

  const listed = await handleJsonRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, store);
  assert.equal(listed.result.tools.length, 4);

  const called = await handleJsonRpc({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'orin_get_digest', arguments: {} }
  }, store);
  assert.deepEqual(called.result.content[0].text, JSON.stringify({
    date: '2026-10-25',
    availableDates: ['2026-10-25'],
    digest: { title: 'Daily' },
    items: [{ ...item, read: true, saved: false }],
    sourceStatus: []
  }, null, 2));
});

test('MCP requires initialization before tool calls and supports ping', async () => {
  const store = createOrinStore({ sql: fakeSql([]).sql });
  const freshState = { initialized: false };
  const blocked = await handleJsonRpc({
    jsonrpc: '2.0',
    id: 10,
    method: 'tools/call',
    params: { name: 'orin_list_dates' }
  }, store, freshState);
  assert.equal(blocked.error.code, -32600);

  const initialized = await handleJsonRpc({ jsonrpc: '2.0', id: 11, method: 'initialize' }, store, freshState);
  assert.equal(initialized.result.protocolVersion, '2025-06-18');
  assert.equal(freshState.initialized, true);

  const pong = await handleJsonRpc({ jsonrpc: '2.0', id: 12, method: 'ping' }, store, freshState);
  assert.deepEqual(pong.result, {});
});

test('search returns saved items with provenance and validates arguments', async () => {
  const { sql, calls } = fakeSql([
    ['DISTINCT ON (i.id)', [{ id: itemId, item, is_read: false, saved: true, day: '2026-10-25' }]]
  ]);
  const store = createOrinStore({ sql });
  const result = await store.searchItems({ query: 'gpu', savedOnly: true, limit: 10 });
  assert.deepEqual(result, [{ ...item, read: false, saved: true, day: '2026-10-25' }]);
  assert.match(calls[0].query, /i\.saved = true/);
  assert.deepEqual(calls[0].values, ['%gpu%', '%gpu%', '%gpu%', '%gpu%', '%gpu%', true, 10]);
  await assert.rejects(store.searchItems({ query: 'g' }), /query must contain/);
  await assert.rejects(store.searchItems({ query: 'gpu', limit: 101 }), /limit must be/);
});

test('get item returns a full item and reports missing data as a tool error', async () => {
  const { sql } = fakeSql([
    ['FROM orin_items WHERE id', [{ item, is_read: true, saved: false }]]
  ]);
  const store = createOrinStore({ sql });
  assert.deepEqual(await store.getItem({ id: itemId }), { ...item, id: itemId, read: true, saved: false });

  const missing = createOrinStore({ sql: fakeSql([]).sql });
  const response = await handleJsonRpc({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'orin_get_item', arguments: { id: itemId } }
  }, missing);
  assert.equal(response.result.isError, true);
  assert.equal(response.result.content[0].text, 'ORIN item not found');
});
