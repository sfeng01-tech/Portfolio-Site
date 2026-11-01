import test from 'node:test';
import assert from 'node:assert/strict';
import { collectEvidence, publicHttps, validateBrief, runResearch, ResearchBudgetExceeded, ResearchCancelled, DEFAULT_RESEARCH_MODEL } from './research-engine.mjs';
import { createResearchStore, processNextResearch, researchFailureMessage } from './research-worker.mjs';

const evidence = collectEvidence([{ url: 'https://example.org/paper', title: 'Paper', excerpt: 'Benchmark limited to a specific GPU.', provenance: 'web' }]);
const brief = () => ({ outcome: 'candidate', title: 'Test portability', summary: 'A candidate worth investigating.', opportunity: 'Evaluate the reported limitation.', amdBenefit: 'Potential portability evidence.', existingWork: 'The cited paper provides a baseline.', counterevidence: 'No tests have been run.', limitations: ['Excerpt only.'], nextQuestions: ['Which hardware?'], claims: [{ statement: 'The paper reports a limited benchmark.', evidenceIds: ['E1', 'E2'], kind: 'source_claim' }], experiment: { action: 'Reproduce baseline', baseline: 'Published recipe', metrics: 'Latency and correctness', requirements: 'Target GPU', stopCondition: 'Already covered by existing results' } });
const job = (scope = 'web') => ({ id: 'job', question: 'Does this transfer to AMD?', prompt: '', sources: [{ url: 'https://example.org/paper', title: 'Paper', excerpt: 'Benchmark limited to a specific GPU.' }], profile: { interests: ['AI safety'] }, options: { scope, maxUsd: 1, batchPrompt: '', model: 'test/model' } });
const env = { OPENROUTER_API_KEY: 'test-key', ORIN_RESEARCH_MODEL: 'test/model', TAVILY_API_KEY: 'test-search' };
const json = value => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
test('the default research model is DeepSeek V4.1 Flash 1017', () => {
  assert.equal(DEFAULT_RESEARCH_MODEL, 'deepseek/deepseek-v4.1-flash-1017');
});
function provider({ queries = ['prior work', 'counterevidence'], report = brief(), prices = '0.000001', overrides = [], reasoning, names = ['Evidence', 'Prior work', 'AMD'], varySearch = false, startPhase = 0 } = {}) {
  const calls = [];
  let completions = startPhase;
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: init?.body && JSON.parse(init.body) });
    if (url.endsWith('/models')) return json({ data: [{ id: 'test/model', context_length: 200000, pricing: { prompt: prices, completion: prices, overrides }, reasoning }] });
    if (url.endsWith('/extract')) return json({ results: [{ url: 'https://example.org/paper', raw_content: 'Fuller source text about a benchmark on a specific GPU.' }], failed_results: [] });
    if (url.endsWith('/search')) return json({ results: [{ url: 'https://example.net/implementation', title: 'Existing implementation', raw_content: varySearch ? (JSON.parse(init.body).query.startsWith('follow-up') ? 'Follow-up passage' : 'Initial passage') : 'An implementation covers part of the proposed optimization.' }] });
    if (url.endsWith('/completions')) {
      const phase = completions++;
      const modelData = JSON.parse(JSON.parse(init.body).messages[1].content).data;
      const firstWebId = modelData.evidence?.find(row => row.url === 'https://example.net/implementation')?.id || 'E1';
      const result = phase === 0 ? { perspectives: queries.map((query, i) => ({ id: `P${i + 1}`, name: names[i], question: `Question ${i + 1}?`, initialQuery: query })) }
        : phase === 1 ? { perspectives: queries.map((query, i) => ({ id: `P${i + 1}`, answer: 'Evidence is limited.', status: 'grounded', evidenceIds: [firstWebId], followUpQuestion: `What about ${query}?`, followUpQuery: `follow-up ${query}` })) }
        : phase === 2 ? { perspectives: queries.map((query, i) => ({ id: `P${i + 1}`, followUpAnswer: 'The initial source is relevant.', followUpStatus: 'grounded', followUpEvidenceIds: ['E1'] })), outline: [{ title: 'Evidence', purpose: 'Assess evidence', evidenceIds: ['E1'], subsections: [] }, { title: 'Limitations', purpose: 'Investigate limitations', evidenceIds: ['E1'], subsections: [] }] }
        : { ...report, claims: report.claims?.map(claim => {
          const actual = JSON.parse(JSON.parse(init.body).messages[1].content).data.evidence;
          const prior = actual.find(row => row.url === 'https://example.net/implementation');
          return { ...claim, evidenceIds: prior ? ['E1', prior.id] : ['E1'] };
        }) };
      return json({ choices: [{ message: { content: JSON.stringify(result) } }] });
    }
    throw new Error('Unexpected network endpoint');
  };
  return { fetchImpl, calls };
}

