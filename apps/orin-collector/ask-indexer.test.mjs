import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChunkRecords, embedBatch, indexAsk } from './ask-indexer.mjs';

const vector = Array.from({ length: 1536 }, (_, index) => (index % 5) / 10);

test('ask chunk records cover items and notes and skip deleted items', () => {
  const records = buildChunkRecords(
    [
      { id: 'i1', item: { title: 'Agent systems', excerpt: 'Tool use and reliability.' } },
      { id: 'i2', item: { title: 'Hidden', excerpt: 'Gone', deleted: true } }
    ],
    [{ id: 'n1', title: 'My note', content: 'A private observation.' }]
  );
  assert.deepEqual(records.map(record => record.id), ['item:i1:0', 'note:n1:0']);
  assert.equal(records[0].sourceKind, 'item');
  assert.equal(records[0].title, 'Agent systems');
  assert.equal(records[1].sourceKind, 'note');
  assert.equal(records[1].sourceId, 'n1');
  assert.ok(records.every(record => record.hash && record.tokenCount > 0));
});

test('ask embeddings are requested with the fixed model and restored to input order', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({ data: [{ index: 1, embedding: vector }, { index: 0, embedding: vector }] })
    };
  };
  const vectors = await embedBatch(['first', 'second'], 'key', fetchImpl);
  assert.equal(request.url, 'https://openrouter.ai/api/v1/embeddings');
  assert.equal(request.body.model, 'openai/text-embedding-3-small');
  assert.equal(request.body.dimensions, 1536);
  assert.equal(request.body.provider.max_price.prompt, 1);
  assert.equal(vectors.length, 2);
  assert.ok(vectors.every(value => value.startsWith('[')));
});

test('ask embeddings reject a provider response with the wrong count or shape', async () => {
  await assert.rejects(() => embedBatch(['first'], 'key', async () => ({ ok: true, json: async () => ({ data: [] }) })), /length mismatch/);
  await assert.rejects(() => embedBatch(['first'], 'key', async () => ({
    ok: true, json: async () => ({ data: [{ index: 0, embedding: [1, 2, 3] }] })
  })), /Invalid embedding vector/);
  await assert.rejects(() => embedBatch(['first'], 'key', async () => ({ ok: false, status: 429 })), /429/);
});

test('ask index dry runs count passages without writing or calling a provider', async () => {
  const sql = async (strings) => {
    const query = strings.join(' ');
    if (query.includes('to_regclass')) return [{ present: true }];
    if (query.includes('FROM orin_items')) return [{ id: 'i1', item: { title: 'Agent systems', excerpt: 'Tool use.' } }];
    if (query.includes('FROM orin_notes')) return [{ id: 'n1', title: 'Note', content: 'Observation.' }];
    if (query.includes('FROM orin_chunks')) return [{ id: 'item:i1:0', hash: 'stale' }];
    throw new Error(`Unexpected write in dry run: ${query}`);
  };
  const result = await indexAsk({ sql, dryRun: true, log: () => {} });
  assert.equal(result.passages, 2);
  assert.equal(result.changed, 2);
  assert.equal(result.embedded, 0);
});

test('ask index refuses to run before the ask migration exists', async () => {
  await assert.rejects(() => indexAsk({
    sql: async () => [{ present: false }], dryRun: true, log: () => {}
  }), /Apply apps\/portfolio\/server\/orin-ask-schema\.sql/);
});
