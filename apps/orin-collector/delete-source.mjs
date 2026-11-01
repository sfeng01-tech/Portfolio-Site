#!/usr/bin/env node
// Soft-delete ORIN items from the database by source or feed URL.
//
// Every matching row keeps its feedback, read/saved state and categories: only
// `deleted: true` is merged into the item JSONB, mirroring the soft-delete flag
// the ask/research indexers already respect. Derived embeddings and ask chunks
// are removed so deleted items vanish from search immediately; both rebuild on
// the next indexing run. Nothing is physically deleted, so a run is reversible
// by removing the flag with --undo.
//
// Usage:
//   ORIN_DATABASE_URL=... node delete-source.mjs --list
//   node delete-source.mjs --source hackernews [--dry-run] [--undo]
//   node delete-source.mjs --url "https://..."          # one feed's items
//   node delete-source.mjs --host x.com                 # every item from a host
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

export function filterPredicate({ source, url, host }) {
  if (Boolean(source) + Boolean(url) + Boolean(host) > 1) return null;
  const hostname = host ? String(host).trim().toLowerCase().replace(/^www\./, '') : null;
  const target = url ? String(url).trim().toLowerCase().replace(/\/+$/, '') : null;
  const feedSource = source ? String(source).trim() : null;
  return {
    kind: feedSource ? 'source' : target ? 'url' : 'host',
    value: feedSource || target || hostname,
    matches(item) {
      if (feedSource) return item.source === feedSource;
      let itemUrl;
      try { itemUrl = new URL(item.url).href.toLowerCase(); } catch { return false; }
      if (target) return itemUrl === target || itemUrl.startsWith(`${target}/`);
      try { return new URL(itemUrl).hostname.replace(/^www\./, '') === hostname; } catch { return false; }
    },
  };
}

function jsonLiteral(value) {
  // PostgreSQL rejects unpaired surrogate escapes in JSONB.
  return JSON.stringify(value).replace(/\\u(?:d[89a-f][0-9a-f]{2}|0000)/gi, '');
}

async function main() {
  const { values } = parseArgs({ options: {
    source: { type: 'string' },
    url: { type: 'string' },
    host: { type: 'string' },
    list: { type: 'boolean' },
    'dry-run': { type: 'boolean' },
    undo: { type: 'boolean' },
    all: { type: 'boolean' },
  } });
  const databaseUrl = process.env.ORIN_DATABASE_URL;
  if (!databaseUrl) throw new Error('Set ORIN_DATABASE_URL; the script only edits item flags and derived indexes');
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(databaseUrl);

  if (values.list) {
    const rows = await sql`
      SELECT item->>'source' AS source, count(*) AS items,
             count(*) FILTER (WHERE COALESCE((item->>'deleted')::boolean, false)) AS deleted
      FROM orin_items GROUP BY 1 ORDER BY items DESC`;
    console.info('Source            items   soft-deleted');
    for (const row of rows) console.info(`${String(row.source || '(unknown)').padEnd(18)}${String(row.items).padStart(5)}   ${row.deleted}`);
    return;
  }

  if (!values.all && !values.source && !values.url && !values.host) {
    throw new Error('Pass --list, or one of --source, --url, --host (or --all) to select items');
  }
  const predicate = values.all ? null : filterPredicate(values);
  if (values.all && (values.source || values.url || values.host)) throw new Error('--all cannot be combined with --source, --url, or --host');
  if (predicate && !predicate.value) throw new Error('The selected filter is empty');

  const rows = values.all
    ? await sql`SELECT id, item FROM orin_items WHERE COALESCE((item->>'deleted')::boolean, false) <> ${!values.undo} ORDER BY id`
    : await sql`SELECT id, item FROM orin_items`;
  const targets = rows.filter(row => predicate ? predicate.matches(row.item) : true);
  if (!targets.length) {
    console.info(`ORIN delete: 0 item(s) match ${values.all ? '--all' : `${predicate.kind}=${predicate.value}`}; nothing to do.`);
    return;
  }
  console.info(`ORIN delete: ${targets.length} item(s) match ${values.all ? '--all' : `${predicate.kind}=${predicate.value}`} with ${values.undo ? '--undo' : '--delete'}${values['dry-run'] ? ' (dry run)' : ''}.`);
  for (const row of targets.slice(0, 12)) console.info(`  ${row.item.source || '(unknown)'}  ${row.item.url}`);
  if (targets.length > 12) console.info(`  … and ${targets.length - 12} more`);
  if (values['dry-run']) {
    console.info(`Dry run: nothing was written.`);
    return;
  }

  // `||` keeps feedback, read/saved state and categories the patch does not name.
  const patch = jsonLiteral(values.undo ? { deleted: false, deletedAt: null } : { deleted: true, deletedAt: new Date().toISOString() });
  let applied = 0;
  for (let start = 0; start < targets.length; start += 100) {
    const chunk = targets.slice(start, start + 100).map(row => row.id);
    if (chunk.some(id => typeof id !== 'string' || !id)) throw new Error('Refusing to write without an item id');
    applied += (await sql.transaction(chunk.map(id =>
      sql`UPDATE orin_items SET item = item || ${patch}::jsonb, updated_at = now() WHERE id = ${id} RETURNING id`
    ))).flat().length;
  }
  const ids = applied ? targets.map(row => row.id) : [];
  const embeddings = ids.length ? await sql`DELETE FROM orin_research_embeddings WHERE item_id = ANY(${ids}::text[]) RETURNING item_id` : [];
  const chunks = ids.length ? await sql`DELETE FROM orin_chunks WHERE item_id = ANY(${ids}::text[]) RETURNING id` : [];
  console.info(`Soft-${values.undo ? 'restored' : 'deleted'} ${applied} item(s); removed ${embeddings.length} embedding(s) and ${chunks.length} ask chunk(s).`);
  console.info('Undo with the same filter plus --undo.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch(error => { console.error(`ORIN source delete: ${error.message}`); process.exitCode = 1; });
}
