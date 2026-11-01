// Explicit positive feedback only. Saves and reads are not preference signals.
// Similarity helps rank candidates but is never evidence of quality or novelty.
export async function loadSemanticAffinities(sql, ids) {
  if (!Array.isArray(ids) || !ids.length) return new Map();
  try {
    const rows=await sql`WITH liked AS (
      SELECT i.id,e.embedding FROM orin_items i JOIN orin_research_embeddings e ON e.item_id=i.id
      WHERE i.item->>'feedback'='1' AND NOT COALESCE((i.item->>'deleted')::boolean,false)
        AND e.embedding_model='openai/text-embedding-3-small'
        AND e.content_hash=md5(COALESCE(i.item->>'title','') || chr(10) || COALESCE(i.item->>'excerpt',''))
      ORDER BY i.updated_at DESC LIMIT 20
    ), candidates AS (
      SELECT i.id,e.embedding FROM orin_items i JOIN orin_research_embeddings e ON e.item_id=i.id
      WHERE i.id=ANY(${ids}::text[]) AND NOT COALESCE((i.item->>'deleted')::boolean,false)
        AND COALESCE(i.item->>'feedback','0') <> '-1' AND e.embedding_model='openai/text-embedding-3-small'
        AND e.content_hash=md5(COALESCE(i.item->>'title','') || chr(10) || COALESCE(i.item->>'excerpt',''))
    ) SELECT c.id,max(1-(c.embedding <=> l.embedding))::float8 AS similarity
      FROM candidates c JOIN liked l ON c.id<>l.id GROUP BY c.id`;
    return new Map(rows.filter(row=>Number.isFinite(Number(row.similarity)) && Number(row.similarity)>=0.45)
      .map(row=>[row.id,Math.min(1,Math.max(0,Number(row.similarity)))]));
  } catch { return new Map(); }
}
