import { orinSql, privateResponse, requireIngestToken, sendError } from '../../apps/portfolio/server/orin.js';

// Worker-only endpoint: the existing ingestion bearer token never reaches the browser.
export default async function handler(req, res) {
  privateResponse(res);
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  try {
    requireIngestToken(req);
    const sql = await orinSql();
    const rows = await sql`SELECT item FROM orin_items WHERE item->>'feedback' IN ('1', '-1') ORDER BY updated_at DESC LIMIT 40`;
    return res.status(200).json({ examples: rows.map(({ item }) => ({ feedback: item.feedback, title: item.title, excerpt: String(item.excerpt || '').slice(0, 600) })) });
  } catch (error) { return sendError(res, error); }
}
