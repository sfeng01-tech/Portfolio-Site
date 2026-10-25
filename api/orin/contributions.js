import { orinSql, privateResponse, requireOrinOwner, safeUrl, sendError, validDate, validateCategory, itemId } from '../../apps/portfolio/server/orin.js';

const localDay = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: process.env.ORIN_TIMEZONE || 'America/Los_Angeles'
}).format(new Date());

export default async function handler(req, res) {
  privateResponse(res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await requireOrinOwner(req, true);
    const body = req.body || {};
    const canonicalUrl = safeUrl(body.url);
    if (body.date !== undefined && body.date !== null && !validDate(body.date)) return res.status(400).json({ error: 'Invalid date' });
    const day = validDate(body.date) ? body.date : localDay();
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') return res.status(400).json({ error: 'Invalid note' });
    if (day > localDay()) return res.status(400).json({ error: 'Digest date cannot be in the future' });
    if (note.length > 4000) return res.status(400).json({ error: 'Note is too long' });

    const sql = await orinSql();
    let category = null;
    if (body.category !== undefined && body.category !== null && body.category !== '') {
      category = validateCategory(body.category);
      const [existing] = await sql`SELECT label FROM orin_categories WHERE lower(label) = lower(${category}) LIMIT 1`;
      if (!existing) return res.status(404).json({ error: 'Unknown category' });
      category = existing.label;
    }

    const id = itemId(canonicalUrl);
    const hostname = new URL(canonicalUrl).hostname.replace(/^www\./, '');
    const now = new Date().toISOString();
    const item = {
      id,
      source: 'shared',
      url: canonicalUrl,
      title: `Shared link from ${hostname}`,
      excerpt: note || 'Added from the Share tab for review.',
      author: 'You',
      publishedAt: now,
      collectedAt: now,
      contribution: { kind: 'url', sharedBy: 'you', ...(note ? { note } : {}) },
      topics: category ? [category] : [],
      ...(category ? { category, categorySource: 'user' } : {})
    };

    const [existingItem] = await sql`SELECT id FROM orin_items WHERE id = ${id}`;
    await sql.transaction([
      sql`INSERT INTO orin_digests (day, digest, source_status) VALUES (${day}, NULL::jsonb, '[]'::jsonb) ON CONFLICT (day) DO NOTHING`,
      ...(existingItem ? [] : [sql`INSERT INTO orin_items (id, item) VALUES (${id}, ${JSON.stringify(item)}::jsonb)`]),
      sql`INSERT INTO orin_digest_items (day, item_id) VALUES (${day}, ${id}) ON CONFLICT DO NOTHING`
    ]);
    return res.status(existingItem ? 200 : 201).json({ id, date: day, url: canonicalUrl, category, existed: Boolean(existingItem) });
  } catch (error) {
    return sendError(res, error);
  }
}
