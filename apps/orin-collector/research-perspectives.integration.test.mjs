import test from 'node:test';
import assert from 'node:assert/strict';
import { runResearch, ResearchBudgetExceeded, ResearchCancelled } from './research-engine.mjs';

const json = value => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
const env = { OPENROUTER_API_KEY: 'fake-key', ORIN_RESEARCH_MODEL: 'test/model', TAVILY_API_KEY: 'fake-search' };
const report = {
  outcome: 'candidate', title: 'Investigate measured portability', summary: 'A question for further study.',
  opportunity: 'Evaluate the workload under the same conditions.', amdBenefit: 'Potential transfer requires validation.',
  existingWork: 'The retrieved study is a starting point.', counterevidence: 'Other conditions remain untested.',
  limitations: ['Evidence is incomplete.'], nextQuestions: ['What happens on the target GPU?'],
  claims: [{ statement: 'The study reports a performance observation.', evidenceIds: ['E1'], kind: 'source_claim' }],
  experiment: { action: 'Reproduce the test', baseline: 'Reported baseline', metrics: 'Latency', requirements: 'Target hardware', stopCondition: 'Existing implementation already answers it' }
};

function mockProvider({ resultUrls = ['https://example.net/prior-work'], badOutlineId = false } = {}) {
  const calls = [];
  let completion = 0;
  const response = [
    { perspectives: [
      { id: 'P1', name: 'Prior art', question: 'What already exists?', initialQuery: 'existing implementation' },
      { id: 'P2', name: 'AMD feasibility', question: 'Does it transfer?', initialQuery: 'AMD applicability' }
    ] },
    { perspectives: [
      { id: 'P1', answer: 'The source reports an implementation.', status: 'grounded', evidenceIds: ['E1'], followUpQuestion: 'What are its limits?', followUpQuery: 'implementation limitations' },
      { id: 'P2', answer: 'AMD applicability is unclear.', status: 'insufficient_evidence', evidenceIds: [], followUpQuestion: 'Which architectures were tested?', followUpQuery: 'architecture support' }
    ] },
    { perspectives: [
      { id: 'P1', followUpAnswer: 'Further evidence needs review.', followUpStatus: 'grounded', followUpEvidenceIds: ['E1'] },
      { id: 'P2', followUpAnswer: 'Hardware coverage remains uncertain.', followUpStatus: 'insufficient_evidence', followUpEvidenceIds: [] }
    ], outline: [{ title: 'Evidence and limitations', purpose: 'Assess the source', evidenceIds: [badOutlineId ? 'E999' : 'E1'], subsections: [{ title: 'Existing work', purpose: 'Check prior work', evidenceIds: ['E1'] }] }] },
    report
  ];
  const fetchImpl = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, body });
    if (url.endsWith('/models')) return json({ data: [{ id: 'test/model', context_length: 500000, pricing: { prompt: '0.000001', completion: '0.000001' }, reasoning: { supported_efforts: ['low', 'high'] } }] });
    if (url.endsWith('/search')) return json({ results: resultUrls.map(url => ({ url, title: 'Independent source', content: 'Reports an implementation and its limits.' })) });
    if (url.endsWith('/extract')) return json({ results: [], failed_results: [] });
    if (url.endsWith('/completions')) return json({ choices: [{ message: { content: JSON.stringify(response[completion++]) } }] });
    throw new Error(`Unexpected endpoint ${url}`);
  };
  return { calls, fetchImpl };
}

const job = scope => ({ id: 'job', question: 'Could this improve AMD inference?', prompt: 'Look for prior work', sources: [], profile: { interests: ['Inference'] }, options: { model: 'test/model', scope, maxUsd: 2, depth: 'standard', perspectives: [], batchPrompt: '' } });

