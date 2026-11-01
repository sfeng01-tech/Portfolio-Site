// Owner-driven source management: list sources with their item counts (live and
// soft-deleted), soft-delete every item of one source, and hard-delete soft
// deletions after a 30 day retention window.
//
// Soft deletion only merges `deleted`/`deletedAt` into the item JSONB, so
// feedback, read state and categories survive, and every reader already ignores
// rows flagged `deleted`. Hard deletion physically removes the rows; the
// digest_items join cascades away, derived embeddings and ask chunks are
// removed explicitly, and stored digests are rewritten without the removed
// URLs so history never links to a vanished item.
import { visibleDigest } from './orin-content.js';

export function normalizeSourceName(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 40 || /[\u0000-\u001f]/.test(value)) {
    throw Object.assign(new Error('Invalid source'), { status: 400 });
  }
  return value.trim();
}

export async function listSources(sql) {
  const rows = await sql`
    SELECT COALESCE(item->>'source', '') AS source, count(*)::integer AS items,
           count(*) FILTER (WHERE COALESCE((item->>'deleted')::boolean, false))::integer AS deleted
    FROM orin_items GROUP BY 1 ORDER BY 1`;
  return rows.map(row => ({ source: row.source || 'unknown', items: row.items, deleted: row.deleted }));
}

// Marks every visible item of a source for deletion. The deletedAt timestamp
// starts the 30 day retention clock; items already flagged keep their stamp so
// an interrupted run never extends the window.
export async function deleteSourceItems(sql, source) {
  const deletedAt = new Date().toISOString();
  const patch = JSON.stringify({ deleted: true, deletedAt });
  const [row] = await sql`
    WITH gone AS (
      UPDATE orin_items
      SET item = item || ${patch}::jsonb, saved = false, updated_at = now()
      WHERE item->>'source' = ${source}
        AND NOT COALESCE((item->>'deleted')::boolean, false)
      RETURNING id
    )
    SELECT (SELECT count(*) FROM gone)::integer AS count`;
  return row?.count ?? 0;
}

// Permanently removes items soft-deleted more than `retentionDays` ago. Runs in
// small batches so a large backlog cannot hold a connection forever. Returns
// { items, notes } where notes counts relocations it could not perform.
export async function purgeDeletedItems(sql, retentionDays = 30) {
  const expired = await sql`
    SELECT id, item->>'url' AS url
    FROM orin_items
    WHERE COALESCE((item->>'deleted')::boolean, false)
      AND COALESCE((item->>'deletedAt')::timestamptz, updated_at) < now() - (${retentionDays}::text || ' days')::interval
    LIMIT 500`;
  if (!expired.length) return { items: 0 };
  const ids = expired.map(row => row.id);
  await sql`DELETE FROM orin_research_embeddings WHERE item_id = ANY(${ids}::text[])`;
  await sql`DELETE FROM orin_chunks WHERE source_kind = 'item' AND source_id = ANY(${ids}::text[])`;
  await sql`DELETE FROM orin_items WHERE id = ANY(${ids}::text[])`;

  // Digests keep pointing at removed URLs: strip them so a reader never lands
  // on a suggestion without an item behind it. A group that loses every URL
  // disappears, and the retained digest keeps its title and status.
  const removedRows = expired.map(row => ({ item: { deleted: true, url: row.url } }));
  const digests = await sql`SELECT day, digest FROM orin_digests WHERE digest ? 'groups' LIMIT 400`;
  for (const entry of digests) {
    const stripped = JSON.stringify(visibleDigest(entry.digest, removedRows));
    if (stripped !== JSON.stringify(entry.digest)) {
      await sql`UPDATE orin_digests SET digest = ${stripped}::jsonb, updated_at = now() WHERE day = ${entry.day}`;
    }
  }
  return { items: expired.length };
}
