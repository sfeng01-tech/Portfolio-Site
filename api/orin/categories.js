import { orinSql, privateResponse, requireIngestToken, requireOrinOwner, sendError, validateCategory } from '../../apps/portfolio/server/orin.js';
import { fail } from '../../apps/portfolio/server/validation-helpers.js';

// Editable category taxonomy backing the ORIN brain segments and the model
// classifier. The collector reads it with the ingestion token; the owner
// manages it in the browser with the GitHub session.
export default async function handler(req, res) {
  privateResponse(res);
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) { res.setHeader('Allow', 'GET, POST, DELETE'); return res.status(405).json({ error: 'Method not allowed' }); }
  try {
    if (req.method === 'GET') {
      try { requireIngestToken(req); } catch { await requireOrinOwner(req); }
      const sql = await orinSql();
      const rows = await sql`SELECT c.label AS label, (SELECT count(*) FROM orin_items i WHERE i.item->>'category' = c.label)::int AS items FROM orin_categories c ORDER BY c.label`;
      return res.status(200).json({ categories: rows });
    }
    await requireOrinOwner(req, true);
    const body = req.body || {};
    const label = validateCategory(body.label);
    // Removing a label in use needs to know what happens to its items: either
    // leave them unfiled (they fall back to topics and the model may re-file)
    // or move all of them onto another label as an owner decision.
    const { action } = body;
    if (action !== undefined && action !== 'unfile' && action !== 'reassign') throw fail('Invalid category action', 400);
    if (action === 'reassign' && (typeof body.to !== 'string' || !body.to.trim())) throw fail('Target category required for reassign', 400);
    const target = action === 'reassign' ? validateCategory(body.to) : undefined;
    if (!action && body.to !== undefined) throw fail("to is only valid with the reassign action", 400);
    const sql = await orinSql();
    if (req.method === 'POST') {
      const [existing] = await sql`SELECT label FROM orin_categories WHERE lower(label) = lower(${label}) LIMIT 1`;
      if (existing) return res.status(200).json({ label: existing.label, existed: true });
      await sql`INSERT INTO orin_categories (label) VALUES (${label})`;
      return res.status(201).json({ label });
    }
    if (!action) {
      const removed = await sql`DELETE FROM orin_categories c WHERE c.label = ${label} AND NOT EXISTS (SELECT 1 FROM orin_items i WHERE i.item->>'category' = c.label) RETURNING c.label`;
      if (!removed.length) return res.status(409).json({ error: 'Category is unknown or still assigned to items; clear it from items first' });
      return res.status(200).json({ deleted: removed[0].label });
    }
    const statements = [
      action === 'unfile'
        ? sql`UPDATE orin_items SET item = item - 'category' - 'categorySource', updated_at = now() WHERE item->>'category' = ${label} RETURNING id`
        : sql`UPDATE orin_items SET item = jsonb_set(jsonb_set(item, '{category}', to_jsonb(${target}::text), true), '{categorySource}', '"user"'::jsonb, true), updated_at = now() WHERE item->>'category' = ${label} RETURNING id`,
      sql`DELETE FROM orin_categories c WHERE c.label = ${label} RETURNING c.label`,
    ];
    const results = await sql.transaction(statements);
    const removals = results[1];
    if (!removals.length) return res.status(404).json({ error: 'Category not found' });
    return res.status(200).json({ deleted: removals[0].label, affected: results[0].length });
  } catch (error) { return sendError(res, error); }
}
