import { deleteSourceItems, listSources, normalizeSourceName, purgeDeletedItems } from '../../apps/portfolio/server/orin-source-repo.js';
import { orinSql, privateResponse, requireOrinOwner, sendError } from '../../apps/portfolio/server/orin.js';

export const RETENTION_DAYS = 30;

export default async function handler(req, res) {
  privateResponse(res);
  if (!['GET', 'DELETE'].includes(req.method)) { res.setHeader('Allow', 'GET, DELETE'); return res.status(405).json({ error: 'Method not allowed' }); }
  try {
    await requireOrinOwner(req, req.method === 'DELETE');
    const sql = await orinSql();
    if (req.method === 'GET') {
      const purged = await purgeDeletedItems(sql, RETENTION_DAYS);
      const sources = await listSources(sql);
      return res.status(200).json({ sources, purged: purged.items, retentionDays: RETENTION_DAYS });
    }
    const source = normalizeSourceName(req.body?.source);
    const deleted = await deleteSourceItems(sql, source);
    if (!deleted) return res.status(404).json({ error: 'No visible items found for that source' });
    const purged = await purgeDeletedItems(sql, RETENTION_DAYS);
    return res.status(200).json({ source, deleted, purged: purged.items, retentionDays: RETENTION_DAYS });
  } catch (error) { return sendError(res, error); }
}
