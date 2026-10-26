import { orinSql, privateResponse, requireOrinOwner, sendError, validateCategory } from '../../apps/portfolio/server/orin.js';

export default async function handler(req, res) {
  privateResponse(res);
  if (req.method !== 'PATCH') { res.setHeader('Allow', 'PATCH'); return res.status(405).json({ error: 'Method not allowed' }); }
  try {
    await requireOrinOwner(req, true);
    const { id, read, saved, feedback, category } = req.body || {};
    let parsedCategory;
    if (category !== undefined && category !== null) parsedCategory = validateCategory(category);
    const hasCategory = category !== undefined;
    const setCategory = parsedCategory !== undefined;
    const clearCategory = hasCategory && !setCategory;
    const hasFeedback = feedback !== undefined;
    const feedbackJson = hasFeedback && [-1, 0, 1].includes(feedback) ? feedback : 0;
    if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)
        || (read === undefined && saved === undefined && !hasCategory && !hasFeedback)
        || (read !== undefined && typeof read !== 'boolean') || (saved !== undefined && typeof saved !== 'boolean')
        || (hasFeedback && ![-1, 0, 1].includes(feedback))) return res.status(400).json({ error: 'Invalid item update' });
    const sql = await orinSql();

    // Read/saved toggles are high-frequency. Updating only the boolean columns
    // avoids re-serializing a large item blob and keeps updated_at stable for
    // read changes. Saving still moves an item to the top of the reading list.
    if (!hasCategory && !hasFeedback) {
      const [item] = await sql`UPDATE orin_items SET
        is_read = COALESCE(${read ?? null}::boolean, is_read),
        saved = COALESCE(${saved ?? null}::boolean, saved),
        updated_at = CASE WHEN ${saved !== undefined}::boolean THEN now() ELSE updated_at END
        WHERE id = ${id} RETURNING id, is_read, saved, item`;
      if (!item) return res.status(404).json({ error: 'Item not found' });
      return res.status(200).json({ id: item.id, read: item.is_read, saved: item.saved, feedback: item.item.feedback ?? 0, category: item.item.category ?? null, categorySource: item.item.categorySource ?? null });
    }

    // Set/clear the category and merge feedback in one atomic statement:
    // 1) set a user label + stamp the source, 2) clear the label but keep
    // `categorySource: user` as an owner tombstone (a later ingest must not
    // hand the item back to the model), 3) feedback only, 4) untouched.
    // Feedback and category compose through the reordered jsonb_set branches below.
    const [item] = await sql`UPDATE orin_items SET is_read = COALESCE(${read ?? null}::boolean, is_read), saved = COALESCE(${saved ?? null}::boolean, saved), item = CASE
      WHEN ${setCategory}::boolean THEN jsonb_set(jsonb_set(CASE WHEN ${hasFeedback}::boolean THEN jsonb_set(item, '{feedback}', to_jsonb(${feedbackJson}::integer), true) ELSE item END, '{category}', to_jsonb(${setCategory ? parsedCategory : null}::text), true), '{categorySource}', '"user"'::jsonb, true)
      WHEN ${clearCategory}::boolean THEN jsonb_set((CASE WHEN ${hasFeedback}::boolean THEN jsonb_set(item, '{feedback}', to_jsonb(${feedbackJson}::integer), true) ELSE item END) - 'category', '{categorySource}', '"user"'::jsonb, true)
      WHEN ${hasFeedback}::boolean THEN jsonb_set(item, '{feedback}', to_jsonb(${feedbackJson}::integer), true)
      ELSE item END, updated_at = now() WHERE id = ${id} RETURNING id, is_read, saved, item`;
    if (!item) return res.status(404).json({ error: 'Item not found' });
    return res.status(200).json({ id: item.id, read: item.is_read, saved: item.saved, feedback: item.item.feedback ?? 0, category: item.item.category ?? null, categorySource: item.item.categorySource ?? null });
  } catch (error) { return sendError(res, error); }
}
