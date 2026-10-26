import {
  digestItemCount,
  orinSql,
  privateResponse,
  requireIngestToken,
  resolveDigestUpdate,
  sendError,
  suppressPreviousItems,
  validateIngest
} from '../../apps/portfolio/server/orin.js';

export default async function handler(req, res) {
  privateResponse(res);
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  try {
    requireIngestToken(req);
    if (!req.headers['content-type']?.startsWith('application/json')) return res.status(415).json({ error: 'JSON content type required' });
    const payload = validateIngest(req.body);
    const sql = await orinSql();

    const [existingDay] = await sql`SELECT digest, digest_status FROM orin_digests WHERE day = ${payload.date}`;
    const existingMembers = (await sql`SELECT count(*)::int AS n FROM orin_digest_items WHERE day = ${payload.date}`)[0]?.n ?? 0;

    // A zero-item rerun must not erase a day that already has evidence. Source
    // status is intentionally preserved too: the earlier successful run is the
    // best available explanation of what was collected.
    if (!payload.items.length && existingDay && (existingDay.digest || existingMembers > 0)) {
      return res.status(200).json({
        count: 0, skipped: 0, added: 0, members: existingMembers,
        date: payload.date, mode: 'skipped', reason: 'zero-items'
      });
    }

    const previous = payload.items.length ? await sql`SELECT DISTINCT d.item_id, i.item->>'paperId' AS paper_id FROM orin_digest_items d JOIN orin_items i ON i.id = d.item_id WHERE d.day < ${payload.date} AND (d.item_id = ANY(${payload.items.map(item => item.id)}::text[]) OR i.item->>'paperId' = ANY(${payload.items.map(item => item.paperId).filter(Boolean)}::text[]))` : [];
    const { date, items, digest: incomingDigest, digestStatus: incomingDigestStatus, sourceStatus, skipped } = suppressPreviousItems(payload, previous.map(row => row.item_id), previous.map(row => row.paper_id).filter(Boolean));

    const resolution = resolveDigestUpdate(existingDay?.digest || null, incomingDigest, { replaceDigest: payload.replaceDigest });
    const digest = resolution.digest;
    let digestStatus = incomingDigestStatus;
    if (resolution.preserved) {
      digestStatus = {
        status: 'preserved',
        message: resolution.reason === 'empty-digest'
          ? 'Kept the existing digest because this run had no replacement digest.'
          : `Kept the existing digest (${digestItemCount(resolution.digest)} cited items) because this run covered fewer.`
      };
    } else if (digest && !digestStatus) {
      digestStatus = {
        status: 'ok',
        message: `Digest published with ${digestItemCount(digest)} cited items.`,
        ...(digest.model ? { model: digest.model } : {})
      };
    }

    // Membership is additive by default. A partial run (blocked source, spent
    // daily cap, model outage) must never erase items an earlier run already
    // published for the same day. `replace: true` opts back into a full swap for
    // deliberate corrections.
    const replace = payload.replace === true;
    const statements = [
      sql`INSERT INTO orin_digests (day, digest, digest_status, source_status)
        VALUES (${date}, ${JSON.stringify(digest)}::jsonb, ${JSON.stringify(digestStatus)}::jsonb, ${JSON.stringify(sourceStatus)}::jsonb)
        ON CONFLICT (day) DO UPDATE SET digest = EXCLUDED.digest, digest_status = EXCLUDED.digest_status, source_status = EXCLUDED.source_status, updated_at = now()`
    ];
    if (replace) statements.push(sql`DELETE FROM orin_digest_items WHERE day = ${date}`);
    if (items.length) {
      const itemRows = items.map(item => ({ id: item.id, item }));
      // Two bulk statements replace the former two statements per item. The
      // merge preserves owner feedback and user-assigned/tombstoned categories.
      statements.push(sql`
        INSERT INTO orin_items (id, item)
        SELECT row.id, row.item
        FROM jsonb_to_recordset(${JSON.stringify(itemRows)}::jsonb) AS row(id text, item jsonb)
        ON CONFLICT (id) DO UPDATE SET item = CASE WHEN orin_items.item->>'source' = 'shared' THEN orin_items.item ELSE (
          CASE
            WHEN orin_items.item->>'categorySource' = 'user' AND NOT (orin_items.item ? 'category')
              THEN EXCLUDED.item - 'category'
            ELSE EXCLUDED.item
          END
        ) || jsonb_strip_nulls(jsonb_build_object(
          'deleted', orin_items.item->'deleted',
          'title', CASE WHEN orin_items.item->>'titleSource' = 'user' THEN orin_items.item->'title' ELSE NULL END,
          'titleSource', CASE WHEN orin_items.item->>'titleSource' = 'user' THEN orin_items.item->'titleSource' ELSE NULL END,
          'feedback', orin_items.item->'feedback',
          'category', CASE
            WHEN orin_items.item->>'categorySource' = 'user' AND orin_items.item ? 'category'
              THEN orin_items.item->'category'
            ELSE NULL
          END,
          'categorySource', CASE
            WHEN orin_items.item->>'categorySource' = 'user'
              THEN orin_items.item->'categorySource'
            ELSE NULL
          END
        )) END, updated_at = now()
      `);
      statements.push(sql`
        INSERT INTO orin_digest_items (day, item_id)
        SELECT ${date}::date, row.id
        FROM jsonb_to_recordset(${JSON.stringify(items.map(item => ({ id: item.id })))}::jsonb) AS row(id text)
        ON CONFLICT DO NOTHING
      `);
    }

    await sql.transaction(statements);
    const members = (await sql`SELECT count(*)::int AS n FROM orin_digest_items WHERE day = ${date}`)[0]?.n ?? items.length;
    return res.status(200).json({
      count: items.length,
      skipped,
      added: Math.max(0, members - existingMembers),
      members,
      date,
      mode: replace ? 'replace' : 'merge',
      digestPreserved: resolution.preserved,
      digestItems: digestItemCount(digest)
    });
  } catch (error) { return sendError(res, error); }
}
