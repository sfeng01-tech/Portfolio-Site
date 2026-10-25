import { orinSql, privateResponse, requireOrinOwner, sendError } from '../../apps/portfolio/server/orin.js';

export default async function handler(req, res) {
  privateResponse(res);
  if (req.method !== 'PATCH') { res.setHeader('Allow', 'PATCH'); return res.status(405).json({ error: 'Method not allowed' }); }
  try {
    await requireOrinOwner(req, true);
    const { id, read, saved, feedback } = req.body || {};
    if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id) || (read === undefined && saved === undefined && feedback === undefined) || (read !== undefined && typeof read !== 'boolean') || (saved !== undefined && typeof saved !== 'boolean') || (feedback !== undefined && ![-1, 0, 1].includes(feedback))) return res.status(400).json({ error: 'Invalid item update' });
    const sql = await orinSql();
    const [item] = await sql`UPDATE orin_items SET is_read = COALESCE(${read ?? null}::boolean, is_read), saved = COALESCE(${saved ?? null}::boolean, saved), item = CASE WHEN ${feedback ?? null}::integer IS NULL THEN item ELSE jsonb_set(item, '{feedback}', to_jsonb(${feedback ?? null}::integer), true) END, updated_at = now() WHERE id = ${id} RETURNING id, is_read, saved, item`;
    if (!item) return res.status(404).json({ error: 'Item not found' });
    return res.status(200).json({ id: item.id, read: item.is_read, saved: item.saved, feedback: item.item.feedback ?? 0 });
  } catch (error) { return sendError(res, error); }
}