test('evidence rejects unsafe URLs, empty links and deduplicates with source provenance', () => {
  for (const url of ['http://example.org', 'https://127.0.0.1/x', 'https://[::1]/', 'https://localhost/x', 'https://user:pass@example.org/', 'https://example.org:8443/']) assert.equal(publicHttps(url), null);
  const items = collectEvidence([{ url: 'https://example.org/a', excerpt: 'Fact', itemId: 'saved-id' }, { url: 'https://example.org/a', excerpt: 'Duplicate' }, { url: 'https://example.org/no-text' }]);
  assert.equal(items.length, 2); assert.equal(items[0].itemId, 'saved-id'); assert.equal(items[0].coverage, 'excerpt');
});

test('brief rejects fabricated citations and requires a testable experiment', () => {
  assert.throws(() => validateBrief({ ...brief(), claims: [{ statement: 'Invented', kind: 'source_claim', evidenceIds: ['E99'] }] }, evidence, 'web'), /unsupported citation/);
  assert.throws(() => validateBrief({ ...brief(), claims: [{statement:'Supported', kind:'source_claim', evidenceIds:['E1']}], experiment: {} }, evidence, 'web'), /experiment action/);
  assert.equal(validateBrief({ ...brief(), claims: [{ statement: 'Supported', kind: 'source_claim', evidenceIds: ['E1'] }] }, evidence, 'web', ['E1']).outcome, 'candidate');
  assert.equal(validateBrief({ ...brief(), claims: [{ statement: 'Interpretation', kind: 'interpretation', evidenceIds: ['E1'] }] }, evidence, 'web', ['E1']).outcome, 'insufficient_evidence');
  assert.equal(validateBrief({ ...brief(), claims: [{ statement: 'Supported', kind: 'source_claim', evidenceIds: ['E1'] }] }, evidence, 'library').outcome, 'insufficient_evidence');
});

test('search results do not misattribute retained library excerpts to the web', () => {
  const library = collectEvidence([{ url: 'https://example.org/shared', excerpt: 'Library says A', provenance: 'library' }]);
  const web = collectEvidence([{ url: 'https://example.org/shared', excerpt: 'Web says B', provenance: 'web' }], library);
  assert.equal(web[0].id, library[0].id);
  assert.equal(web[0].excerpt, 'Library says A');
  assert.equal(web[1].provenance, 'web');
  assert.equal(web[1].excerpt, 'Web says B');
  assert.notEqual(web[0].id, web[1].id);
});

test('research retrieves prior art, preserves evidence and reserves before each paid request', async () => {
  const fake = provider(); const reservations = []; const checkpoints = []; let balance = 0;
  const result = await runResearch(job(), { env, fetchImpl: async (url, init) => {
    if (!url.endsWith('/models')) assert.ok(balance > 0, 'paid calls must be reserved');
    return fake.fetchImpl(url, init);
  }, reserve: async amount => { reservations.push(amount); balance += amount; return true; }, checkpoint: async (...args) => checkpoints.push(args), searchLibrary: async () => [] });
  assert.equal(reservations.length, 8); assert.equal(result.searchLog.length, 7);
  assert.equal(result.evidence.length, 3); assert.equal(result.evidence[1].coverage, 'page_text');
  assert.equal(result.evidence[0].provenance, 'provided'); assert.match(result.evidence[1].excerpt, /Fuller source text/);
  assert.equal(result.outcome, 'candidate'); assert.equal(result.reservedUsd, balance);
  assert.equal(checkpoints.at(-1)[1].evidence.length, 3);
  assert.ok(fake.calls.every(call => ['https://openrouter.ai/api/v1/models', 'https://openrouter.ai/api/v1/chat/completions', 'https://api.tavily.com/search', 'https://api.tavily.com/extract'].includes(call.url)));
});

