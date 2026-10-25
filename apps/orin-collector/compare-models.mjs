#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { normalizeItem } from './core.mjs';
import { classificationRequest } from './ranking.mjs';
import { boundedText } from './sources.mjs';

const { values } = parseArgs({ options: { 'keychain-openrouter': {type:'boolean'}, 'plan-only':{type:'boolean'}, output:{type:'string',default:fileURLToPath(new URL('./benchmarks/comparison-2026-10-25.json',import.meta.url))} } });
const file = new URL('./benchmarks/research-2026-10-25.json',import.meta.url);
const source = await readFile(file,'utf8'), dataset=JSON.parse(source);
const models=['google/gemini-2.5-flash-lite','deepseek/deepseek-v4.1-flash-1017','xiaomi/mimo-v2.6-flash'];
const catalogResponse=await fetch('https://openrouter.ai/api/v1/models',{redirect:'error',signal:AbortSignal.timeout(30000)});
if(!catalogResponse.ok)throw new Error('Could not fetch model catalog');
const catalog=JSON.parse(await boundedText(catalogResponse,15_000_000));
const config={topics:['ROCm','GPU','kernel','LLM','inference','training','agent','transformer','distributed','CUDA','Triton','compiler','vLLM','SGLang','quantization','GPU memory','semiconductor']};
const candidates=dataset.papers.map(row=>normalizeItem(row,row.url.includes('huggingface.co')?'huggingface':'arxiv'));
const truth=new Map(candidates.map((item,i)=>[item.id,dataset.papers[i]]));
const byIndex=index=>candidates.find(item=>truth.get(item.id).exampleIndex===index);
const feedbackCandidates=[16,6,3,1,20,22,24,30,35,38].map(byIndex);
// Hypothetical preference scenario, not claimed to be actual user feedback.
const feedback=[{...byIndex(16),feedback:1},{...byIndex(6),feedback:-1}].map(({title,excerpt,feedback})=>({title,excerpt:excerpt.slice(0,240),feedback}));
const maxTokens=4096;
const plans=models.map(id=>{
 const model=catalog.data.find(m=>m.id===id);
 if(!model||model.reasoning?.mandatory||!['structured_outputs','response_format'].every(p=>model.supported_parameters?.includes(p)))throw new Error(`Unsupported model ${id}`);
 const rates={input:Number(model.pricing?.prompt),output:Number(model.pricing?.completion),request:Number(model.pricing?.request||0)};
 if(Object.values(rates).some(x=>!Number.isFinite(x)||x<0))throw new Error('Invalid catalog pricing');
 const requests=[];
 for(let i=0;i<candidates.length;i+=30)requests.push({arm:'baseline',batch:candidates.slice(i,i+30),...classificationRequest(candidates.slice(i,i+30),config,[])});
 requests.push({arm:'feedback',batch:feedbackCandidates,...classificationRequest(feedbackCandidates,config,feedback)});
 for(const r of requests){
  const bytes=Buffer.byteLength(JSON.stringify({messages:r.messages,response_format:r.responseFormat}));
  if(bytes+maxTokens>model.context_length)throw new Error('Context overflow');
  r.reservation=bytes*rates.input+maxTokens*rates.output+rates.request;
 }
 return {model:id,rates,requests};
});
const reservation=plans.reduce((sum,p)=>sum+p.requests.reduce((s,r)=>s+r.reservation,0),0);
if(reservation>0.10)throw new Error(`Comparison would exceed $0.10 conservative guard (${reservation.toFixed(4)})`);
console.log(JSON.stringify({models,realPapers:candidates.length,requests:plans.reduce((s,p)=>s+p.requests.length,0),conservativeReservationUsd:reservation,labels:'Provisional Codex labels, frozen before model requests'}));
if(values['plan-only'])process.exit(0);
let apiKey=process.env.OPENROUTER_API_KEY;
if(!apiKey&&values['keychain-openrouter']&&process.platform==='darwin'){
 const result=spawnSync('/usr/bin/security',['find-generic-password','-s','openrouter-api-key','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
 if(result.status===0)apiKey=result.stdout.trim();
}
if(!apiKey)throw new Error('No OpenRouter key; no metered calls sent');
const startedAt=new Date().toISOString();
const results=await Promise.all(plans.map(async plan=>{
 const requests=[];
 for(const request of plan.requests){
  const start=performance.now();
  const record={arm:request.arm,candidateIds:request.batch.map(r=>r.id),reservedUsd:request.reservation};
  try{
   const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','X-Title':'ORIN model comparison'},
    body:JSON.stringify({model:plan.model,messages:request.messages,temperature:0,max_tokens:maxTokens,reasoning:{enabled:false},response_format:request.responseFormat,provider:{require_parameters:true,sort:'price',max_price:{prompt:plan.rates.input*1e6,completion:plan.rates.output*1e6}}}),
   });
   record.httpStatus=response.status;
   if(!response.ok)throw new Error(`HTTP ${response.status}`);
   const payload=JSON.parse(await boundedText(response,1_000_000));
   record.provider=payload.provider;record.responseId=payload.id;record.servedModel=payload.model;record.usage=payload.usage;record.finishReason=payload.choices?.[0]?.finish_reason;
   record.rawOutput=JSON.parse(payload.choices?.[0]?.message?.content);
   record.classifications=request.decode(record.rawOutput);
   record.valid=true;
  }catch(error){record.valid=false;record.error=error.name==='TimeoutError'?'Request timeout':error.message.slice(0,160);}
  record.elapsedSeconds=(performance.now()-start)/1000;
  requests.push(record);
  console.log(`${plan.model} ${request.arm}: ${record.valid?'valid':'FAILED '+record.error} (${record.elapsedSeconds.toFixed(2)}s)`);
 }
 return {model:plan.model,rates:plan.rates,requests};
}));
function metrics(result){
 const base=result.requests.filter(r=>r.arm==='baseline'),valid=base.every(r=>r.valid),rows=base.flatMap(r=>r.classifications||[]);
 const scores=new Map(rows.map(r=>[r.id,r]));
 const reportedCost=base.every(r=>Number.isFinite(r.usage?.cost))?base.reduce((s,r)=>s+r.usage.cost,0):null;
 const m={validRequests:result.requests.filter(r=>r.valid).length,totalRequests:result.requests.length,baselineSeconds:base.reduce((s,r)=>s+r.elapsedSeconds,0),baselineReportedCostUsd:reportedCost,baselineUncachedEstimateUsd:base.every(r=>Number.isFinite(r.usage?.prompt_tokens)&&Number.isFinite(r.usage?.completion_tokens))?base.reduce((s,r)=>s+r.usage.prompt_tokens*result.rates.input+r.usage.completion_tokens*result.rates.output+result.rates.request,0):null,cachedPromptTokens:base.reduce((s,r)=>s+(r.usage?.prompt_tokens_details?.cached_tokens||0),0),qualityAvailable:valid};
 if(!valid)return m;
 let tp=0,fp=0,fn=0,correct=0,gradeMatches=0,trackCorrect=0,trackCount=0;
 for(const [id,ref]of truth){
  const score=scores.get(id).score, predicted=score>=50,positive=ref.referenceGrade>=2;
  if(predicted&&positive)tp++;if(predicted&&!positive)fp++;if(!predicted&&positive)fn++;
  if(predicted===positive)correct++;
  const grade=score>=80?3:score>=50?2:score>=35?1:0;
  if(grade===ref.referenceGrade)gradeMatches++;
  if(ref.referenceTrack){trackCount++;if(scores.get(id).tracks.includes(ref.referenceTrack))trackCorrect++;}
 }
 const sorted=[...rows].sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 const dcg=grades=>grades.slice(0,15).reduce((s,g,i)=>s+(2**g-1)/Math.log2(i+2),0);
 const ideal=dcg([...truth.values()].map(r=>r.referenceGrade).sort((a,b)=>b-a));
 Object.assign(m,{precision:tp/(tp+fp||1),recall:tp/(tp+fn||1),binaryAccuracy:correct/candidates.length,exactFourBandAgreement:gradeMatches/candidates.length,ndcg15:dcg(sorted.map(r=>truth.get(r.id).referenceGrade))/ideal,trackAccuracy:trackCorrect/trackCount,offTopicPromoted:rows.filter(r=>truth.get(r.id).referenceGrade===0&&r.score>=50).length,referenceRelevant:tp+fn,falsePositiveIds:rows.filter(r=>r.score>=50&&truth.get(r.id).referenceGrade<2).map(r=>r.id),missedIds:rows.filter(r=>r.score<50&&truth.get(r.id).referenceGrade>=2).map(r=>r.id)});
 const feed=result.requests.find(r=>r.arm==='feedback');
 if(feed?.valid){const changed=new Map(feed.classifications.map(r=>[r.id,r]));m.hypotheticalFeedback={negativeBefore:scores.get(byIndex(6).id).score,negativeAfter:changed.get(byIndex(6).id).score,positiveBefore:scores.get(byIndex(16).id).score,positiveAfter:changed.get(byIndex(16).id).score,otherAgentBefore:scores.get(byIndex(3).id).score,otherAgentAfter:changed.get(byIndex(3).id).score};}
 return m;
}
for(const result of results)result.metrics=metrics(result);
const report={startedAt,finishedAt:new Date().toISOString(),datasetSha256:createHash('sha256').update(source).digest('hex'),dataset:'research-2026-10-25.json',realPapers:60,conservativeReservationUsd:reservation,productionModelChanged:false,requestFormat:'short IDs, ID enum and local text bounds; strict validation of coverage/scores/tracks',limitations:[...dataset.limitations,'One run per condition; latency/reliability are observations, not uptime estimates.','Feedback arm is a hypothetical scenario, not actual user preference.','Metrics require both baseline batches to validate; there is no silent fallback or automatic retry.'],results};
await mkdir(new URL('./benchmarks/',import.meta.url),{recursive:true});await writeFile(values.output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(results.map(r=>({model:r.model,...r.metrics})),null,2));
