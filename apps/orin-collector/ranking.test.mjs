import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeItem, paperIdentity } from './core.mjs';
import { classificationRequest, freshCandidates, rankItems, selectClassified, validateClassifications } from './ranking.mjs';
const now = new Date('2026-10-25T12:00:00Z');
const config = { topics: ['GPU'], maxAgeHours: 72, maxItems: 10, maxRunUsd: 0.05 };
const item = (id, title = 'GPU research', source = 'arxiv') => normalizeItem({ url: source === 'arxiv' ? `https://arxiv.org/abs/2610.${String(id).padStart(5,'0')}` : `https://huggingface.co/papers/2610.${String(id).padStart(5,'0')}`, title, excerpt: 'Useful research.', publishedAt: now.toISOString() }, source, now);
const classification = (item, score = 80, track = 'Inference') => ({ id: item.id, score, tracks: [track], reason: 'Directly addresses efficient serving.' });
const catalog = { data: [{ id: 'xiaomi/mimo-v2.6-flash', context_length: 1000000, supported_parameters: ['structured_outputs', 'response_format'], pricing: { prompt: '0.0000001', completion: '0.0000004' } }] };

test('paper identity unifies platforms/versions but never unrelated publisher links', () => {
  const urls = ['https://arxiv.org/abs/2610.12345v2', 'https://arxiv.org/pdf/2610.12345v1.pdf', 'https://huggingface.co/papers/2610.12345', 'https://www.alphaxiv.org/abs/2610.12345v3'];
  for (const url of urls) assert.equal(paperIdentity(url), 'arxiv:2610.12345');
  assert.equal(paperIdentity('https://evil.test/abs/2610.12345'), 'https://evil.test/abs/2610.12345');
});

test('candidate collection removes cross-platform repeats/stale/seen papers and includes zero-keyword research', () => {
  const one = item(1), two = item(1, 'Same paper', 'huggingface'), novel = item(2, 'Low precision matrix arithmetic');
  const old = { ...item(3), publishedAt: '2026-01-01' };
  assert.equal(freshCandidates([one,two,novel,old],config,{},'2026-10-25',now).length,2);
  assert.deepEqual(freshCandidates([one,two,novel],config,{'arxiv:2610.00001':'2026-10-24'},'2026-10-25',now).map(i=>i.id), [novel.id]);
});

test('LLM can select a semantically relevant paper with zero keyword matches; feedback is explicit and bounded', async () => {
  const novel = item(1, 'Low precision matrix arithmetic');
  let calls = 0;
  const result = await rankItems([novel],config,{ apiKey:'test',date:'2026-10-25',now,examples:[{feedback:1,title:'Low precision',excerpt:'Useful'}, {saved:true,title:'Do not infer',excerpt:'Implicit'}], fetchImpl:async (url,options) => {
    calls++;
    if (url.endsWith('/models')) return new Response(JSON.stringify(catalog));
    const body=JSON.parse(options.body), input=JSON.parse(body.messages[1].content);
    assert.equal(body.response_format.type,'json_schema');
    assert.equal(body.provider.require_parameters,true);
    assert.equal(input.feedback.length,1);
    assert.equal(input.candidates.length,1);
    assert.equal(body.reasoning.enabled,false);
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({items:[{...classification(novel,92,'Quantization'),id:input.candidates[0].id}]})}}]}));
  }});
  assert.equal(calls,2);
  assert.equal(result.items[0].ranking.score,92);
  assert.equal(result.status.method,'llm');
  assert.ok(result.reservedUsd>0 && result.reservedUsd<config.maxRunUsd*.4);
});

test('classifier rejects fabricated/duplicate/missing IDs, scores, tracks and long reasons', () => {
  const a=item(1),b=item(2), valid=classification(a);
  for (const rows of [[],[valid,valid],[{...valid,id:'made-up'}],[{...valid,score:101}],[{...valid,tracks:['Fake']}],[{...valid,reason:'x'.repeat(241)}]]) assert.throws(()=>validateClassifications({items:rows},[a]));
  assert.throws(()=>validateClassifications({items:[valid,valid]},[a,b]));
});