test('deep research follows up every perspective and retains its cited discussion and outline', async () => {
  const fake = provider({ queries: ['prior work', 'counterevidence', 'AMD applicability'] });
  const result = await runResearch({ ...job(), options: { ...job().options, depth: 'deep' } }, { env, fetchImpl: fake.fetchImpl });
  assert.equal(result.perspectives.length, 3);
  const planner = fake.calls.find(call => call.url.endsWith('/completions')).body;
  assert.equal(planner.response_format.type, 'json_schema');
  assert.equal(planner.response_format.json_schema.schema.properties.perspectives.minItems, 3);
  assert.equal(planner.response_format.json_schema.schema.properties.perspectives.maxItems, 3);
  assert.equal(planner.provider.require_parameters, true);
  assert.equal(fake.calls.filter(call => call.url.endsWith('/search')).length, 6);
  assert.ok(result.perspectives.every(p => p.status === 'grounded' && p.followUpStatus === 'grounded' && p.evidenceIds.length && p.followUpEvidenceIds.length));
  assert.ok(result.outline.every(section => section.title && Array.isArray(section.evidenceIds)));
  assert.equal(result.searchLog.filter(entry => entry.phase === 'follow-up' && entry.source === 'web').length, 3);
});

test('twenty selected sources leave room for independently searched passages', async () => {
  const fake = provider();
  const sources = Array.from({ length: 20 }, (_, i) => ({ url: `https://example.org/paper-${i}`, title: `Paper ${i}`, excerpt: `Owner excerpt ${i}` }));
  const current = { ...job(), sources };
  const result = await runResearch(current, { env, searchLibrary: async () => [],
    loadSources: async () => sources.map(source => ({ ...source, excerpt: `Library: ${source.excerpt}`, provenance: 'library' })),
    fetchImpl: async (url, init) => url.endsWith('/extract')
      ? json({ results: sources.map(source => ({ url: source.url, raw_content: `Web: ${source.excerpt}` })) })
      : fake.fetchImpl(url, init) });
  assert.ok(result.evidence.some(row => row.url === 'https://example.net/implementation'));
  assert.ok(result.searchLog.some(row => row.source === 'web' && row.usableResults > 0));
});

test('standard research preserves three explicitly requested perspectives and searches one follow-up', async () => {
  const fake = provider({ queries: ['prior work', 'counterevidence', 'AMD applicability'] });
  const current = { ...job(), options: { ...job().options, depth: 'standard', perspectives: ['Evidence', 'Prior work', 'AMD'] } };
  const result = await runResearch(current, { env, fetchImpl: fake.fetchImpl });
  assert.deepEqual(result.perspectives.map(p => p.name), current.options.perspectives);
  assert.equal(fake.calls.filter(call => call.url.endsWith('/search')).length, 4);
  assert.equal(result.perspectives[1].followUpStatus, 'insufficient_evidence');
  assert.match(result.perspectives[1].followUpAnswer, /Not investigated/);
});

test('requested perspective names at the 200-character API limit are preserved', async () => {
  const name = `GPU ${'a'.repeat(196)}`;
  const fake = provider({ names: [name, 'Prior work'] });
  const current = { ...job('library'), options: { ...job('library').options, perspectives: [name] } };
  const result = await runResearch(current, { env, fetchImpl: fake.fetchImpl });
  assert.equal(result.perspectives[0].name, name);
});

test('follow-up retrieval cannot mutate a passage already cited in the first research round', async () => {
  const fake = provider({ varySearch: true });
  const result = await runResearch(job(), { env, fetchImpl: fake.fetchImpl });
  const cited = result.evidence.find(row => row.id === result.perspectives[0].evidenceIds[0]);
  const updated = result.evidence.find(row => row.url === cited.url && row.excerpt === 'Follow-up passage');
  assert.equal(cited.excerpt, 'Initial passage');
  assert.ok(updated);
  assert.notEqual(updated.id, cited.id);
  assert.ok(result.searchLog.some(row => row.phase === 'follow-up' && row.evidenceIds?.includes(updated.id)));
});

