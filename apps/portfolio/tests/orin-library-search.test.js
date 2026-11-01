import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { createSearchHandler } from '../../../api/orin/search.js';
import { searchView, validateViewSearch } from '../server/orin-library-search.js';
import { createSuggestionSignals } from '../server/orin-suggestion-signals.js';
import { loadSemanticAffinities } from '../server/orin-semantic-affinity.js';
import { recommendInvestigations } from '../server/orin-research-recommendations.js';

const id='a'.repeat(64), second='b'.repeat(64);
const row=(value=id)=>({id:value,item:{id:value,title:'GPU paper',excerpt:'Some GPU evidence',url:'https://example.org/paper'},is_read:false,saved:false});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.statusCode=s;return this;},json(b){this.body=b;return this;}});
function fakeSql({index=true,vector=true}={}) {
  const calls=[];
  const sql=async(strings,...values)=>{const q=strings.join('?');calls.push({q,values});
    if(q.includes('to_regclass'))return [{present:index}];
    if(q.includes('SELECT EXISTS'))return [{present:vector}];
    return [row()];
  };return {sql,calls};
}
const embedding=async(_url,options)=>{const body=JSON.parse(options.body);assert.equal(body.input.length,1);assert.deepEqual(body.provider.max_price,{prompt:1});return new Response(JSON.stringify({data:[{index:0,embedding:Array(1536).fill(0.01)}]}));};

test('search scope is bounded and only accepts canonical IDs',()=>{
  assert.equal(validateViewSearch({query:' GPU '}).ids,null);
  assert.deepEqual(validateViewSearch({query:'GPU',ids:[id,id]}).ids,[id]);
  for(const body of [{query:'a'},{query:'x'.repeat(201)},{query:'GPU',ids:['bad']},{query:'GPU',ids:Array(501).fill(id)}]) assert.throws(()=>validateViewSearch(body),/Search|scope/);
});
test('authenticated search uses hybrid vectors, preserves view scope, and returns current item state',async()=>{
  const {sql,calls}=fakeSql();
  const result=await searchView(sql,{query:'GPU portability',ids:[id]},{env:{OPENROUTER_API_KEY:'key'},fetchImpl:embedding});
  assert.equal(result.method,'hybrid');assert.equal(result.items[0].id,id);assert.equal(result.items[0].saved,false);
  const q=calls.at(-1);assert.match(q.q,/content_hash=md5/);assert.ok(q.values.some(value=>Array.isArray(value)&&value[0]===id));
});
test('search falls back to keywords when vectors or provider are unavailable',async()=>{
  for(const state of ['index','provider','credential']) {
    const {sql}=fakeSql({index:state!=='index'});
    const result=await searchView(sql,{query:'GPU',ids:null},{env:state==='credential'?{}:{OPENROUTER_API_KEY:'key'},fetchImpl:async()=>{throw Error('private provider detail');}});
    assert.equal(result.method,'keyword');assert.equal(result.items[0].id,id);
  }
});
test('owner authorization happens before search and malformed requests never reach storage',async()=>{
  const denied=response();await handler({method:'POST',headers:{},body:{query:'GPU'}},denied);assert.equal(denied.statusCode,401);
  let touched=false;const api=createSearchHandler({authorize:async()=>{},getSql:async()=>{touched=true;}});
  const bad=response();await api({method:'POST',body:{query:'x'}},bad);assert.equal(bad.statusCode,400);assert.equal(touched,false);
});
test('recommendation signals only use explicit positive feedback and ignore stale vectors',async()=>{
  let query='';const sql=async(strings)=>{query=strings.join('?');return [{id,similarity:0.8},{id:second,similarity:0.2}];};
  const map=await loadSemanticAffinities(sql,[id,second]);assert.equal(map.get(id),0.8);assert.equal(map.has(second),false);
  assert.match(query,/feedback'='1'/);assert.match(query,/content_hash=md5/);assert.match(query,/c.id<>l.id/);
  assert.equal((await loadSemanticAffinities(async()=>{throw Error('no index');},[id])).size,0);
});
test('semantic suggestions reload live records and never add deleted or disliked results',async()=>{
  let lookups=0;
  const sql=async()=>{lookups++;return [{id,item:{title:'GPU kernel',excerpt:'A kernel limitation',url:'https://example.org/paper'},saved:false}];};
  const search=async()=>({method:'hybrid',items:[{id}],semanticIds:[id]});
  const load=createSuggestionSignals({search,affinities:async()=>new Map(),now:()=>1});
  const result=await load(sql,{interests:['unique-semantic-evaluation-topic']},[],{OPENROUTER_API_KEY:'key'});
  assert.equal(lookups,1);assert.equal(result.items[0].id,id);assert.ok(result.signals[id]>0);
  const suggestions=recommendInvestigations([...result.items,{id:second,title:'GPU kernel',excerpt:'failure',url:'https://example.org/no',feedback:-1}],{interests:['GPU kernels']},[],result.signals);
  assert.ok(suggestions.some(s=>s.method==='heuristic+semantic'));
  assert.ok(suggestions.every(s=>s.sources.every(source=>source.url!=='https://example.org/no')));
});

test('library search renders an explicit submit and provider disclosure', async()=>{
  const React=(await import('react')).default;
  const {renderToStaticMarkup}=await import('react-dom/server');
  const {createServer}=await import('vite');
  const {fileURLToPath}=await import('node:url');
  const vite=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),configFile:false,optimizeDeps:{noDiscovery:true},server:{middlewareMode:true},appType:'custom'});
  try {
    const {default:Search}=await vite.ssrLoadModule('/src/components/orin/OrinLibrarySearch.jsx');
    const html=renderToStaticMarkup(React.createElement(Search,{onAddResearch:()=>{}}));
    assert.match(html,/Search your whole library/);assert.match(html,/embedding provider/);assert.match(html,/type="submit"/);
  } finally {await vite.close();}
});

test('keyword-only search bypasses embeddings even when the index and provider are available', async () => {
  assert.equal(validateViewSearch({query:'GPU',searchMode:'keyword'}).searchMode,'keyword');
  assert.throws(() => validateViewSearch({query:'GPU',searchMode:'other'}), /mode/);
  const {sql,calls}=fakeSql();
  let embedded=false;
  const result=await searchView(sql,{query:'GPU',ids:null,searchMode:'keyword'},{env:{OPENROUTER_API_KEY:'key'},fetchImpl:async()=>{embedded=true;throw Error('must not embed');}});
  assert.equal(result.method,'keyword');
  assert.equal(embedded,false);
  assert.equal(calls.length,1);
  assert.match(calls[0].q,/to_tsvector/);
});
