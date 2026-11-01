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
    if(text.includes('INSERT INTO orin_research_embeddings'))return [{item_id:'x'}];
    throw Error('Unexpected SQL');
  };
  return {sql,calls};
}
const fakeFetch = async (_url, init) => {
  const body=JSON.parse(init.body);
  assert.deepEqual(body.provider.max_price,{prompt:1});
  return new Response(JSON.stringify({data:body.input.map((_x,index)=>({index,embedding:Array(1536).fill(0.1)}))}));
};
test('only approved public sources are eligible; user titles, private shares and lookalike hosts are excluded',()=>{
  assert.equal(eligible(publicItem),true);assert.equal(eligible(amd),true);
  for(const item of [{...publicItem,deleted:true},{...publicItem,titleSource:'user'},{...publicItem,source:'shared'},
    {...publicItem,url:'https://arxiv.org.evil.test/abs/x'}, {...amd,url:'https://rocm.blogs.amd.com.evil.test/foo'},
    {...publicItem,url:'http://arxiv.org/abs/x'}]) assert.equal(eligible(item),false);
});
test('dry run does not call provider or mutate vectors',async()=>{
  const {sql,calls}=store([publicItem]);
  const result=await indexResearch({sql,dryRun:true,fetchImpl:async()=>{throw Error('unexpected');},log:()=>{}});
  assert.equal(result.selected,1);assert.equal(calls.length,1);
});
test('indexer batches approved records, bounds price, guards concurrent edits and filters unsafe inputs',async()=>{
  const {sql,calls}=store([publicItem,amd,{...publicItem,titleSource:'user'}]);
  let sent=0;
  const result=await indexResearch({sql,apiKey:'x',fetchImpl:async(...args)=>{sent+=JSON.parse(args[1].body).input.length;return fakeFetch(...args);},log:()=>{}});
  assert.equal(sent,2);assert.equal(result.indexed,2);assert.ok(result.allowanceUsd>0 && result.allowanceUsd<0.8);
  assert.equal(calls.filter(c=>c.text.includes('INSERT INTO orin_research_embeddings')).length,2);
  assert.ok(calls.filter(c=>c.text.includes('INSERT INTO orin_research_embeddings')).every(c=>/content_hash|md5\(/.test(c.text) && c.text.includes("titleSource")));
});
test('embedding failure stops indexing rather than storing fabricated vectors',async()=>{
  const {sql,calls}=store([publicItem]);
  await assert.rejects(indexResearch({sql,apiKey:'x',fetchImpl:async()=>new Response('',{status:503}),log:()=>{}}));
  assert.equal(calls.some(c=>c.text.includes('INSERT INTO orin_research_embeddings')),false);
});