test('perspective-guided research makes evidence-guided follow-up calls and retains a cited outline', async () => {
  const provider = mockProvider(); const checkpoints = [];
  const result = await runResearch(job('web'), { env, fetchImpl: provider.fetchImpl, checkpoint: async (...args) => checkpoints.push(args), searchLibrary: async () => [] });
  assert.equal(result.outcome, 'candidate');
  assert.ok(Array.isArray(result.perspectives) && result.perspectives.length >= 2);
  assert.ok(Array.isArray(result.outline) && result.outline.length);
  assert.ok(result.outline[0].evidenceIds.includes('E1'));
  const searches = provider.calls.filter(call => call.url.endsWith('/search')).map(call => call.body.query);
  assert.ok(searches.includes('implementation limitations'), 'follow-up search should come from the first evidence assessment');
  assert.ok(checkpoints.some(([, partial]) => partial.perspectives?.length), 'perspective progress must survive interruption');
  const completions = provider.calls.filter(call => call.url.endsWith('/completions'));
  assert.ok(completions.length >= 4, 'planning, assessment, outline and synthesis are distinct stages');
  assert.ok(provider.calls.every(call => ['https://openrouter.ai/api/v1/models', 'https://openrouter.ai/api/v1/chat/completions', 'https://api.tavily.com/search', 'https://api.tavily.com/extract'].includes(call.url)), 'the worker uses only fixed provider endpoints');
});

test('an initial seed alone cannot establish a candidate without an independent web result', async () => {
  const provider = mockProvider({ resultUrls: [] });
  const current = { ...job('web'), sources: [{ url: 'https://example.org/seed', title: 'Seed', excerpt: 'The source reports a performance observation.' }] };
  const result = await runResearch(current, { env, fetchImpl: provider.fetchImpl, searchLibrary: async () => [] });
  assert.equal(result.outcome, 'insufficient_evidence');
});

test('a web search hit that duplicates a library URL does not mislabel the retained excerpt', async () => {
  const provider = mockProvider();
  const result = await runResearch(job('web'), { env, fetchImpl: provider.fetchImpl, searchLibrary: async () => [
    { url: 'https://example.net/prior-work', title: 'Library text', excerpt: 'Original library excerpt.', provenance: 'library' }
  ] });
  const hit = result.evidence.find(row => row.url === 'https://example.net/prior-work');
  assert.ok(hit);
  if (hit.provenance === 'web') assert.match(hit.excerpt, /Reports an implementation/);
  else assert.equal(result.outcome, 'insufficient_evidence', 'a library excerpt must not be presented as independently retrieved web text');
});

test('fabricated evidence references in an outline fail instead of becoming a completed brief', async () => {
  const provider = mockProvider({ badOutlineId: true });
  await assert.rejects(runResearch(job('web'), { env, fetchImpl: provider.fetchImpl, searchLibrary: async () => [] }), /evidence|citation/i);
});

test('cancellation during perspective investigation prevents subsequent paid calls', async () => {
  const provider = mockProvider(); let stopped = false; let paidAfterCancellation = 0;
  await assert.rejects(runResearch(job('web'), {
    env,
    fetchImpl: async (...args) => { if (stopped) paidAfterCancellation++; return provider.fetchImpl(...args); },
    isActive: async () => !stopped,
    searchLibrary: async () => { stopped = true; return []; }
  }), ResearchCancelled);
  assert.equal(paidAfterCancellation, 0);
});

test('insufficient budget keeps checkpoints and never reaches a paid request that exceeds the cap', async () => {
  const provider = mockProvider(); let reserved = 0; const checkpoints = [];
  const current = job('web'); current.options.maxUsd = 0.01;
  await assert.rejects(runResearch(current, {
    env, fetchImpl: provider.fetchImpl, searchLibrary: async () => [],
    checkpoint: async (...args) => checkpoints.push(args),
    reserve: async amount => { reserved += amount; return true; }
  }), ResearchBudgetExceeded);
  assert.ok(reserved <= current.options.maxUsd);
  assert.ok(checkpoints.length, 'partial work must be retained');
  assert.ok(provider.calls.every(call => !call.url.endsWith('/search')), 'the unreserved web request was not made');
});
