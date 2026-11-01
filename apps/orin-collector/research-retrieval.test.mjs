import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearchRetriever, researchConstraints, EMBEDDING_DIMENSIONS } from './research-retrieval.mjs';
import { ResearchBudgetExceeded, ResearchCancelled } from './research-engine.mjs';

const query = 'AMD MI325X vLLM v0.14.1 on ROCm 7.10';
const env = { ORIN_RESEARCH_HYBRID_ENABLED:'true', OPENROUTER_API_KEY:'secret' };
function fakeSql({ available = true, populated = true, hybridFail = false } = {}) {
  const calls = [];
  const sql = async (parts, ...values) => {
    const text = parts.join('?'); calls.push({ text, values });
    if (text.includes('to_regclass')) return [{ available }];
    if (text.includes('SELECT EXISTS')) return [{ present:populated }];
    if (text.includes('WITH lexical AS')) { if (hybridFail) throw new Error('private database details'); return [{ id:'hybrid',item:{ title:'hybrid' } }]; }
    return [{ id:'keyword',item:{ title:'keyword' } }];
  };
  return { sql,calls };
}
const goodEmbedding = async (_url, options) => {
  const body=JSON.parse(options.body);
  assert.deepEqual(body.provider.max_price,{prompt:1});
  return new Response(JSON.stringify({ data:[{index:0, embedding:Array(EMBEDDING_DIMENSIONS).fill(0.01)}] }));
};
test('extracts only explicit GPU names and versioned products, preserving boundaries and versions', () => {
  const c=researchConstraints(query);
  assert.deepEqual(c.map(x=>x.label),['mi325x','vllm 0.14.1','rocm 7.10']);
  assert.ok(c.find(x=>x.label==='rocm 7.10').pattern.includes('7\\.10'));
  assert.deepEqual(researchConstraints('train 70B models in 2026 with GPU'), []);
  assert.deepEqual(researchConstraints('MI300 MI300 MI300X').map(x=>x.label), ['mi300','mi300x']);
  assert.deepEqual(researchConstraints('ROCm 7.10 preview').map(x=>x.label), ['rocm 7.10-preview']);
});
test('hybrid retrieval reserves before the provider call and applies filters to both branches', async () => {
  const {sql,calls}=fakeSql();let reserved=false;
  const retrieve=createResearchRetriever(sql,{env,fetchImpl:async (...args)=>{assert.equal(reserved,true);return goodEmbedding(...args);}});
  const result=await retrieve(query,{reserve:async amount=>{assert.equal(amount,0.01);reserved=true;}});
  assert.equal(result.method,'hybrid');assert.equal(result.items[0].itemId,'hybrid');
  assert.deepEqual(result.constraints,['mi325x','vllm 0.14.1','rocm 7.10']);
  const queryCall=calls.find(x=>x.text.includes('WITH lexical AS'));
  assert.equal((queryCall.text.match(/NOT EXISTS/g)||[]).length,2);
  assert.match(queryCall.text,/content_hash=md5/);
});
test('unavailable index, model error and budget exhaustion fall back without removing constraints', async () => {
  for (const state of ['absent','empty','provider','budget','sql']) {
    const {sql,calls}=fakeSql({available:state!=='absent',populated:state!=='empty',hybridFail:state==='sql'});
    let modelCalls=0;
    const retrieve=createResearchRetriever(sql,{env,fetchImpl:async (...args)=>{modelCalls++;if(state==='provider')throw new Error('secret');return goodEmbedding(...args);}});
    const result=await retrieve(query,{reserve:async()=>{if(state==='budget')throw new ResearchBudgetExceeded();}});
    assert.equal(result.method,'keyword');assert.equal(result.items[0].itemId,'keyword');
    assert.deepEqual(result.constraints,['mi325x','vllm 0.14.1','rocm 7.10']);
    if (['absent','empty','budget'].includes(state)) assert.equal(modelCalls,0);
    assert.ok(calls.at(-1).values.some(value=>Array.isArray(value)&&value.length===3));
  }
});
test('disabled retrieval avoids embedding and cancellation does not fall back', async () => {
  const a=fakeSql();let called=false;
  const result=await createResearchRetriever(a.sql,{env:{},fetchImpl:async()=>{called=true;}})(query);
  assert.equal(result.reason,'disabled');assert.equal(called,false);
  const b=fakeSql();
  await assert.rejects(createResearchRetriever(b.sql,{env,fetchImpl:goodEmbedding})(query,{reserve:async()=>{throw new ResearchCancelled();}}), ResearchCancelled);
});
