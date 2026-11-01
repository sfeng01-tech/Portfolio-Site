// Copy only vectors whose pilot snapshot still matches the current item.
// This command is intentionally restricted to a separate Neon pilot host.
import { neon } from '@neondatabase/serverless';
import { EMBEDDING_MODEL } from '../research-retrieval.mjs';
import { pilotUrl } from './pilot.mjs';
const sql = neon(pilotUrl(process.env));
try {
  const rows = await sql`INSERT INTO orin_research_embeddings(item_id,embedding_model,content_hash,embedding)
    SELECT i.id,p.embedding_model,md5(COALESCE(i.item->>'title','') || chr(10) || COALESCE(i.item->>'excerpt','')),p.embedding
    FROM orin_hybrid_pilot_items p JOIN orin_items i ON i.id=p.item_id
    WHERE p.embedding_model=${EMBEDDING_MODEL}
      AND left(COALESCE(i.item->>'title',''),500)=p.title AND left(COALESCE(i.item->>'excerpt',''),3000)=p.excerpt
      AND NOT COALESCE((i.item->>'deleted')::boolean,false)
    ON CONFLICT(item_id) DO UPDATE SET embedding_model=EXCLUDED.embedding_model,content_hash=EXCLUDED.content_hash,
      embedding=EXCLUDED.embedding,indexed_at=now() RETURNING item_id`;
  console.log(`Synchronized ${rows.length} matching pilot vectors into the isolated research index.`);
} catch { console.error('Research pilot index synchronization failed. Check that both pilot schemas are installed.'); process.exitCode=1; }
