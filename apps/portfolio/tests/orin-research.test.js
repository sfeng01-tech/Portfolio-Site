import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { createResearchHandler } from '../../../api/orin/research.js';
import {
  DEFAULT_RESEARCH_PROFILE, validateResearchProfile, validateResearchBatch, validateResearchPatch,
  researchCapabilities, publicResearchJob, DEFAULT_RESEARCH_MODEL
} from '../server/orin-research.js';
import { ownerHeaders } from './session-helper.js';

const response = () => ({ headers: {}, statusCode: 200, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const id = '4f2b9a5c-0000-4000-8000-abcdefabcdef';
const env = { OPENROUTER_API_KEY: 'private-model-key', ORIN_RESEARCH_MODEL: 'example/research-model', TAVILY_API_KEY: 'private-search-key' };
const batch = overrides => ({ action: 'submit', jobs: [{ question: 'Does quantization affect safety?', sources: [{ url: 'https://example.org/paper', title: 'Paper' }] }], scope: 'library', maxUsd: 1, batchPrompt: 'Check counterevidence', ...overrides });

function fixture(results, overrides = {}) {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({ query: strings.join('?'), values });
    const result = results.shift();
    if (result instanceof Error) throw result;
    return typeof result === 'function' ? result(values) : result;
  };
  const api = createResearchHandler({ getSql: async () => sql, authorize: async () => {}, environment: () => env, recommend: () => [], ...overrides });
  return { api, calls };
}

test('research defaults cover systems, agents, reinforcement learning, harnesses, and model safety', () => {
  assert.deepEqual(validateResearchProfile(DEFAULT_RESEARCH_PROFILE), DEFAULT_RESEARCH_PROFILE);
  assert.ok(DEFAULT_RESEARCH_PROFILE.interests.includes('AI model safety'));
  assert.ok(DEFAULT_RESEARCH_PROFILE.interests.includes('Reinforcement learning'));
  assert.ok(DEFAULT_RESEARCH_PROFILE.interests.includes('Harness development'));
  for (const profile of [null, [], { ...DEFAULT_RESEARCH_PROFILE, interests: [] }, { ...DEFAULT_RESEARCH_PROFILE, interests: ['x'.repeat(101)] }, { ...DEFAULT_RESEARCH_PROFILE, amdFocus: 'yes' }]) {
    assert.throws(() => validateResearchProfile(profile), /Invalid|Choose/);
  }
});

test('batch validation bounds cost and size while allowing question-only and multi-source research', () => {
  assert.equal(validateResearchBatch(batch()).jobs.length, 1);
  assert.deepEqual(validateResearchBatch(batch({ jobs: [{ question: 'What is missing?' }] })).jobs[0].sources, []);
  for (const broken of [
    batch({ maxUsd: 0 }), batch({ maxUsd: 26 }), batch({ maxUsd: '1' }), batch({ scope: 'private-web' }),
    batch({ jobs: [] }), batch({ jobs: Array(11).fill({ question: 'Q' }) }), batch({ jobs: [{ question: ' ' }] }),
    batch({ jobs: [{ question: 'Q', prompt: 'x'.repeat(5001) }] }), batch({ jobs: [{ question: 'Q', sources: [{ url: 'http://example.org' }] }] }),
    batch({ jobs: [{ question: 'Q', sources: [{ url: 'https://127.0.0.1' }] }] }),
    batch({ jobs: [{ question: 'Q', sources: [{ url: 'https://private.internal' }] }] }),
    batch({ jobs: [{ question: 'Q', sources: [{ url: 'https://user:pass@example.org' }] }] }),
    batch({ jobs: [{ question: 'Q', sources: [{ url: 'https://example.org', itemId: 'bad' }] }] })
  ]) assert.throws(() => validateResearchBatch(broken), /Invalid|limit|Submit/);
});

test('capabilities never contain provider secrets and distinguish library from web', () => {
  assert.equal(researchCapabilities({}).library, false);
  assert.equal(researchCapabilities({ ...env, TAVILY_API_KEY: '' }).web, false);
  assert.equal(researchCapabilities(env).web, true);
  assert.ok(!JSON.stringify(researchCapabilities(env)).includes('private-model-key'));
  assert.equal(researchCapabilities(env).workerRequired, true);
  assert.equal(DEFAULT_RESEARCH_MODEL, 'deepseek/deepseek-v4.1-flash-1017');
  assert.equal(researchCapabilities({ OPENROUTER_API_KEY: 'key' }).model, DEFAULT_RESEARCH_MODEL);
  assert.equal(researchCapabilities({ ...env, ORIN_RESEARCH_MODEL: ' custom/model ' }).model, 'custom/model');
});

test('feedback uses explicit outcomes and rejects malformed updates', () => {
  assert.deepEqual(validateResearchPatch({ id, action: 'cancel' }), { id, action: 'cancel' });
  assert.equal(validateResearchPatch({ id, action: 'feedback', feedback: { outcome: 'already-solved' } }).feedback.notes, '');
  for (const body of [{ id, action: 'complete' }, { id: 'bad', action: 'cancel' }, { id, action: 'feedback', feedback: { outcome: 'maybe' } }]) assert.throws(() => validateResearchPatch(body), /Invalid/);
});

test('public jobs exclude worker leases and retain partial findings and cost', () => {
  const job = publicResearchJob({ id, lease_token: 'secret', attempts: 2, spent_usd: '0.012300', result: { partial: true } });
  assert.equal(job.spentUsd, 0.0123);
  assert.deepEqual(job.result, { partial: true });
  assert.equal('lease_token' in job, false);
  assert.equal('attempts' in job, false);
});

test('anonymous access and cross-origin mutations are denied before storage', async () => {
  for (const method of ['GET', 'POST', 'PATCH']) {
    const res = response();
    await handler({ method, headers: {}, body: batch() }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
  }
  const headers = await ownerHeaders({ origin: 'https://attacker.example' });
  const res = response();
  await handler({ method: 'POST', headers, body: { action: 'profile', profile: DEFAULT_RESEARCH_PROFILE } }, res);
  assert.equal(res.statusCode, 403);
});

test('submission is atomic, snapshots the profile, and splits a total batch allowance', async () => {
  const profile = { ...DEFAULT_RESEARCH_PROFILE, hardware: 'One AMD GPU' };
  const { api, calls } = fixture([[{ profile }], values => JSON.parse(values[0]).map(job => ({ ...job, status: 'queued', spent_usd: 0 }))]);
  const res = response();
  await api({ method: 'POST', body: batch({ jobs: [{ question: 'Q1' }, { question: 'Q2' }, { question: 'Q3' }] }) }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(calls.length, 2);
  assert.match(calls[1].query, /jsonb_to_recordset/);
  assert.equal(res.body.jobs.length, 3);
  assert.equal(res.body.jobs[0].profile.hardware, 'One AMD GPU');
  assert.equal(res.body.jobs[0].options.maxUsd, 0.333333);
  assert.ok(res.body.jobs.reduce((sum, job) => sum + job.options.maxUsd, 0) <= 1);
  assert.equal(new Set(res.body.jobs.map(job => job.options.batchId)).size, 1);
  assert.equal(res.body.jobs[0].options.batchPrompt, 'Check counterevidence');
});

test('unconfigured provider rejects submission without touching storage', async () => {
  for (const environment of [() => ({}), () => ({ ...env, TAVILY_API_KEY: '' })]) {
    const { api, calls } = fixture([], { environment });
    const res = response();
    await api({ method: 'POST', body: batch({ scope: 'web' }) }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(calls.length, 0);
  }
});

test('GET includes historical candidates and returns suggestions with defaults', async () => {
  let supplied;
  const { api, calls } = fixture([[], [{ id, status: 'completed', spent_usd: '0.1' }], [{ id: 'abc', item: { title: 'Older source' }, saved: true }]], {
    recommend: (items, profile, jobs) => { supplied = { items, profile, jobs }; return [{ id: 'suggestion' }]; }
  });
  const res = response();
  await api({ method: 'GET' }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.suggestions[0].id, 'suggestion');
  assert.equal(supplied.items[0].saved, true);
  assert.equal(supplied.jobs[0].spentUsd, 0.1);
  assert.deepEqual(supplied.profile, DEFAULT_RESEARCH_PROFILE);
  assert.match(calls[2].query, /WHERE saved/);
});

test('cancellation only updates active jobs and preserves results', async () => {
  const { api, calls } = fixture([[{ id, status: 'cancelled', result: { evidence: ['partial'] }, spent_usd: '0.2' }]]);
  const res = response();
  await api({ method: 'PATCH', body: { id, action: 'cancel' } }, res);
  assert.equal(res.statusCode, 200);
  assert.match(calls[0].query, /status IN \('queued', 'running'\)/);
  assert.match(calls[0].query, /lease_token = NULL/);
  assert.deepEqual(res.body.job.result, { evidence: ['partial'] });
  const missing = fixture([[]]);
  const conflict = response();
  await missing.api({ method: 'PATCH', body: { id, action: 'cancel' } }, conflict);
  assert.equal(conflict.statusCode, 409);
});

test('storage errors do not leak provider or database details', async () => {
  const { api } = fixture([new Error('postgres://secret-token@private-db')]);
  const res = response();
  await api({ method: 'POST', body: { action: 'profile', profile: DEFAULT_RESEARCH_PROFILE } }, res);
  assert.equal(res.statusCode, 503);
  assert.doesNotMatch(JSON.stringify(res.body), /secret-token|private-db/);
});
