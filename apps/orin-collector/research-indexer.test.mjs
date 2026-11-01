import test from 'node:test';
import assert from 'node:assert/strict';
import { eligible, indexResearch } from './research-indexer.mjs';

const publicItem = { source:'arxiv',url:'https://arxiv.org/abs/1234.5678',title:'Public research',excerpt:'A sufficiently long public abstract for evaluation.' };
const amd = { ...publicItem,source:'rss',url:'https://rocm.blogs.amd.com/foo' };
const rows = items => items.map((item,i)=>({ id:`id-${i}`,item,content_hash:`hash-${i}` }));
function store(items) {
  const calls=[];
  const sql=async (parts,...values)=>{
    const text=parts.join('?');calls.push({text,values});
    if(text.includes('FROM orin_items i LEFT JOIN'))return rows(items);
    if(text.includes('DELETE FROM orin_research_embeddings'))return [];
    if(text.includes('INSERT INTO orin_research_embeddings')) return JSON.parse(values.find(value=>typeof value==='string' && value.startsWith('[{'))).map(row=>({item_id:row.item_id}));
    throw Error('Unexpected SQL');
  };
  return {sql,calls};
}
const fakeFetch = async (_url, init) => {
  const body=JSON.parse(init.body);
  assert.deepEqual(body.provider.max_price,{prompt:1});
  return new Response(JSON.stringify({data:body.input.map((_x,index)=>({index,embedding:Array(1536).fill(0.1)}))}));
};
test('all sources including user titles, shared items and title-only items are eligible',()=>{
  assert.equal(eligible(publicItem),true);assert.equal(eligible(amd),true);
  for(const item of [{...publicItem,titleSource:'user'},{...publicItem,source:'shared'}, {...publicItem,source:'linkedin'}, {...publicItem,excerpt:''}]) assert.equal(eligible(item),true);
  for(const item of [{...publicItem,deleted:true},{title:'  ',excerpt:''},null]) assert.equal(eligible(item),false);
});
test('dry run does not call provider or mutate vectors',async()=>{
  const {sql,calls}=store([publicItem]);
  const result=await indexResearch({sql,dryRun:true,fetchImpl:async()=>{throw Error('unexpected');},log:()=>{}});
  assert.equal(result.selected,1);assert.equal(calls.length,1);
});
test('indexer batches all active sources, bounds price and guards concurrent edits',async()=>{
  const {sql,calls}=store([publicItem,amd,{...publicItem,titleSource:'user'},{...publicItem,deleted:true}]);
  let sent=0;
  const result=await indexResearch({sql,apiKey:'x',fetchImpl:async(...args)=>{sent+=JSON.parse(args[1].body).input.length;return fakeFetch(...args);},log:()=>{}});
  assert.equal(sent,3);assert.equal(result.indexed,3);assert.ok(result.allowanceUsd>0 && result.allowanceUsd<0.8);
  assert.equal(calls.filter(c=>c.text.includes('INSERT INTO orin_research_embeddings')).length,1);
  assert.ok(calls.filter(c=>c.text.includes('INSERT INTO orin_research_embeddings')).every(c=>c.text.includes('md5(') && c.text.includes("deleted")));
});
test('embedding failure stops indexing rather than storing fabricated vectors',async()=>{
  const {sql,calls}=store([publicItem]);
  await assert.rejects(indexResearch({sql,apiKey:'x',fetchImpl:async()=>new Response('',{status:503}),log:()=>{}}));
  assert.equal(calls.some(c=>c.text.includes('INSERT INTO orin_research_embeddings')),false);
});