test('fallback after a failed metered response retains the budget reservation and never retries', async () => {
  let calls=0;
  const result=await rankItems([item(1)],config,{apiKey:'test',date:'2026-10-25',now,fetchImpl:async url=>{
    calls++;
    return url.endsWith('/models') ? new Response(JSON.stringify(catalog)) : new Response('limited',{status:429});
  }});
  assert.equal(calls,2);
  assert.equal(result.status.method,'keyword');
  assert.ok(result.reservedUsd>0);
  assert.equal(result.items.length,1);
});

test('missing key and impossible budget send no metered requests', async () => {
  const noKey=await rankItems([item(1)],config,{date:'2026-10-25',now,fetchImpl:()=>{throw new Error('must not fetch');}});
  assert.equal(noKey.status.method,'keyword');
  let calls=0;
  const budget=await rankItems([item(1)],{...config,maxRunUsd:0.0000001},{apiKey:'test',date:'2026-10-25',now,fetchImpl:async url=>{calls++;assert.ok(url.endsWith('/models'));return new Response(JSON.stringify(catalog));}});
  assert.equal(calls,1);
  assert.equal(budget.reservedUsd,0);
});

test('source quota and discovery slots survive semantic ranking', () => {
  const candidates=Array.from({length:25},(_,i)=>item(i));
  candidates.push(item(30,'Adjacent finding','huggingface'));
  const rows=candidates.map(i=>classification(i,i.source==='huggingface'?42:95,i.source==='huggingface'?'AI hardware':'Inference'));
  const result=selectClassified(candidates,rows,{...config,maxItems:20},{discoveryFraction:.15});
  assert.equal(result.filter(i=>i.source==='arxiv').length,10);
  const discovery=result.find(i=>i.source==='huggingface');
  assert.equal(discovery.ranking.discovery,true);
});


test('bounded schema uses short IDs and restores only validated canonical identities', () => {
  const paper=item(1);
  const request=classificationRequest([paper],config);
  const input=JSON.parse(request.messages[1].content);
  assert.equal(input.candidates[0].id,'p0');
  assert.deepEqual(request.responseFormat.json_schema.schema.properties.items.items.properties.id.enum,['p0']);
  assert.equal(request.decode({items:[{...classification(paper),id:'p0',reason:'x'.repeat(300)}]})[0].reason.length,240);
  assert.equal(request.decode({items:[{...classification(paper),id:'p0'}]})[0].id,paper.id);
  assert.throws(()=>request.decode({items:[{...classification(paper),id:'p1'}]}));
});

const primary = 'xiaomi/mimo-v2.6-flash';
const secondary = 'deepseek/deepseek-v4.1-flash-1017';
const tertiary = 'google/gemini-2.5-flash-lite';
const fallbackCatalog = { data: [primary, secondary, tertiary].map(id => ({ ...catalog.data[0], id })) };
function successfulBatch(body, score = 80) {
  const input = JSON.parse(body.messages[1].content);
  const items = input.candidates.map(row => ({ id: row.id, score, tracks: ['Inference'], reason: 'Useful inference research.' }));
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items }) } }] }));
}

test('MiMo rate limit switches once to DeepSeek and reserves both attempts within one budget', async () => {
  const calls = [];
  const result = await rankItems([item(1)], config, { apiKey: 'test', date: '2026-10-25', now, fetchImpl: async (url, options) => {
    if (url.endsWith('/models')) return new Response(JSON.stringify(fallbackCatalog));
    const body = JSON.parse(options.body); calls.push(body.model);
    return body.model === primary ? new Response('', { status: 429 }) : successfulBatch(body);
  } });
  assert.deepEqual(calls, [primary, secondary]);
  assert.equal(result.status.model, secondary);
  assert.match(result.status.message, /fallback/);
  assert.ok(result.reservedUsd <= config.maxRunUsd * .4);
  assert.deepEqual(result.attempts.map(row => row.status), ['unavailable', 'ok']);
});

