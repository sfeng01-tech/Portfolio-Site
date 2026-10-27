import { safeUrl } from './orin.js';

const fail = message => Object.assign(new Error(message), { status: 400 });
export function validateContentEdit(body) {
  const patch = {};
  for (const [key, max] of [['title', 500], ['excerpt', 12000], ['url', 2048]]) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'string' || body[key].length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body[key]) || (key !== 'excerpt' && !body[key].trim())) throw fail(`Invalid ${key}`);
    patch[key] = key === 'url' ? safeUrl(body[key]) : body[key].trim();
  }
  if (patch.title !== undefined) patch.titleSource = 'user';
  return patch;
}

export function visibleItems(rows) {
  return rows.filter(row => !row.item.deleted).map(row => ({ ...row.item, id: row.id ?? row.item.id, read: row.is_read, saved: row.saved }));
}

export function visibleDigest(digest, rows) {
  const removed = new Set(rows.filter(row => row.item.deleted).map(row => row.item.url));
  if (!digest || !removed.size) return digest;
  const groups = (digest.groups || []).map(group => ({ ...group, summary: group.urls.some(url => removed.has(url)) ? '' : group.summary, urls: group.urls.filter(url => !removed.has(url)) })).filter(group => group.urls.length);
  return { ...digest, summary: '', groups, itemCount: new Set(groups.flatMap(group => group.urls)).size };
}

export async function mutateContent(req, res, getSql) {
  const body = req.body || {};
  if (typeof body.id !== 'string' || !/^[a-f0-9]{64}$/.test(body.id)) throw fail('Invalid item id');
  const patch = req.method === 'DELETE' ? {} : validateContentEdit(body);
  if (req.method !== 'DELETE' && !Object.keys(patch).length) throw fail('No content changes supplied');
  const sql = await getSql();
  if (req.method === 'DELETE') {
    const [row] = await sql`UPDATE orin_items SET item = item || '{"deleted":true}'::jsonb, saved = false, updated_at = now() WHERE id = ${body.id} RETURNING id`;
    return row ? res.status(200).json({ id: row.id, deleted: true }) : res.status(404).json({ error: 'Item not found' });
  }
  // All videos support caption edits. Full text and link editing belongs to
  // manual shares; collector-owned source content is otherwise read-only.
  const manualOnly = patch.excerpt !== undefined || patch.url !== undefined;
  const [row] = await sql`UPDATE orin_items SET item = item || ${JSON.stringify(patch)}::jsonb, updated_at = now()
    WHERE id = ${body.id} AND NOT COALESCE((item->>'deleted')::boolean, false)
      AND (item->>'source' = 'shared' OR (NOT ${manualOnly}::boolean AND (item->>'url' ~ '^https://(www[.]|m[.]|music[.])?youtube[.]com/' OR item->>'url' ~ '^https://youtu[.]be/')))
    RETURNING id, item, is_read, saved`;
  return row ? res.status(200).json({ item: { ...row.item, id: row.id ?? body.id, read: row.is_read, saved: row.saved } }) : res.status(404).json({ error: 'Editable item not found' });
}
