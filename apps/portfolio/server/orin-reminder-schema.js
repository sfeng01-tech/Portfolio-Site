// The one-date reminder feature added due_date after the original notes and
// reminders tables were installed. Render has the ORIN database credential,
// whereas the daily collector does not. Repair that one additive column when
// an authenticated owner first opens Reminders; never migrate unrelated tables.
export function createReminderSchemaEnsurer() {
  let ready = false;
  let pending = null;

  return async function ensureReminderSchema(sql) {
    if (ready) return;
    if (!pending) {
      pending = (async () => {
        const [column] = await sql`
          SELECT EXISTS (
            SELECT 1 FROM pg_catalog.pg_attribute
            WHERE attrelid = to_regclass('orin_reminders')
              AND attname = 'due_date' AND NOT attisdropped
          ) AS "hasDueDate"`;
        if (!column?.hasDueDate) {
          // IF NOT EXISTS also makes concurrent cold starts safe across hosts.
          await sql`ALTER TABLE orin_reminders ADD COLUMN IF NOT EXISTS due_date date`;
        }
        ready = true;
      })().catch(error => {
        if (error?.code === '42501' || error?.code === '42P01') {
          throw Object.assign(new Error('Reminders need a database schema update.'), { status: 503 });
        }
        throw error;
      }).finally(() => { pending = null; });
    }
    await pending;
  };
}

export const ensureReminderSchema = createReminderSchemaEnsurer();
