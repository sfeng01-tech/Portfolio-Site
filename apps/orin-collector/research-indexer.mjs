import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { embed, prepareText, MODEL } from './hybrid-pilot/pilot.mjs';

const MAX_ITEMS = 1000;
const BATCH = 20;
// Provider routing is capped at $1 per million input tokens. UTF-8 bytes plus
// request overhead conservatively bound tokens; this is a per-run allowance,
// not a provider invoice or a reservation against an individual research job.
const MAX_RUN_USD = 0.80;
export const eligible = item => Boolean(item && item.deleted !== true
  && (String(item.title || '').trim() || String(item.excerpt || '').trim()));
export async function indexResearch({ sql, apiKey, fetchImpl = fetch, dryRun = false, log = console.log }) {
  if (!apiKey && !dryRun) throw new Error('Embedding provider is not configured');
  const items = await sql`SELECT i.id, i.item, md5(COALESCE(i.item->>'title','') || chr(10) || COALESCE(i.item->>'excerpt','')) AS content_hash
    FROM orin_items i LEFT JOIN orin_research_embeddings e ON e.item_id=i.id
    WHERE NOT COALESCE((i.item->>'deleted')::boolean,false)
      AND (length(trim(COALESCE(i.item->>'title','')))>0 OR length(trim(COALESCE(i.item->>'excerpt','')))>0)
      AND (e.item_id IS NULL OR e.embedding_model <> ${MODEL}
        OR e.content_hash <> md5(COALESCE(i.item->>'title','') || chr(10) || COALESCE(i.item->>'excerpt','')))
    ORDER BY i.updated_at DESC,i.id LIMIT ${MAX_ITEMS}`;
  if (dryRun) { log(`Would index ${items.length} eligible source items.`); return { selected:items.length, indexed:0, allowanceUsd:0 }; }
  // Remove only derived vectors when their source has been soft-deleted or
  // emptied of text. The source item itself is untouched.
  const removed = await sql`DELETE FROM orin_research_embeddings e USING orin_items i WHERE i.id=e.item_id AND (
    COALESCE((i.item->>'deleted')::boolean,false) OR (length(trim(COALESCE(i.item->>'title','')))=0 AND length(trim(COALESCE(i.item->>'excerpt','')))=0)) RETURNING e.item_id`;
  let indexed = 0, allowanceUsd = 0;
  for (let start=0;start<items.length;start+=BATCH) {
    const rows=items.slice(start,start+BATCH).filter(row=>eligible(row.item));
    if (!rows.length) continue;
    const texts=rows.map(row=>prepareText(row.item));
    const batchBound=(Buffer.byteLength(JSON.stringify({ model:MODEL, input:texts })) + 1024) / 1_000_000;
    if (allowanceUsd+batchBound > MAX_RUN_USD) break;
    allowanceUsd += batchBound;
    const vectors=await embed(texts,apiKey,fetchImpl);
    const payload=JSON.stringify(rows.map((row,n)=>({ item_id:row.id, content_hash:row.content_hash, vector:JSON.stringify(vectors[n]) })));
    // Recheck each item at write time so concurrent edits cannot attach stale vectors.
    const written=await sql`INSERT INTO orin_research_embeddings(item_id,embedding_model,content_hash,embedding)
      SELECT i.id,${MODEL},v.content_hash,v.vector::vector
      FROM jsonb_to_recordset(${payload}::jsonb) AS v(item_id text,content_hash text,vector text)
      JOIN orin_items i ON i.id=v.item_id
      WHERE NOT COALESCE((i.item->>'deleted')::boolean,false)
        AND (length(trim(COALESCE(i.item->>'title','')))>0 OR length(trim(COALESCE(i.item->>'excerpt','')))>0)
        AND md5(COALESCE(i.item->>'title','') || chr(10) || COALESCE(i.item->>'excerpt',''))=v.content_hash
      ON CONFLICT(item_id) DO UPDATE SET embedding_model=EXCLUDED.embedding_model,content_hash=EXCLUDED.content_hash,
        embedding=EXCLUDED.embedding,indexed_at=now() RETURNING item_id`;
    indexed += written.length;
  }
  log(`Indexed ${indexed} source items; removed ${removed.length} ineligible derived vectors; reserved per-run bound $${allowanceUsd.toFixed(6)}.`);
  return { selected:items.length,indexed,removed:removed.length,allowanceUsd };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args=process.argv.slice(2);
    if (args.some(arg=>!['--dry-run','--keychain-openrouter'].includes(arg))) throw new Error('Usage: research-indexer.mjs [--dry-run] [--keychain-openrouter]');
    if (!process.env.ORIN_DATABASE_URL) throw new Error('ORIN_DATABASE_URL is required');
    const apiKey=process.env.OPENROUTER_API_KEY || (!args.includes('--dry-run') && args.includes('--keychain-openrouter')
      ? execFileSync('security',['find-generic-password','-s','openrouter-api-key','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim() : '');
    const { neon }=await import('@neondatabase/serverless');
    await indexResearch({sql:neon(process.env.ORIN_DATABASE_URL),apiKey,dryRun:args.includes('--dry-run')});
  } catch { console.error('Research indexing failed. Check the schema, approved provider, credentials, and worker configuration.'); process.exitCode=1; }
}
