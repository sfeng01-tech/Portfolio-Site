import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveDailyXRead } from './x-budget.mjs';

test('daily X cap creates the persistent date reservation before collection', async () => {
  const calls = [];
  await reserveDailyXRead('2026-10-25', {
    token: 'test-token', repository: 'owner/repo',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return calls.length === 1 ? new Response('', { status: 404 }) : new Response('', { status: 201 });
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[1].options.body), { name: 'ORIN_X_LAST_FETCH_DATE', value: '2026-10-25' });
});

test('daily X cap blocks another same-day request', async () => {
  let calls = 0;
  await assert.rejects(() => reserveDailyXRead('2026-10-25', {
    token: 'test-token', repository: 'owner/repo',
    fetchImpl: async () => { calls++; return new Response(JSON.stringify({ value: '2026-10-25' })); },
  }), /already used/);
  assert.equal(calls, 1);
});
