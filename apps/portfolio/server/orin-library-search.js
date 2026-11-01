// Search only the IDs in the current authenticated view. Query text is sent
// to the embedding provider; indexed item text never leaves the server here.
const MODEL = 'openai/text-embedding-3-small';
const DIMENSIONS = 1536;
export function validateViewSearch(body) {
  if (!body || typeof body.query !== 'string' || body.query.trim().length < 2 || body.query.length > 200 || /[\u0000-\u001f]/.test(body.query)) throw Object.assign(new Error('Search must be 2–200 characters'), { status:400 });
  if (body.ids !== undefined && (!Array.isArray(body.ids) || body.ids.length > 500 || body.ids.some(id => typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)))) throw Object.assign(new Error('Invalid search scope'), { status:400 });
  if (body.searchMode !== undefined && !['hybrid', 'keyword'].includes(body.searchMode)) throw Object.assign(new Error('Invalid search mode'), { status:400 });
  return { searchMode:body.searchMode || 'hybrid',query:body.query.trim(),ids:body.ids === undefined ? null : [...new Set(body.ids)] };
}
const termsFor = query => (query.toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) || []).slice(0,14).join(' OR ');
async function embedQuery(query, apiKey, fetchImpl) {
  const response=await fetchImpl('https://openrouter.ai/api/v1/embeddings',{ method:'POST',redirect:'error',signal:AbortSignal.timeout(12_000),
    headers:{ Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','X-Title':'ORIN library search' },
    body:JSON.stringify({model:MODEL,input:[query],dimensions:DIMENSIONS,provider:{max_price:{prompt:1},require_parameters:true}}) });
  if (!response.ok) throw new Error('Embedding unavailable');
  const body=await response.json(), vector=body.data?.[0]?.embedding;
  if (body.data?.length!==1 || body.data[0].index!==0 || !Array.isArray(vector) || vector.length!==DIMENSIONS || vector.some(n=>!Number.isFinite(n)) || !vector.some(n=>n!==0)) throw new Error('Invalid embedding');
  return JSON.stringify(vector);
}
export async function searchView(sql,{query,ids,searchMode='hybrid'},{env=process.env,fetchImpl=fetch}={}) {
  if (ids && !ids.length) return {items:[],method:'keyword'};
  const terms=termsFor(query);
  async function lexical() {
    const rows=await sql`SELECT i.id,i.item,i.is_read,i.saved FROM orin_items i WHERE (${ids}::text[] IS NULL OR i.id=ANY(${ids}::text[])) AND NOT COALESCE((i.item->>'deleted')::boolean,false)
      AND (STRPOS(LOWER(CONCAT_WS(' ',i.item->>'title',i.item->>'excerpt',i.item->>'category',i.item->>'author',i.item->>'topics')),LOWER(${query}))>0
        OR (${terms}<>'' AND to_tsvector('english',CONCAT_WS(' ',i.item->>'title',i.item->>'excerpt',i.item->>'category',i.item->>'author',i.item->>'topics')) @@ websearch_to_tsquery('english',${terms})))
      ORDER BY CASE WHEN ${terms}='' THEN 0 ELSE ts_rank(to_tsvector('english',CONCAT_WS(' ',i.item->>'title',i.item->>'excerpt',i.item->>'category',i.item->>'author',i.item->>'topics')),websearch_to_tsquery('english',${terms})) END DESC,i.id LIMIT 100`;
    return {items:rows.map(row=>({...row.item,id:row.id,read:row.is_read,saved:row.saved})),method:'keyword'};
  }
  if (searchMode === 'keyword' || !env.OPENROUTER_API_KEY?.trim() || !terms) return lexical();
  try {
    const [coverage]=await sql`SELECT to_regclass('public.orin_research_embeddings') IS NOT NULL AS present`;
    if (!coverage?.present) return lexical();
    const [indexed]=await sql`SELECT EXISTS(SELECT 1 FROM orin_research_embeddings e JOIN orin_items i ON i.id=e.item_id
      WHERE (${ids}::text[] IS NULL OR e.item_id=ANY(${ids}::text[])) AND e.embedding_model=${MODEL} AND NOT COALESCE((i.item->>'deleted')::boolean,false)
        AND e.content_hash=md5(COALESCE(i.item->>'title','') || chr(10) || COALESCE(i.item->>'excerpt',''))) AS present`;
    if (!indexed?.present) return lexical();
    const vector=await embedQuery(query,env.OPENROUTER_API_KEY,fetchImpl);
    const rows=await sql`WITH lexical AS (
      SELECT i.id,row_number() OVER (ORDER BY ts_rank(to_tsvector('english',CONCAT_WS(' ',i.item->>'title',i.item->>'excerpt',i.item->>'category',i.item->>'author',i.item->>'topics')),websearch_to_tsquery('english',${terms})) DESC,i.id) AS rank
      FROM orin_items i WHERE (${ids}::text[] IS NULL OR i.id=ANY(${ids}::text[])) AND NOT COALESCE((i.item->>'deleted')::boolean,false)
        AND (to_tsvector('english',CONCAT_WS(' ',i.item->>'title',i.item->>'excerpt',i.item->>'category',i.item->>'author',i.item->>'topics')) @@ websearch_to_tsquery('english',${terms})
        OR STRPOS(LOWER(CONCAT_WS(' ',i.item->>'title',i.item->>'excerpt',i.item->>'category',i.item->>'author',i.item->>'topics')),LOWER(${query}))>0) ORDER BY rank LIMIT 100
    ), semantic AS (
      SELECT i.id,row_number() OVER (ORDER BY e.embedding <=> ${vector}::vector,i.id) AS rank
      FROM orin_research_embeddings e JOIN orin_items i ON i.id=e.item_id
      WHERE (${ids}::text[] IS NULL OR i.id=ANY(${ids}::text[])) AND NOT COALESCE((i.item->>'deleted')::boolean,false) AND e.embedding_model=${MODEL}
        AND e.content_hash=md5(COALESCE(i.item->>'title','') || chr(10) || COALESCE(i.item->>'excerpt',''))
        AND e.embedding <=> ${vector}::vector < 0.7 ORDER BY rank LIMIT 100
    ), fused AS (
      SELECT coalesce(l.id,s.id) AS id,coalesce(1.0/(60+l.rank),0)+coalesce(1.0/(60+s.rank),0) AS score,(s.id IS NOT NULL) AS semantic_match
      FROM lexical l FULL OUTER JOIN semantic s USING(id)
    ) SELECT i.id,i.item,i.is_read,i.saved,f.semantic_match FROM fused f JOIN orin_items i ON i.id=f.id ORDER BY f.score DESC,i.id LIMIT 100`;
    return {items:rows.map(row=>({...row.item,id:row.id,read:row.is_read,saved:row.saved})),semanticIds:rows.filter(row=>row.semantic_match).map(row=>row.id),method:'hybrid'};
  } catch { return lexical(); }
}
