import { orinSql, privateResponse, requireIngestToken, sendError, suppressPreviousItems, validateIngest } from '../../server/orin.js';

export default async function handler(req, res) {
  privateResponse(res);
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  try {
    requireIngestToken(req);
    if (!req.headers['content-type']?.startsWith('application/json')) return res.status(415).json({ error: 'JSON content type required' });
    const payload = validateIngest(req.body);
    const sql = await orinSql();
    const previous = payload.items.length ? await sql`SELECT DISTINCT item_id FROM orin_digest_items WHERE day < ${payload.date} AND item_id = ANY(${payload.items.map(item => item.id)}::text[])` : [];
    const { date, items, digest, sourceStatus, skipped } = suppressPreviousItems(payload, previous.map(row => row.item_id));
    const statements = [sql`INSERT INTO orin_digests (day, digest, source_status) VALUES (${date}, ${JSON.stringify(digest)}::jsonb, ${JSON.stringify(sourceStatus)}::jsonb) ON CONFLICT (day) DO UPDATE SET digest = EXCLUDED.digest, source_status = EXCLUDED.source_status, updated_at = now()`, sql`DELETE FROM orin_digest_items WHERE day = ${date}`];
    for (const item of items) {
      statements.push(sql`INSERT INTO orin_items (id, item) VALUES (${item.id}, ${JSON.stringify(item)}::jsonb) ON CONFLICT (id) DO UPDATE SET item = EXCLUDED.item, updated_at = now()`);
      statements.push(sql`INSERT INTO orin_digest_items (day, item_id) VALUES (${date}, ${item.id}) ON CONFLICT DO NOTHING`);
    }
    await sql.transaction(statements);
    return res.status(200).json({ count: items.length, skipped, date });
  } catch (error) { return sendError(res, error); }
}
