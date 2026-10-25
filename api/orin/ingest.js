import { orinSql, privateResponse, requireIngestToken, sendError, suppressPreviousItems, validateIngest } from '../../apps/portfolio/server/orin.js';

export default async function handler(req, res) {
  privateResponse(res);
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  try {
    requireIngestToken(req);
    if (!req.headers['content-type']?.startsWith('application/json')) return res.status(415).json({ error: 'JSON content type required' });
    const payload = validateIngest(req.body);
    const sql = await orinSql();
    const previous = payload.items.length ? await sql`SELECT DISTINCT d.item_id, i.item->>'paperId' AS paper_id FROM orin_digest_items d JOIN orin_items i ON i.id = d.item_id WHERE d.day < ${payload.date} AND (d.item_id = ANY(${payload.items.map(item => item.id)}::text[]) OR i.item->>'paperId' = ANY(${payload.items.map(item => item.paperId).filter(Boolean)}::text[]))` : [];
    const { date, items, digest, sourceStatus, skipped } = suppressPreviousItems(payload, previous.map(row => row.item_id), previous.map(row => row.paper_id).filter(Boolean));
    // Membership is additive by default. A partial run (blocked source, spent
    // daily cap, model outage) must never erase items an earlier run already
    // published for the same day. `replace: true` opts back into a full swap for
    // deliberate corrections.
    const replace = payload.replace === true;
    const before = replace ? 0 : (await sql`SELECT count(*)::int AS n FROM orin_digest_items WHERE day = ${date}`)[0]?.n ?? 0;
    const statements = [sql`INSERT INTO orin_digests (day, digest, source_status) VALUES (${date}, ${JSON.stringify(digest)}::jsonb, ${JSON.stringify(sourceStatus)}::jsonb) ON CONFLICT (day) DO UPDATE SET digest = EXCLUDED.digest, source_status = EXCLUDED.source_status, updated_at = now()`];
    if (replace) statements.push(sql`DELETE FROM orin_digest_items WHERE day = ${date}`);
    for (const item of items) {
      statements.push(sql`INSERT INTO orin_items (id, item) VALUES (${item.id}, ${JSON.stringify(item)}::jsonb) ON CONFLICT (id) DO UPDATE SET item = EXCLUDED.item || CASE WHEN orin_items.item ? 'feedback' THEN jsonb_build_object('feedback', orin_items.item->'feedback') ELSE '{}'::jsonb END, updated_at = now()`);
      statements.push(sql`INSERT INTO orin_digest_items (day, item_id) VALUES (${date}, ${item.id}) ON CONFLICT DO NOTHING`);
    }
    await sql.transaction(statements);
    const members = (await sql`SELECT count(*)::int AS n FROM orin_digest_items WHERE day = ${date}`)[0]?.n ?? items.length;
    return res.status(200).json({ count: items.length, skipped, added: Math.max(0, members - before), members, date, mode: replace ? 'replace' : 'merge' });
  } catch (error) { return sendError(res, error); }
}