test('library mode performs no web calls and cannot assert a contribution gap', async () => {
  const fake = provider();
  const result = await runResearch(job('library'), { env: { ...env, TAVILY_API_KEY: undefined }, fetchImpl: fake.fetchImpl });
  assert.equal(result.outcome, 'insufficient_evidence'); assert.equal(fake.calls.filter(call => call.url.endsWith('/search')).length, 0);
  assert.match(result.limitations.join(' '), /external prior art was not checked/);
});

test('budget includes prior reservations after crash and stops before model request', async () => {
  const fake = provider(); const current = { ...job(), spent_usd: 0.9999 };
  await assert.rejects(runResearch(current, { env, fetchImpl: fake.fetchImpl }), ResearchBudgetExceeded);
  assert.equal(fake.calls.length, 1);
});

test('selected manual links are extracted before planning, while library data remains authoritative', async () => {
  const fake = provider();
  const current = { ...job(), sources: [{ url: 'https://example.org/paper', title: 'Paper' }] };
  const result = await runResearch(current, { env, fetchImpl: fake.fetchImpl });
  assert.equal(result.evidence[0].provenance, 'web');
  assert.match(result.evidence[0].excerpt, /Fuller source text/);
  assert.ok(fake.calls.findIndex(call => call.url.endsWith('/extract')) < fake.calls.findIndex(call => call.url.endsWith('/completions')));
  const upgraded = collectEvidence([{ url: current.sources[0].url, excerpt: 'from library', provenance: 'library' }], collectEvidence([{ ...current.sources[0], excerpt: 'unverified' }]));
  assert.equal(upgraded[0].provenance, 'provided'); assert.equal(upgraded[1].provenance, 'library'); assert.equal(upgraded[1].id, 'E2');
});

test('a retry preserves evidence and the original extraction without paying to fetch it again', async () => {
  const fake = provider();
  const priorEvidence = collectEvidence([{ url: 'https://example.org/paper', title: 'Paper', excerpt: 'Previously extracted text.', provenance: 'web', coverage: 'page_text' }]);
  const current = { ...job(), spent_usd: 0.032778, result: { evidence: priorEvidence, searchLog: [{ source: 'selected sources', requested: 1, readable: 1 }] } };
  const result = await runResearch(current, { env, fetchImpl: fake.fetchImpl });
  assert.equal(fake.calls.some(call => call.url.endsWith('/extract')), false);
  assert.equal(result.evidence[0].excerpt, 'Previously extracted text.');
  assert.ok(result.reservedUsd > current.spent_usd);
  assert.equal(result.searchLog.filter(row => row.source === 'selected sources').length, 1);
});

test('a retry resumes a completed outline without repeating model planning or searches', async () => {
  const initial = provider();
  let checkpoint;
  await runResearch(job(), { env, fetchImpl: initial.fetchImpl, checkpoint: async (message, state) => {
    if (message === 'Drafting an evidence-linked contribution brief') checkpoint = structuredClone(state);
  } });
  const resumed = provider({ startPhase: 3 });
  const result = await runResearch({ ...job(), result: checkpoint, spent_usd: 0.3 }, { env, fetchImpl: resumed.fetchImpl });
  assert.equal(resumed.calls.filter(call => call.url.endsWith('/completions')).length, 1);
  assert.equal(resumed.calls.some(call => call.url.endsWith('/search') || call.url.endsWith('/extract')), false);
  assert.equal(result.outcome, 'candidate');
  assert.deepEqual(result.outline, checkpoint.outline);
});

test('diagnostic messages distinguish provider failures without revealing unsafe error content', () => {
  assert.match(researchFailureMessage(new Error('Research model request failed (429)')), /model provider returned HTTP 429/);
  assert.match(researchFailureMessage(new Error('Invalid research perspective plan')), /perspective plan/);
  assert.match(researchFailureMessage(new Error('Invalid research perspective plan: array count 2; expected 3')), /count 2; expected 3/);
  assert.match(researchFailureMessage(new Error('Research model returned invalid JSON')), /invalid JSON/);
  assert.doesNotMatch(researchFailureMessage(new Error('credential=secret private source')), /secret|private source/);
});

