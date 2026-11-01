import { repairYoutubeTitles } from '../../apps/portfolio/server/youtube.js';
import { visibleItems, visibleDigest } from '../../apps/portfolio/server/orin-content.js';
import { orinSql, privateResponse, requireOrinOwner, sendError, validDate, validateCategory } from '../../apps/portfolio/server/orin.js';
import { loadSemanticAffinities } from '../../apps/portfolio/server/orin-semantic-affinity.js';
import { purgeDeletedItems } from '../../apps/portfolio/server/orin-source-repo.js';

const VIDEO_PAGE_SIZE = 24;
// Soft-deleted items are only kept for 30 days; a hard purge then removes them
// together with their derived embeddings and ask chunks. Any owner visit to
// ORIN triggers this, so a daily dashboard visit satisfies the retention
// policy without a new scheduler. The throttle keeps the check at most once an
// hour per server instance and the guard survives serverless reuse.
let lastPurge = 0;
export async function purgeIfDue(sql, retentionDays = 30) {
  if (Date.now() - lastPurge < 60 * 60 * 1000) return { items: 0 };
  try {
    return await purgeDeletedItems(sql, retentionDays);
  } catch {
    // Retention cleanup must never fail the digest view; the next visit retries.
    return { items: 0 };
  } finally { lastPurge = Date.now(); }
}
export function videoListParams(query = {}) {
  const page = query.page === undefined ? 1 : Number(query.page);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || (query.page !== undefined && !/^[1-9]\d*$/.test(query.page))) {
    throw Object.assign(new Error('Invalid video page'), { status: 400 });
  }
  const search = query.q === undefined ? '' : query.q;
  if (typeof search !== 'string' || search.length > 120 || /[\u0000-\u001f]/.test(search)) {
    throw Object.assign(new Error('Invalid video search'), { status: 400 });
  }
  return { page, search: search.trim(), offset: (page - 1) * VIDEO_PAGE_SIZE, pageSize: VIDEO_PAGE_SIZE };
}

export default async function handler(req, res) {
  privateResponse(res);
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  try {
    await requireOrinOwner(req);
    const kind = req.query?.kind;
    if (kind !== undefined && kind !== 'video') return res.status(400).json({ error: 'Invalid kind' });
    const category = req.query?.category ? validateCategory(req.query.category) : null;
    if (!category && req.query?.date !== undefined && !validDate(req.query.date)) return res.status(400).json({ error: 'Invalid date' });
    if (kind === 'video') {
      const { page, search, offset, pageSize } = videoListParams(req.query);
      const sql = await orinSql();
      const [{ total }] = await sql`
        SELECT COUNT(*)::integer AS total FROM orin_items
        WHERE NOT COALESCE((item->>'deleted')::boolean, false) AND (item->>'category' = 'YouTube'
           OR item->>'url' LIKE '%youtube.com/%'
           OR item->>'url' LIKE '%youtu.be/%')
          AND (${search} = '' OR STRPOS(LOWER(CONCAT_WS(' ', item->>'title', item->>'author')), LOWER(${search})) > 0)
      `;
      const rows = await sql`
        SELECT id, item, is_read, saved
        FROM orin_items
        WHERE NOT COALESCE((item->>'deleted')::boolean, false) AND (item->>'category' = 'YouTube'
           OR item->>'url' LIKE '%youtube.com/%'
           OR item->>'url' LIKE '%youtu.be/%')
          AND (${search} = '' OR STRPOS(LOWER(CONCAT_WS(' ', item->>'title', item->>'author')), LOWER(${search})) > 0)
        ORDER BY COALESCE((item->>'publishedAt')::timestamptz, updated_at) DESC, id DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;
      await repairYoutubeTitles(rows, sql);
      return res.status(200).json({
        date: null,
        availableDates: [],
        digest: null,
        digestStatus: null,
        items: visibleItems(rows),
        sourceStatus: [],
        kind,
        page,
        pageSize,
        total
      });
    }
    const sql = await orinSql();
    await purgeIfDue(sql);
    const days = await sql`SELECT day::text FROM orin_digests ORDER BY day DESC LIMIT 90`;
    const availableDates = days.map(row => row.day);
    if (category) {
      const rows = await sql`SELECT id, item, is_read, saved FROM orin_items WHERE NOT COALESCE((item->>'deleted')::boolean, false) AND item->>'category' = ${category} ORDER BY COALESCE((item->>'publishedAt')::timestamptz, updated_at) DESC LIMIT 500`;
      return res.status(200).json({
        date: null,
        availableDates,
        digest: null,
        digestStatus: null,
        items: visibleItems(rows),
        sourceStatus: [],
        category
      });
    }
    const date = req.query?.date || days[0]?.day || null;
    if (!date) return res.status(200).json({ date: null, availableDates, digest: null, items: [], sourceStatus: [] });
    const [entry] = await sql`SELECT digest, digest_status, source_status FROM orin_digests WHERE day = ${date}`;
    const rows = req.query?.saved === 'true'
      ? await sql`SELECT id, item, is_read, saved FROM orin_items WHERE saved = true AND NOT COALESCE((item->>'deleted')::boolean, false) ORDER BY updated_at DESC LIMIT 500`
      : await sql`SELECT i.id, i.item, i.is_read, i.saved FROM orin_items i JOIN orin_digest_items d ON d.item_id = i.id WHERE d.day = ${date} ORDER BY COALESCE((i.item->'ranking'->>'score')::integer, -1) DESC, i.item->>'source', i.item->>'title'`;
    await repairYoutubeTitles(rows, sql);
    const affinities = await loadSemanticAffinities(sql, rows.map(row => row.id));
    for (const row of rows) if (affinities.has(row.id)) row.item = { ...row.item, semanticAffinity: affinities.get(row.id) };
    return res.status(200).json({ date, availableDates, digest: visibleDigest(entry?.digest || null, rows), digestStatus: entry?.digest_status || null, items: visibleItems(rows), sourceStatus: entry?.source_status || [] });
  } catch (error) { return sendError(res, error); }
}
