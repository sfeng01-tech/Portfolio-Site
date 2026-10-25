import { ORIN_DEMO_MODE, orinSql, privateResponse, requireIngestToken, requireOrinOwner, sendError, validateCategory } from '../../apps/portfolio/server/orin.js';
import { getDemoCategories } from '../../apps/portfolio/server/orinDemo.js';

// Editable category taxonomy backing the ORIN brain segments and the model
// classifier. The collector reads it with the ingestion token; the owner
// manages it in the browser with the GitHub session.
export default async function handler(req, res) {
  privateResponse(res);
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) { res.setHeader('Allow', 'GET, POST, DELETE'); return res.status(405).json({ error: 'Method not allowed' }); }
  try {
    if (req.method === 'GET') {
      try { requireIngestToken(req); } catch { await requireOrinOwner(req); }
      if (ORIN_DEMO_MODE()) return res.status(200).json({ categories: getDemoCategories() });
      const sql = await orinSql();
      const rows = await sql`SELECT c.label AS label, (SELECT count(*) FROM orin_items i WHERE i.item->>'category' = c.label)::int AS items FROM orin_categories c ORDER BY c.label`;
      return res.status(200).json({ categories: rows });
    }
    await requireOrinOwner(req, true);
    const label = validateCategory((req.body || {}).label);
    const sql = await orinSql();
    if (req.method === 'POST') {
      const [existing] = await sql`SELECT label FROM orin_categories WHERE lower(label) = lower(${label}) LIMIT 1`;
      if (existing) return res.status(200).json({ label: existing.label, existed: true });
      await sql`INSERT INTO orin_categories (label) VALUES (${label})`;
      return res.status(201).json({ label });
    }
    const removed = await sql`DELETE FROM orin_categories c WHERE c.label = ${label} AND NOT EXISTS (SELECT 1 FROM orin_items i WHERE i.item->>'category' = c.label) RETURNING c.label`;
    if (!removed.length) return res.status(409).json({ error: 'Category is unknown or still assigned to items; clear it from items first' });
    return res.status(200).json({ deleted: removed[0].label });
  } catch (error) { return sendError(res, error); }
}
