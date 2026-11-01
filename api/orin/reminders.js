import { orinSql, privateResponse, requireOrinOwner, sendError } from '../../apps/portfolio/server/orin.js';
import { validateNoteId, validateReminderCreate, validateReminderPatch } from '../../apps/portfolio/server/orin-notes.js';
import { ensureReminderSchema } from '../../apps/portfolio/server/orin-reminder-schema.js';

async function reminderSql() {
  const sql = await orinSql();
  await ensureReminderSchema(sql);
  return sql;
}

// Daily reminders for the ORIN owner. The browser schedules the notifications;
// this table is the durable source of truth, so reloads and other devices stay
// in sync. `last_fired_at` records when the browser actually rang, which keeps
// the same reminder from firing twice in one session.
export default async function handler(req, res) {
  privateResponse(res);
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await requireOrinOwner(req, req.method !== 'GET');
    // Column lists repeat intentionally: tagged templates bind interpolated
    // strings as parameters, so SQL fragments stay written out inline.
    if (req.method === 'GET') {
      const sql = await reminderSql();
      const rows = await sql`SELECT id, label, to_char(time_of_day, 'HH24:MI') AS time, days, due_date::text AS "dueDate", enabled, last_fired_at AS "lastFiredAt", created_at AS "createdAt" FROM orin_reminders ORDER BY enabled DESC, due_date NULLS LAST, time_of_day, created_at`;
      return res.status(200).json({ reminders: rows });
    }
    if (req.method === 'POST') {
      const create = validateReminderCreate(req.body || {});
      const sql = await reminderSql();
      const [reminder] = await sql`
        INSERT INTO orin_reminders (label, time_of_day, days, due_date, enabled)
        VALUES (${create.label}, ${create.time}::time, ${JSON.stringify(create.days)}::jsonb, ${create.dueDate}::date, ${create.enabled})
        RETURNING id, label, to_char(time_of_day, 'HH24:MI') AS time, days, due_date::text AS "dueDate", enabled, last_fired_at AS "lastFiredAt", created_at AS "createdAt"`;
      return res.status(201).json({ reminder });
    }
    if (req.method === 'DELETE') {
      const id = validateNoteId(req.query?.id);
      const sql = await orinSql();
      const [removed] = await sql`DELETE FROM orin_reminders WHERE id = ${id} RETURNING id`;
      if (!removed) return res.status(404).json({ error: 'Reminder not found' });
      return res.status(200).json({ deleted: removed.id });
    }
    const patch = validateReminderPatch(req.body || {});
    const sql = await reminderSql();
    const [reminder] = await sql`
      UPDATE orin_reminders SET
        label = COALESCE(${patch.label ?? null}, label),
        time_of_day = COALESCE(${patch.time ?? null}::time, time_of_day),
        days = COALESCE(${patch.days === undefined ? null : JSON.stringify(patch.days)}::jsonb, days),
        due_date = CASE WHEN ${patch.dueDate === undefined ? null : true}::boolean THEN ${patch.dueDate ?? null}::date ELSE due_date END,
        enabled = COALESCE(${patch.enabled === undefined ? null : patch.enabled}::boolean, enabled),
        last_fired_at = COALESCE(${patch.firedAt === undefined ? null : patch.firedAt}::timestamptz, last_fired_at),
        updated_at = now()
      WHERE id = ${patch.id}
      RETURNING id, label, to_char(time_of_day, 'HH24:MI') AS time, days, due_date::text AS "dueDate", enabled, last_fired_at AS "lastFiredAt", created_at AS "createdAt"`;
    if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
    return res.status(200).json({ reminder });
  } catch (error) { return sendError(res, error); }
}
