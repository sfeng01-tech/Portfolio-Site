import { orinSql, privateResponse, requireOrinOwner, sendError, validDate, validateCategory } from '../../apps/portfolio/server/orin.js';

export default async function handler(req, res) {
  privateResponse(res);
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  try {
    await requireOrinOwner(req);
    const category = req.query?.category ? validateCategory(req.query.category) : null;
    if (!category && req.query?.date !== undefined && !validDate(req.query.date)) return res.status(400).json({ error: 'Invalid date' });
    const sql = await orinSql();
    const days = await sql`SELECT day::text FROM orin_digests ORDER BY day DESC LIMIT 90`;
    const availableDates = days.map(row => row.day);
    if (category) {
      const rows = await sql`SELECT item, is_read, saved FROM orin_items WHERE item->>'category' = ${category} ORDER BY COALESCE((item->>'publishedAt')::timestamptz, updated_at) DESC LIMIT 500`;
      return res.status(200).json({
        date: null,
        availableDates,
        digest: null,
        digestStatus: null,
        items: rows.map(row => ({ ...row.item, read: row.is_read, saved: row.saved })),
        sourceStatus: [],
        category
      });
    }
    const date = req.query?.date || days[0]?.day || null;
    if (!date) return res.status(200).json({ date: null, availableDates, digest: null, items: [], sourceStatus: [] });
    const [entry] = await sql`SELECT digest, digest_status, source_status FROM orin_digests WHERE day = ${date}`;
    const rows = req.query?.saved === 'true'
      ? await sql`SELECT item, is_read, saved FROM orin_items WHERE saved = true ORDER BY updated_at DESC LIMIT 500`
      : await sql`SELECT i.item, i.is_read, i.saved FROM orin_items i JOIN orin_digest_items d ON d.item_id = i.id WHERE d.day = ${date} ORDER BY COALESCE((i.item->'ranking'->>'score')::integer, -1) DESC, i.item->>'source', i.item->>'title'`;
    return res.status(200).json({ date, availableDates, digest: entry?.digest || null, digestStatus: entry?.digest_status || null, items: rows.map(row => ({ ...row.item, read: row.is_read, saved: row.saved })), sourceStatus: entry?.source_status || [] });
  } catch (error) { return sendError(res, error); }
}
