import test from 'node:test';
import assert from 'node:assert/strict';
import { DIMENSIONS, embed, lexicalTerms, pilotUrl, prepareText, scoreRanking, validateEmbeddings } from './hybrid-pilot/pilot.mjs';

const row = index => ({ index, embedding: Array(DIMENSIONS).fill(index + 0.5) });
test('embedding responses must contain one finite vector per input, with exact dimensions and unique indices', () => {
  assert.deepEqual(validateEmbeddings({ data: [row(1), row(0)] }, 2).map(v => v[0]), [0.5, 1.5]);
  for (const data of [[row(0), row(0)], [{ index: 0, embedding: [1] }], [{ index: 0, embedding: Array(DIMENSIONS).fill(NaN) }]]) {
    assert.throws(() => validateEmbeddings({ data }, data.length), /invalid vector/);
  }
});
test('embedding requests use the selected model with bounded input and avoid leaking provider errors', async () => {
  let request;
  const fetchImpl = async (url, options) => { request = { url, options }; return new Response(JSON.stringify({ data: [row(0)] })); };
  await embed(['a public article'], 'secret', fetchImpl);
  assert.equal(JSON.parse(request.options.body).dimensions, DIMENSIONS);
  assert.deepEqual(JSON.parse(request.options.body).provider.max_price, { prompt: 1 });
  assert.equal(request.options.redirect, 'error');
  assert.doesNotMatch(request.url, /secret/);
  await assert.rejects(embed(['x'], 'secret', async () => new Response('secret upstream text', { status: 503 })), /^Error: Embedding provider returned HTTP 503$/);
  await assert.rejects(embed(['x'.repeat(3501)], 'secret', fetchImpl), /Invalid embedding request/);
});
test('the pilot cannot target the existing production endpoint or an unrelated host', () => {
  const env = { ORIN_DATABASE_URL: 'postgresql://owner:password@ep-prod-pooler.us-east-2.aws.neon.tech/orin', ORIN_PILOT_HOST: 'ep-prod.us-east-2.aws.neon.tech' };
  assert.throws(() => pilotUrl(env), /different Neon endpoint/);
  assert.throws(() => pilotUrl({ ...env, ORIN_PILOT_HOST: 'evil.example.com' }), /different Neon endpoint/);
  assert.match(pilotUrl({ ...env, ORIN_PILOT_HOST: 'ep-test.us-east-2.aws.neon.tech' }), /ep-test/);
});
test('evaluation measures hit and reciprocal rank without treating unrelated results as relevant', () => {
  assert.deepEqual(scoreRanking([{ item_id: 'abc' }, { item_id: 'xyz' }], ['xyz']), { hit: 1, reciprocalRank: 0.5 });
  assert.deepEqual(scoreRanking([{ item_id: 'abc' }], ['xyz']), { hit: 0, reciprocalRank: 0 });
  assert.equal(lexicalTerms('what GPU inference for AMD'), 'gpu OR inference OR amd');
  assert.ok(prepareText({ title: 'T', excerpt: 'x'.repeat(5000) }).length <= 3500);
});

test('expanded evaluation measures multi-label recall and separates negatives from unjudged results', async () => {
  const { judge, summarize } = await import('./hybrid-pilot/evaluate-v2.mjs');
  const rows = [{ item_id: 'aaa1' }, { item_id: 'ccc1' }, { item_id: 'unjudged' }, { item_id: 'bbb1' }];
  const score = judge(rows, ['aaa','bbb'], ['ccc'], 3);
  assert.deepEqual(score, { hit: 1, recall: 0.5, reciprocalRank: 1, negatives: 1, unjudged: 1 });
  assert.equal(summarize([score, score]).recallAt5, 0.5);
});
