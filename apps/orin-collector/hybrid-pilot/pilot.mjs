import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';

export const MODEL = 'openai/text-embedding-3-small';
export const DIMENSIONS = 1536;
const MAX_ITEMS = 280;
const BATCH = 20;
const MAX_TEXT = 3500;
const URL_ENDPOINT = 'https://openrouter.ai/api/v1/embeddings';

export function prepareText(item) {
  return `Title: ${String(item.title || '').trim().slice(0, 500)}\nExcerpt: ${String(item.excerpt || '').trim().slice(0, 3000)}`.slice(0, MAX_TEXT);
}
export function lexicalTerms(query) {
  return (String(query).toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) || []).slice(0, 14)
    .filter(word => !['the', 'and', 'for', 'with', 'what', 'which', 'does', 'existing'].includes(word)).join(' OR ');
}
export function validateEmbeddings(payload, count) {
  if (!Array.isArray(payload?.data) || payload.data.length !== count) throw new Error('Embedding provider returned an unexpected count');
  const byIndex = new Map();
  for (const row of payload.data) {
    if (!Number.isInteger(row.index) || row.index < 0 || row.index >= count || byIndex.has(row.index)
      || !Array.isArray(row.embedding) || row.embedding.length !== DIMENSIONS || row.embedding.some(n => !Number.isFinite(n)) || !row.embedding.some(n => n !== 0)) {
      throw new Error('Embedding provider returned an invalid vector');
    }
    byIndex.set(row.index, row.embedding);
  }
  return Array.from({ length: count }, (_, i) => byIndex.get(i));
}
export async function embed(input, apiKey, fetchImpl = fetch, observeUsage = () => {}) {
  if (!apiKey || !Array.isArray(input) || !input.length || input.length > BATCH || input.some(s => typeof s !== 'string' || !s.trim() || s.length > MAX_TEXT)) throw new Error('Invalid embedding request');
  const response = await fetchImpl(URL_ENDPOINT, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(90_000),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'ORIN hybrid search pilot' },
    body: JSON.stringify({ model: MODEL, input, dimensions: DIMENSIONS, provider: { max_price: { prompt: 1 }, require_parameters: true } }) });
  if (!response.ok) throw new Error(`Embedding provider returned HTTP ${response.status}`);
  const payload = await response.json();
  const vectors = validateEmbeddings(payload, input.length);
  observeUsage(payload.usage || {});
  return vectors;
}
export function scoreRanking(rows, relevantPrefixes, k = 5) {
  const first = rows.findIndex(row => relevantPrefixes.some(prefix => row.item_id.startsWith(prefix)));
  return { hit: first >= 0 && first < k ? 1 : 0, reciprocalRank: first >= 0 && first < k ? 1 / (first + 1) : 0 };
}
export function pilotUrl(env) {
  if (!env.ORIN_PILOT_HOST || !env.ORIN_DATABASE_URL) throw new Error('Set ORIN_PILOT_HOST and ORIN_DATABASE_URL for an isolated pilot branch');
  const url = new URL(env.ORIN_DATABASE_URL);
  const host = env.ORIN_PILOT_HOST.toLowerCase();
  if (!/^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/.test(host) || host === url.hostname.toLowerCase() || host.replace('-pooler.', '.') === url.hostname.toLowerCase().replace('-pooler.', '.')) throw new Error('Pilot host must be a different Neon endpoint');
  url.hostname = host;
  return url.toString();
}
export async function run({ mode, sql, apiKey, fetchImpl = fetch, log = console.log }) {
  if (mode === 'init') {
    const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
    const statements = schema.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
    for (const statement of statements) await sql.query(statement);
    log('Pilot schema ready.'); return;
  }
  if (mode === 'backfill') {
    // Scope is deliberately public arXiv and official ROCm web pages. Shared
    // links, notes, chats and user prompts are not sent to the provider.
    const items = await sql`WITH arxiv AS (
      SELECT id,item,updated_at,0 AS cohort FROM orin_items WHERE item->>'source'='arxiv'
        AND length(coalesce(item->>'excerpt',''))>30 AND NOT COALESCE((item->>'deleted')::boolean,false)
      ORDER BY updated_at DESC,id LIMIT 200
    ), amd AS (
      SELECT id,item,updated_at,1 AS cohort FROM orin_items WHERE item->>'source'='rss'
        AND (item->>'url' LIKE 'https://rocm.docs.amd.com/%' OR item->>'url' LIKE 'https://rocm.blogs.amd.com/%')
        AND length(coalesce(item->>'excerpt',''))>30 AND NOT COALESCE((item->>'deleted')::boolean,false)
      ORDER BY updated_at DESC,id LIMIT 80
    ) SELECT id,item->>'title' AS title,item->>'excerpt' AS excerpt,item->>'source' AS source
      FROM (SELECT * FROM arxiv UNION ALL SELECT * FROM amd) candidates ORDER BY cohort,updated_at DESC,id`;
    const existing = await sql`SELECT item_id FROM orin_hybrid_pilot_items`;
    const indexedIds = new Set(existing.map(row => row.item_id));
    let indexed = 0;
    for (let start = 0; start < items.length; start += BATCH) {
      const rows = items.slice(start, start + BATCH).map(item => ({ ...item, title: String(item.title || '').slice(0, 500), excerpt: String(item.excerpt || '').slice(0, 3000) }));
      const pending = [];
      for (const item of rows) {
        if (!indexedIds.has(item.id) && indexedIds.size >= MAX_ITEMS) continue;
        const contentHash = createHash('sha256').update(prepareText(item)).digest('hex');
        const prior = await sql`SELECT item_id FROM orin_hybrid_pilot_items WHERE item_id=${item.id} AND content_hash=${contentHash} AND embedding_model=${MODEL}`;
        if (!prior.length) { pending.push({ ...item, contentHash }); indexedIds.add(item.id); }
      }
      if (!pending.length) continue;
      const vectors = await embed(pending.map(prepareText), apiKey, fetchImpl);
      for (let i = 0; i < pending.length; i++) {
        const item = pending[i]; const vector = JSON.stringify(vectors[i]);
        await sql`INSERT INTO orin_hybrid_pilot_items(item_id,title,excerpt,source,embedding_model,content_hash,embedding)
          VALUES(${item.id},${item.title},${item.excerpt},${item.source},${MODEL},${item.contentHash},${vector}::vector)
          ON CONFLICT(item_id) DO UPDATE SET title=EXCLUDED.title,excerpt=EXCLUDED.excerpt,source=EXCLUDED.source,
            embedding_model=EXCLUDED.embedding_model,content_hash=EXCLUDED.content_hash,embedding=EXCLUDED.embedding,indexed_at=now()`;
        indexed++;
      }
      log(`Indexed ${indexed} new or changed excerpts.`);
    }
    log(`Pilot selected ${items.length} public arXiv and official ROCm entries; ${indexed} embedded.`); return;
  }
  if (mode !== 'eval') throw new Error('Use init, backfill, or eval');
  const cases = JSON.parse(await readFile(new URL('./evaluation.json', import.meta.url), 'utf8'));
  const [coverage] = await sql`SELECT count(*)::int AS total FROM orin_hybrid_pilot_items WHERE embedding_model=${MODEL}`;
  if (!coverage.total) throw new Error('Pilot corpus is empty; run backfill first');
  const metrics = { keyword: [], semantic: [], hybrid: [] };
  for (const testCase of cases) {
    for (const prefix of testCase.relevantPrefixes) {
      const [found] = await sql`SELECT count(*)::int AS count FROM orin_hybrid_pilot_items WHERE item_id LIKE ${prefix + '%'} AND embedding_model=${MODEL}`;
      if (found.count !== 1) throw new Error(`Evaluation label ${prefix} does not identify exactly one pilot item`);
    }
    const vector = JSON.stringify((await embed([testCase.query], apiKey, fetchImpl))[0]);
    const terms = lexicalTerms(testCase.query);
    const rows = await sql`WITH lexical AS (
      SELECT item_id, row_number() OVER (ORDER BY ts_rank(to_tsvector('english',title || ' ' || excerpt), websearch_to_tsquery('english',${terms})) DESC, item_id) AS rank
      FROM orin_hybrid_pilot_items WHERE embedding_model=${MODEL} AND to_tsvector('english',title || ' ' || excerpt) @@ websearch_to_tsquery('english',${terms})
      ORDER BY rank LIMIT 30
    ), semantic AS (
      SELECT item_id, row_number() OVER (ORDER BY embedding <=> ${vector}::vector, item_id) AS rank
      FROM orin_hybrid_pilot_items WHERE embedding_model=${MODEL} ORDER BY rank LIMIT 30
    ), combined AS (
      SELECT coalesce(l.item_id,s.item_id) AS item_id, l.rank AS keyword_rank, s.rank AS semantic_rank,
        coalesce(1.0/(60+l.rank),0)+coalesce(1.0/(60+s.rank),0) AS hybrid_score
      FROM lexical l FULL OUTER JOIN semantic s USING(item_id)
    ) SELECT i.item_id,i.title,c.keyword_rank,c.semantic_rank,c.hybrid_score
      FROM combined c JOIN orin_hybrid_pilot_items i USING(item_id)`;
    const keyword = rows.filter(r => r.keyword_rank !== null).sort((a,b) => Number(a.keyword_rank)-Number(b.keyword_rank));
    const semantic = rows.filter(r => r.semantic_rank !== null).sort((a,b) => Number(a.semantic_rank)-Number(b.semantic_rank));
    const hybrid = [...rows].sort((a,b) => Number(b.hybrid_score)-Number(a.hybrid_score) || a.item_id.localeCompare(b.item_id));
    for (const [name, ranking] of Object.entries({ keyword, semantic, hybrid })) metrics[name].push(scoreRanking(ranking, testCase.relevantPrefixes));
    log(JSON.stringify({ query: testCase.query, keyword: keyword.slice(0,5).map(r => r.title), semantic: semantic.slice(0,5).map(r => r.title), hybrid: hybrid.slice(0,5).map(r => r.title) }));
  }
  const mean = (rows,key) => rows.reduce((sum,row) => sum+row[key],0)/rows.length;
  log(JSON.stringify({ corpus: coverage.total, cases: cases.length, metrics: Object.fromEntries(Object.entries(metrics).map(([name, rows]) => [name,{ hitAt5:mean(rows,'hit'), mrrAt5:mean(rows,'reciprocalRank') }])) }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const mode = process.argv[2];
    const apiKey = process.env.OPENROUTER_API_KEY || (mode !== 'init' && process.argv.includes('--keychain-openrouter') ? execFileSync('security', ['find-generic-password','-s','openrouter-api-key','-w'], { encoding:'utf8', stdio:['ignore','pipe','ignore'] }).trim() : '');
    await run({ mode, sql: neon(pilotUrl(process.env)), apiKey });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
