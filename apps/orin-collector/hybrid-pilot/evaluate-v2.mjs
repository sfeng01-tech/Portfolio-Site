import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { embed, lexicalTerms, MODEL, pilotUrl } from './pilot.mjs';

const K = 5;
export function judge(ranking, relevant, negative, k = K) {
  const top = ranking.slice(0, k);
  const matches = (row, labels) => labels.some(label => row.item_id.startsWith(label));
  const found = new Set(top.flatMap(row => relevant.filter(id => row.item_id.startsWith(id))));
  const first = top.findIndex(row => matches(row, relevant));
  const negatives = top.filter(row => matches(row, negative)).length;
  return { hit: Number(first >= 0), recall: found.size / relevant.length,
    reciprocalRank: first < 0 ? 0 : 1 / (first + 1), negatives,
    unjudged: top.filter(row => !matches(row, relevant) && !matches(row, negative)).length };
}
export function summarize(metrics) {
  const mean = key => metrics.reduce((n, row) => n + row[key], 0) / metrics.length;
  return { queries: metrics.length, hitAt5: mean('hit'), recallAt5: mean('recall'), mrrAt5: mean('reciprocalRank'),
    negativeResultsAt5: metrics.reduce((n,row) => n + row.negatives, 0), unjudgedResultsAt5: metrics.reduce((n,row) => n + row.unjudged, 0) };
}
export async function evaluate({ sql, apiKey, fetchImpl = fetch, log = console.log }) {
  const cases = JSON.parse(await readFile(new URL('./evaluation-v2.json', import.meta.url), 'utf8'));
  const [coverage] = await sql`SELECT count(*)::int AS total FROM orin_hybrid_pilot_items WHERE embedding_model=${MODEL}`;
  if (!coverage.total || coverage.total > 280) throw new Error('Invalid pilot corpus size');
  for (const testCase of cases) {
    if (!testCase.query || !testCase.track || !Array.isArray(testCase.relevant) || !testCase.relevant.length || !Array.isArray(testCase.negative)) throw new Error('Malformed evaluation case');
    const all = [...testCase.relevant, ...testCase.negative];
    if (new Set(all).size !== all.length || all.some(prefix => !/^[a-f0-9]{12}$/.test(prefix))) throw new Error('Duplicate or malformed evaluation label');
    for (const prefix of all) {
      const [found] = await sql`SELECT count(*)::int AS count FROM orin_hybrid_pilot_items WHERE item_id LIKE ${prefix + '%'} AND embedding_model=${MODEL}`;
      if (found.count !== 1) throw new Error(`Evaluation label ${prefix} does not identify exactly one pilot item`);
    }
  }
  const results = {}, byTrack = {}, timings = { embedMs: [], databaseMs: [] };
  let promptTokens = 0, tokenReports = 0, reportedCostUsd = 0, costReports = 0;
  for (const testCase of cases) {
    let start = performance.now();
    const vector = JSON.stringify((await embed([testCase.query], apiKey, fetchImpl, usage => {
      if (Number.isFinite(usage.prompt_tokens)) { promptTokens += usage.prompt_tokens; tokenReports++; }
      if (Number.isFinite(usage.cost)) { reportedCostUsd += usage.cost; costReports++; }
    }))[0]);
    timings.embedMs.push(performance.now() - start);
    const terms = lexicalTerms(testCase.query); start = performance.now();
    const rows = await sql`WITH lexical AS (
      SELECT item_id, row_number() OVER (ORDER BY ts_rank(to_tsvector('english',title || ' ' || excerpt), websearch_to_tsquery('english',${terms})) DESC, item_id) AS rank
      FROM orin_hybrid_pilot_items WHERE embedding_model=${MODEL} AND to_tsvector('english',title || ' ' || excerpt) @@ websearch_to_tsquery('english',${terms}) ORDER BY rank LIMIT 30
    ), semantic AS (
      SELECT item_id, row_number() OVER (ORDER BY embedding <=> ${vector}::vector, item_id) AS rank
      FROM orin_hybrid_pilot_items WHERE embedding_model=${MODEL} ORDER BY rank LIMIT 30
    ) SELECT i.item_id,i.title,l.rank AS keyword_rank,s.rank AS semantic_rank
      FROM lexical l FULL OUTER JOIN semantic s USING(item_id) JOIN orin_hybrid_pilot_items i ON i.item_id=coalesce(l.item_id,s.item_id)`;
    timings.databaseMs.push(performance.now() - start);
    const rr = (rank, weight=1) => rank == null ? 0 : weight / (60 + Number(rank));
    const rankings = {
      keyword: rows.filter(r => r.keyword_rank != null).sort((a,b) => Number(a.keyword_rank)-Number(b.keyword_rank)),
      semantic: rows.filter(r => r.semantic_rank != null).sort((a,b) => Number(a.semantic_rank)-Number(b.semantic_rank)),
      hybrid: [...rows].sort((a,b) => (rr(b.keyword_rank)+rr(b.semantic_rank))-(rr(a.keyword_rank)+rr(a.semantic_rank)) || a.item_id.localeCompare(b.item_id)),
      semanticWeighted: [...rows].sort((a,b) => (rr(b.keyword_rank)+rr(b.semantic_rank,2))-(rr(a.keyword_rank)+rr(a.semantic_rank,2)) || a.item_id.localeCompare(b.item_id)),
    };
    const perQuery = {};
    for (const [name, ranking] of Object.entries(rankings)) {
      const score = judge(ranking, testCase.relevant, testCase.negative);
      (results[name] ||= []).push(score);
      ((byTrack[testCase.track] ||= {})[name] ||= []).push(score);
      perQuery[name] = { ...score, top5: ranking.slice(0, K).map(row => ({ id: row.item_id.slice(0,12), title: row.title })) };
    }
    log(JSON.stringify({ track: testCase.track, query: testCase.query, scores: perQuery }));
  }
  const percentile = (values, p) => [...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1];
  log(JSON.stringify({ corpus: coverage.total, cases: cases.length,
    metrics: Object.fromEntries(Object.entries(results).map(([name, rows]) => [name, summarize(rows)])),
    tracks: Object.fromEntries(Object.entries(byTrack).map(([track, group]) => [track,Object.fromEntries(Object.entries(group).map(([name,rows]) => [name,summarize(rows)]))])),
    timingsMs: { embeddingMedian: percentile(timings.embedMs,0.5), embeddingP95: percentile(timings.embedMs,0.95), databaseMedian: percentile(timings.databaseMs,0.5), databaseP95: percentile(timings.databaseMs,0.95) },
    queryEmbeddingUsage: { promptTokens, tokenReports, reportedCostUsd: costReports ? reportedCostUsd : null, costReports } }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY || (process.argv.includes('--keychain-openrouter') ? execFileSync('security',['find-generic-password','-s','openrouter-api-key','-w'],{ encoding:'utf8',stdio:['ignore','pipe','ignore'] }).trim() : '');
    await evaluate({ sql: neon(pilotUrl(process.env)), apiKey });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
