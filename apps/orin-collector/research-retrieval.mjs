import { ResearchBudgetExceeded, ResearchCancelled } from './research-engine.mjs';

export const EMBEDDING_MODEL = 'openai/text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_RESERVATION_USD = 0.01;
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Only recognize explicit hardware names and versions attached to a known
// product. Bare numbers (model sizes, years, benchmark scores) are not filters.
export function researchConstraints(query) {
  const text = String(query || '').slice(0, 200);
  const found = [];
  for (const match of text.matchAll(/\bMI\d{2,4}[a-z0-9]*\b/gi)) {
    const token = match[0].toLowerCase();
    found.push({ label: token, pattern: `(^|[^a-z0-9])${escapeRegex(token)}([^a-z0-9]|$)` });
  }
  for (const match of text.matchAll(/\b(rocm|vllm|pytorch|cuda)\s*(?:v(?:ersion)?\s*)?(\d+\.\d+(?:\.\d+)?)(?![\d.])(?:[- ](preview|rc\d+))?/gi)) {
    const product = match[1].toLowerCase(), version = match[2], prerelease = match[3]?.toLowerCase();
    const suffix = prerelease ? `[-[:space:]]${escapeRegex(prerelease)}([^a-z0-9]|$)` : '(?![-[:space:]](preview|rc[0-9]+)([^a-z0-9]|$))';
    found.push({ label: `${product} ${version}${prerelease ? `-${prerelease}` : ''}`, pattern: `(^|[^a-z0-9])${product}[^a-z0-9]{0,8}(v(ersion)?[[:space:]]*)?${escapeRegex(version)}(?![0-9]|[.][0-9])${suffix}` });
  }
  return [...new Map(found.map(row => [row.label, row])).values()].slice(0, 8);
}
export function researchTerms(query) {
  return (String(query || '').toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) || []).slice(0, 14)
    .filter(token => !['the','and','for','with','what','which','does','existing'].includes(token)).join(' OR ');
}
async function queryEmbedding(query, apiKey, fetchImpl) {
  const response = await fetchImpl('https://openrouter.ai/api/v1/embeddings', {
    method:'POST', redirect:'error', signal:AbortSignal.timeout(15_000),
    headers:{ Authorization:`Bearer ${apiKey}`, 'Content-Type':'application/json', 'X-Title':'ORIN research retrieval' },
    body:JSON.stringify({ model:EMBEDDING_MODEL, input:[query], dimensions:EMBEDDING_DIMENSIONS,
      provider:{ max_price:{ prompt:1 }, require_parameters:true } }),
  });
  if (!response.ok) throw new Error('Embedding request failed');
  const data = await response.json();
  const v = data?.data?.[0]?.embedding;
  if (data?.data?.length !== 1 || data.data[0].index !== 0 || !Array.isArray(v) || v.length !== EMBEDDING_DIMENSIONS || v.some(n => !Number.isFinite(n)) || !v.some(n => n !== 0)) throw new Error('Invalid embedding');
  return JSON.stringify(v);
}
export function createResearchRetriever(sql, { env = process.env, fetchImpl = fetch } = {}) {
  async function keyword(terms, patterns) {
    if (!terms) return [];
    return sql`SELECT i.id,i.item FROM orin_items i
      WHERE NOT COALESCE((i.item->>'deleted')::boolean,false)
        AND NOT EXISTS (SELECT 1 FROM unnest(${patterns}::text[]) p WHERE (COALESCE(i.item->>'title','') || ' ' || COALESCE(i.item->>'excerpt','')) !~* p)
        AND to_tsvector('english', COALESCE(i.item->>'title','') || ' ' || COALESCE(i.item->>'excerpt','')) @@ websearch_to_tsquery('english',${terms})
      ORDER BY ts_rank(to_tsvector('english',COALESCE(i.item->>'title','') || ' ' || COALESCE(i.item->>'excerpt','')),websearch_to_tsquery('english',${terms})) DESC,i.updated_at DESC,i.id LIMIT 8`;
  }
  async function hybrid(terms, patterns, vector) {
    return sql`WITH lexical AS (
      SELECT i.id, row_number() OVER (ORDER BY ts_rank(to_tsvector('english',COALESCE(i.item->>'title','') || ' ' || COALESCE(i.item->>'excerpt','')),websearch_to_tsquery('english',${terms})) DESC,i.updated_at DESC,i.id) AS rank
      FROM orin_items i WHERE NOT COALESCE((i.item->>'deleted')::boolean,false)
        AND NOT EXISTS (SELECT 1 FROM unnest(${patterns}::text[]) p WHERE (COALESCE(i.item->>'title','') || ' ' || COALESCE(i.item->>'excerpt','')) !~* p)
        AND to_tsvector('english',COALESCE(i.item->>'title','') || ' ' || COALESCE(i.item->>'excerpt','')) @@ websearch_to_tsquery('english',${terms}) ORDER BY rank LIMIT 30
    ), semantic AS (
      SELECT i.id,row_number() OVER (ORDER BY e.embedding <=> ${vector}::vector,i.id) AS rank
      FROM orin_research_embeddings e JOIN orin_items i ON i.id=e.item_id
      WHERE e.embedding_model=${EMBEDDING_MODEL} AND NOT COALESCE((i.item->>'deleted')::boolean,false)
        AND i.item->>'titleSource' IS DISTINCT FROM 'user'
        AND ((i.item->>'source'='arxiv' AND i.item->>'url' ~ '^https://(www\\.)?arxiv\\.org/(abs|pdf)/')
          OR (i.item->>'source'='rss' AND (i.item->>'url' LIKE 'https://rocm.docs.amd.com/%' OR i.item->>'url' LIKE 'https://rocm.blogs.amd.com/%')))
        AND e.content_hash=md5(COALESCE(i.item->>'title','') || chr(10) || COALESCE(i.item->>'excerpt',''))
        AND NOT EXISTS (SELECT 1 FROM unnest(${patterns}::text[]) p WHERE (COALESCE(i.item->>'title','') || ' ' || COALESCE(i.item->>'excerpt','')) !~* p)
      ORDER BY rank LIMIT 30
    ), fused AS (
      SELECT coalesce(l.id,s.id) AS id,coalesce(1.0/(60+l.rank),0)+coalesce(1.0/(60+s.rank),0) AS score
      FROM lexical l FULL OUTER JOIN semantic s USING(id)
    ) SELECT i.id,i.item FROM fused f JOIN orin_items i ON i.id=f.id ORDER BY f.score DESC,i.id LIMIT 8`;
  }
  return async function search(query, { reserve = async () => false } = {}) {
    const text = String(query || '').trim().slice(0,200), terms = researchTerms(text), constraints = researchConstraints(text);
    const patterns = constraints.map(row => row.pattern);
    let method = 'keyword', reason = env.ORIN_RESEARCH_HYBRID_ENABLED === 'true' ? 'index_unavailable' : 'disabled', rows;
    if (!terms) return { items:[], method, reason:'empty_query', constraints:constraints.map(row => row.label) };
    if (env.ORIN_RESEARCH_HYBRID_ENABLED === 'true' && env.OPENROUTER_API_KEY) {
      try {
        const [available] = await sql`SELECT CASE WHEN to_regclass('public.orin_research_embeddings') IS NULL THEN false ELSE true END AS available`;
        if (available?.available) {
          const [coverage] = await sql`SELECT EXISTS(SELECT 1 FROM orin_research_embeddings WHERE embedding_model=${EMBEDDING_MODEL}) AS present`;
          if (coverage?.present) {
            if (await reserve(EMBEDDING_RESERVATION_USD) === false) throw new ResearchBudgetExceeded();
            const vector = await queryEmbedding(text, env.OPENROUTER_API_KEY, fetchImpl);
            rows = await hybrid(terms, patterns, vector); method = 'hybrid'; reason = undefined;
          }
        }
      } catch (error) {
        if (error instanceof ResearchCancelled) throw error;
        reason = error instanceof ResearchBudgetExceeded ? 'budget_unavailable' : 'semantic_unavailable';
      }
    } else if (env.ORIN_RESEARCH_HYBRID_ENABLED === 'true') reason = 'provider_not_configured';
    if (!rows) rows = await keyword(terms, patterns);
    return { items:rows.map(row => ({ ...row.item, itemId:row.id, provenance:'library', coverage:'excerpt' })), method,
      ...(reason ? { reason } : {}), constraints:constraints.map(row => row.label) };
  };
}
