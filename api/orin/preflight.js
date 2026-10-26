import { orinSql, privateResponse, requireIngestToken, sendError, validDate } from '../../apps/portfolio/server/orin.js';

// Worker-only preflight. The collector asks which canonical item IDs and paper
// IDs were already delivered on earlier days, so it can avoid paying a model to
// rank and summarize items the server would suppress afterwards.
export default async function handler(req, res) {
  privateResponse(res);
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  try {
    requireIngestToken(req);
    const date = req.query?.date;
    if (!validDate(date)) return res.status(400).json({ error: 'Valid date required' });
    const requestedDays = Number(req.query?.days ?? 30);
    const days = Number.isInteger(requestedDays) ? Math.min(Math.max(requestedDays, 1), 90) : 30;
    const sql = await orinSql();
    const rows = await sql`
      SELECT DISTINCT i.id, i.item->>'paperId' AS paper_id
      FROM orin_digest_items di
      JOIN orin_items i ON i.id = di.item_id
      WHERE di.day < ${date}::date AND di.day >= (${date}::date - ${days}::int)`;
    const itemIds = rows.map(row => row.id);
    const paperIds = [...new Set(rows.map(row => row.paper_id).filter(Boolean))];
    return res.status(200).json({ date, days, itemIds, paperIds, counts: { items: itemIds.length, papers: paperIds.length } });
  } catch (error) { return sendError(res, error); }
}