test('unlisted primary and incompatible secondary reach Gemini without metered requests to them', async () => {
  const calls = [];
  const available = { data: [{ ...catalog.data[0], id: secondary, reasoning: { mandatory: true } }, { ...catalog.data[0], id: tertiary }] };
  const result = await rankItems([item(1)], config, { apiKey: 'test', date: '2026-10-25', now, fetchImpl: async (url, options) => {
    if (url.endsWith('/models')) return new Response(JSON.stringify(available));
    const body = JSON.parse(options.body); calls.push(body.model); return successfulBatch(body);
  } });
  assert.deepEqual(calls, [tertiary]);
  assert.equal(result.status.model, tertiary);
});

test('failure after a successful primary batch discards its scores before a complete fallback plan', async () => {
  const calls = [];
  const papers = Array.from({ length: 35 }, (_, i) => item(i));
  let primaryCalls = 0;
  const result = await rankItems(papers, config, { apiKey: 'test', date: '2026-10-25', now, fetchImpl: async (url, options) => {
    if (url.endsWith('/models')) return new Response(JSON.stringify(fallbackCatalog));
    const body = JSON.parse(options.body); calls.push(body.model);
    if (body.model === primary && ++primaryCalls === 2) return new Response('{"choices":[]}');
    return successfulBatch(body, body.model === primary ? 99 : 70);
  } });
  assert.deepEqual(calls, [primary, primary, secondary, secondary]);
  assert.equal(result.status.model, secondary);
  assert.equal(result.status.classified, 35);
  assert.ok(result.items.every(row => row.ranking.score === 70), 'never combine differently calibrated model scores');
  assert.ok(result.reservedUsd <= config.maxRunUsd * .4);
});

test('failed paid primary can exhaust the remaining budget without triggering another paid request', async () => {
  const shared = { apiKey: 'test', date: '2026-10-25', now };
  const first = await rankItems([item(1)], config, { ...shared, fetchImpl: async (url, options) => url.endsWith('/models') ? new Response(JSON.stringify(fallbackCatalog)) : successfulBatch(JSON.parse(options.body)) });
  const limited = { ...config, maxRunUsd: first.reservedUsd * 1.5 / .4 };
  let calls = 0;
  const result = await rankItems([item(1)], limited, { ...shared, fetchImpl: async url => {
    if (url.endsWith('/models')) return new Response(JSON.stringify(fallbackCatalog));
    calls++; return new Response('', { status: 503 });
  } });
  assert.equal(calls, 1);
  assert.equal(result.status.method, 'keyword');
  assert.equal(result.reservedUsd, first.reservedUsd);
  assert.ok(result.reservedUsd <= limited.maxRunUsd * .4);
});

test('all unavailable models fall back to keywords with no retry loops', async () => {
  const calls = [];
  const result = await rankItems([item(1)], config, { apiKey: 'test', date: '2026-10-25', now, fetchImpl: async (url, options) => {
    if (url.endsWith('/models')) return new Response(JSON.stringify(fallbackCatalog));
    calls.push(JSON.parse(options.body).model); return new Response('', { status: 503 });
  } });
  assert.deepEqual(calls, [primary, secondary, tertiary]);
  assert.equal(result.status.method, 'keyword');
  assert.equal(result.items.length, 1);
});

test('invalid account credentials stop model failover immediately', async () => {
  let calls = 0;
  const result = await rankItems([item(1)], config, { apiKey: 'test', date: '2026-10-25', now, fetchImpl: async url => {
    if (url.endsWith('/models')) return new Response(JSON.stringify(fallbackCatalog));
    calls++; return new Response('', { status: 401 });
  } });
  assert.equal(calls, 1);
  assert.equal(result.status.method, 'keyword');
});
