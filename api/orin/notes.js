import { orinSql, privateResponse, requireOrinOwner, sendError } from '../../apps/portfolio/server/orin.js';
import {
  MAX_NOTE_VERSIONS, VERSION_SNAPSHOT_MINUTES, noteExcerpt, noteWordCount,
  validateNoteId, validateNotePatch, validateNoteTitle
} from '../../apps/portfolio/server/orin-notes.js';

// Private owner notes. Documents live in orin_notes and every settled state is
// copied into orin_note_versions so the editor can browse and restore history,
// Google Docs style. Single owner, no sharing surface, by design.
export default async function handler(req, res) {
  privateResponse(res);
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await requireOrinOwner(req, req.method !== 'GET');
    if (req.method === 'GET') {
      const id = req.query?.id;
      if (id) {
        validateNoteId(id);
        const sql = await orinSql();
        const [note] = await sql`SELECT id, title, content, word_count AS "wordCount", created_at AS "createdAt", updated_at AS "updatedAt" FROM orin_notes WHERE id = ${id}`;
        if (!note) return res.status(404).json({ error: 'Note not found' });
        const versions = await sql`SELECT id, title, reason, content, word_count AS "wordCount", created_at AS "createdAt" FROM orin_note_versions WHERE note_id = ${id} ORDER BY created_at DESC LIMIT ${MAX_NOTE_VERSIONS}`;
        return res.status(200).json({
          note,
          versions: versions.map(({ content, ...version }) => ({ ...version, excerpt: noteExcerpt(content) }))
        });
      }
      const sql = await orinSql();
      const rows = await sql`SELECT id, title, content, word_count AS "wordCount", created_at AS "createdAt", updated_at AS "updatedAt" FROM orin_notes ORDER BY updated_at DESC LIMIT 200`;
      // Content is only needed for excerpts here; drop it before responding.
      return res.status(200).json({ notes: rows.map(({ content, ...note }) => ({ ...note, excerpt: noteExcerpt(content) })) });
    }
    if (req.method === 'POST') {
      const title = validateNoteTitle(req.body?.title) ?? '';
      const sql = await orinSql();
      const [note] = await sql`INSERT INTO orin_notes (title) VALUES (${title}) RETURNING id, title, content, word_count AS "wordCount", created_at AS "createdAt", updated_at AS "updatedAt"`;
      return res.status(201).json({ note });
    }
    if (req.method === 'DELETE') {
      const id = validateNoteId(req.query?.id);
      const sql = await orinSql();
      const [removed] = await sql`DELETE FROM orin_notes WHERE id = ${id} RETURNING id`;
      if (!removed) return res.status(404).json({ error: 'Note not found' });
      return res.status(200).json({ deleted: removed.id });
    }
    // PATCH: autosaves and restores share one endpoint. Restores are recorded
    // as their own version so the timeline stays a complete, honest history.
    const patch = validateNotePatch(req.body || {});
    const sql = await orinSql();
    const [note] = await sql`SELECT id, title, content, word_count AS "wordCount" FROM orin_notes WHERE id = ${patch.id}`;
    if (!note) return res.status(404).json({ error: 'Note not found' });
    if (patch.restoreVersionId) {
      const [version] = await sql`SELECT id, title, content FROM orin_note_versions WHERE id = ${patch.restoreVersionId} AND note_id = ${patch.id}`;
      if (!version) return res.status(404).json({ error: 'Version not found' });
      const [updated] = await sql`
        UPDATE orin_notes SET
          title = ${version.title}, content = ${version.content},
          word_count = ${noteWordCount(version.content)}, updated_at = now()
        WHERE id = ${patch.id}
        RETURNING id, title, content, word_count AS "wordCount", created_at AS "createdAt", updated_at AS "updatedAt"
      `;
      await sql`INSERT INTO orin_note_versions (note_id, title, content, word_count, reason) VALUES (${patch.id}, ${version.title}, ${version.content}, ${noteWordCount(version.content)}, 'restore')`;
      return res.status(200).json({ note: updated, restored: version.id });
    }
    const title = patch.title ?? note.title;
    const content = patch.content ?? note.content;
    const [updated] = await sql`
      UPDATE orin_notes SET title = ${title}, content = ${content},
        word_count = COALESCE(${patch.wordCount ?? null}::integer, word_count), updated_at = now()
      WHERE id = ${patch.id}
      RETURNING id, title, content, word_count AS "wordCount", created_at AS "createdAt", updated_at AS "updatedAt"
    `;
    // Snapshot the document only when history is meaningful, and keep the last
    // MAX_NOTE_VERSIONS rows so the table cannot grow without bound.
    if (patch.content !== undefined) {
      const [lastVersion] = await sql`SELECT created_at, content FROM orin_note_versions WHERE note_id = ${patch.id} ORDER BY created_at DESC LIMIT 1`;
      const minutesSince = lastVersion ? (Date.now() - new Date(lastVersion.created_at).getTime()) / 60_000 : Infinity;
      const changed = lastVersion ? lastVersion.content !== content : true;
      if (!lastVersion || patch.snapshot === true || (changed && minutesSince >= VERSION_SNAPSHOT_MINUTES)) {
        await sql`INSERT INTO orin_note_versions (note_id, title, content, word_count, reason) VALUES (${patch.id}, ${title}, ${content}, ${noteWordCount(content)}, 'save')`;
        await sql`DELETE FROM orin_note_versions WHERE note_id = ${patch.id} AND created_at < (SELECT created_at FROM orin_note_versions WHERE note_id = ${patch.id} ORDER BY created_at DESC LIMIT 1 OFFSET ${MAX_NOTE_VERSIONS})`;
      }
    }
    return res.status(200).json({ note: updated });
  } catch (error) { return sendError(res, error); }
}