test('failed persisted reservation prevents a paid provider call', async () => {
  const fake = provider();
  await assert.rejects(runResearch(job(), { env, fetchImpl: fake.fetchImpl, reserve: async () => false }), ResearchBudgetExceeded);
  assert.equal(fake.calls.length, 1);
});

test('unknown model token pricing cannot be treated as free', async () => {
  let calls = 0;
  await assert.rejects(runResearch(job('library'), { env, fetchImpl: async () => {
    calls++;
    return json({ data: [{ id: 'test/model', context_length: 200000, pricing: { prompt: null, completion: '0' } }] });
  } }), /pricing/);
  assert.equal(calls, 1);
});

test('model reservations use the highest advertised time-dependent token rates', async () => {
  const base = provider(); const peak = provider({ overrides: [{ prompt: '0.000002', completion: '0.000003' }] });
  const normal = await runResearch(job('library'), { env, fetchImpl: base.fetchImpl });
  const conservative = await runResearch(job('library'), { env, fetchImpl: peak.fetchImpl });
  assert.ok(conservative.reservedUsd > normal.reservedUsd * 2);
  const request = peak.calls.find(call => call.url.endsWith('/completions'));
  assert.deepEqual(request.body.provider.max_price, { prompt: 2, completion: 3 });
});

test('research uses supported reasoning levels for planning and synthesis', async () => {
  const fake = provider({ reasoning: { supported_efforts: ['high', 'low', 'none'] } });
  await runResearch(job('library'), { env, fetchImpl: fake.fetchImpl });
  const calls = fake.calls.filter(call => call.url.endsWith('/completions'));
  assert.deepEqual(calls.map(call => call.body.reasoning), [{ effort: 'low', exclude: true }, { effort: 'high', exclude: true }, { effort: 'low', exclude: true }, { effort: 'high', exclude: true }]);
  assert.ok(calls[0].body.max_tokens >= 3000 && calls[3].body.max_tokens >= 12000);
});

test('cancelled job makes no network call', async () => {
  const fake = provider();
  await assert.rejects(runResearch(job(), { env, fetchImpl: fake.fetchImpl, isActive: async () => false }), ResearchCancelled);
  assert.equal(fake.calls.length, 0);
});

test('no readable evidence produces honest insufficient-evidence result without synthesis', async () => {
  const fake = provider(); const current = { ...job('library'), sources: [] };
  const result = await runResearch(current, { env, fetchImpl: fake.fetchImpl });
  assert.equal(result.outcome, 'insufficient_evidence'); assert.deepEqual(result.evidence, []);
  assert.equal(fake.calls.filter(call => call.url.endsWith('/completions')).length, 1);
});

test('worker uses lease-safe completion and leaves cancellation unchanged', async () => {
  const calls = [];
  const store = { claim: async () => job(), active: async () => true, reserve: async () => true, checkpoint: async () => {}, searchLibrary: async () => [], finish: async () => calls.push('finish'), fail: async () => calls.push('fail') };
  assert.equal(await processNextResearch(store, { engine: async () => ({ outcome: 'candidate' }) }), true);
  assert.deepEqual(calls, ['finish']); calls.length = 0;
  await processNextResearch(store, { engine: async () => { throw new ResearchCancelled(); } }); assert.deepEqual(calls, []);
  await processNextResearch(store, { engine: async () => { throw new Error('upstream'); } }); assert.deepEqual(calls, ['fail']);
});

test('store claims atomically, bounds recovery, and guards cost and completion by lease', async () => {
  const queries = [];
  const sql = async (parts, ...values) => { queries.push({ text: parts.join('?'), values }); return [{ id: 'job', lease_token: 'lease' }]; };
  const store = createResearchStore(sql); const current = await store.claim();
  assert.match(queries[0].text, /attempts >= 2/); assert.match(queries[1].text, /FOR UPDATE SKIP LOCKED/);
  await store.reserve(current, .02); assert.match(queries[2].text, /spent_usd \+ \? <=/); assert.match(queries[2].text, /lease_token =/);
  await store.finish(current, {}); assert.match(queries[3].text, /status = 'running'/); assert.match(queries[3].text, /lease_expires_at > now/);
});
