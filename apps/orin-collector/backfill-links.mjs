#!/usr/bin/env node
// Repair the archive that was imported from chat before the collector existed.
// Those days were stored as a list of shared links: 1,100+ items carry a
// transport label ("YouTube Video", "Shared Google Link") instead of a title and
// 5,500+ have an empty body. This script reads what each link actually says
// about itself, writes the recovered title/description back, lets a cheap model
// name whatever could not be read, and rewrites each affected day's digest.
//
// Runs are idempotent: items already stamped with `enrichment` are skipped unless
// --refresh is passed, and only missing or placeholder fields are replaced, so
// owner edits, feedback and categories are never touched.
import { parseArgs } from 'node:util';
import { enrichmentPatch, isPlaceholderTitle, needsEnrichment, publicHttpUrl } from './link-meta.mjs';
import { createBrowserResolver, enrichWithBrowserFallback, isJsOnlyShareLink } from './browser-resolve.mjs';
import { EXPAND_DEFAULTS, expandBatch, rewriteDayDigest } from './archive-expand.mjs';

const { values } = parseArgs({ options: {
  limit: { type: 'string', default: '400' },
  concurrency: { type: 'string', default: '6' },
  batch: { type: 'string', default: String(EXPAND_DEFAULTS.batchSize) },
  'model-concurrency': { type: 'string', default: '4' },
  'digest-concurrency': { type: 'string', default: '3' },
  model: { type: 'string', default: EXPAND_DEFAULTS.model },
  from: { type: 'string' },
  to: { type: 'string' },
  hosts: { type: 'string' },
  timeout: { type: 'string', default: '15000' },
  all: { type: 'boolean' },
  refresh: { type: 'boolean' },
  'browser-resolve': { type: 'boolean' },
  'no-llm': { type: 'boolean' },
  'no-digest': { type: 'boolean' },
  'digests-only': { type: 'boolean' },
  'dry-run': { type: 'boolean' },
  'keychain-openrouter': { type: 'boolean' },
} });

function boundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
}

function isoDay(name, value) {
  if (value === undefined) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`--${name} must be a YYYY-MM-DD date`);
  return value;
}

async function resolveApiKey({ keychainOpenrouter }) {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  if (!keychainOpenrouter) throw new Error('Set OPENROUTER_API_KEY or pass --keychain-openrouter to read it from the macOS Keychain');
  if (process.platform !== 'darwin') throw new Error('Keychain is only available on macOS; export OPENROUTER_API_KEY instead');
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync('/usr/bin/security', ['find-generic-password', '-s', 'openrouter-api-key', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (result.status !== 0) throw new Error('Unable to read OpenRouter key from Keychain');
  const key = result.stdout.trim();
  if (!key) throw new Error('Keychain entry openrouter-api-key is empty');
  return key;
}

async function mapPool(rows, limit, worker) {
  const results = new Array(rows.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, rows.length) }, async () => {
    while (cursor < rows.length) {
      const index = cursor++;
      results[index] = await worker(rows[index], index);
    }
  }));
  return results;
}

const CHAT_AUTHOR = /^WhatsApp\b/i;

// PostgreSQL rejects unpaired surrogate escapes in JSONB. JSON.stringify only
// emits them for lone surrogates, so removing those escapes is lossless.
const jsonLiteral = value => JSON.stringify(value).replace(/\\u(?:d[89a-f][0-9a-f]{2}|0000)/gi, '');

// Merge one patch into each item JSONB. `||` keeps feedback, read/saved state and
// categories that the patch does not name, and the returned ids prove the write
// actually landed on the row it was built for.
async function writePatches(sql, patches) {
  let applied = 0, failed = 0;
  const update = row => sql`UPDATE orin_items SET item = item || ${jsonLiteral(row.patch)}::jsonb, updated_at = now() WHERE id = ${row.id} RETURNING id`;
  for (let index = 0; index < patches.length; index += 40) {
    const chunk = patches.slice(index, index + 40);
    if (chunk.some(row => typeof row.id !== 'string' || !row.id)) throw new Error('Refusing to write a patch without an item id');
    try {
      applied += (await sql.transaction(chunk.map(update))).flat().length;
    } catch (error) {
      // One bad row must not discard a whole run's work: retry the chunk singly
      // and keep everything that writes cleanly.
      console.info(`  batch write failed (${error.message}); retrying items individually`);
      for (const row of chunk) {
        try { applied += (await update(row)).length; }
        catch (itemError) { failed++; console.info(`  skipped ${row.id}: ${itemError.message}`); }
      }
    }
  }
  if (failed) console.info(`  ${failed} item(s) could not be written`);
  return applied;
}

// The item JSONB carries no row id, so the database id is passed in explicitly;
// a model response must never be written back against an undefined key.
function evidence(item, id) {
  if (typeof id !== 'string' || !id) throw new Error('Evidence needs the stored item id');
  const enrichment = item.enrichment || {};
  return {
    id, url: item.url,
    ...(item.resolvedUrl ? { resolvedUrl: item.resolvedUrl } : {}),
    title: item.title,
    originalTitle: enrichment.originalTitle || '',
    // Boilerplate written by an earlier pass is not evidence; only page text is.
    pageTitle: enrichment.via === 'page' ? item.title : '',
    pageDescription: enrichment.via === 'page' ? item.excerpt : '',
    ...(item.author && !CHAT_AUTHOR.test(item.author) ? { author: item.author } : {}),
    ...(item.category ? { category: item.category } : {}),
    via: enrichment.via || 'fallback',
  };
}

async function main() {
  const databaseUrl = process.env.ORIN_DATABASE_URL;
  if (!databaseUrl) throw new Error('Set ORIN_DATABASE_URL; the script only reads and rewrites archived items and digests');
  const limit = boundedInt(values.limit, 400, 1, 5000);
  const concurrency = boundedInt(values.concurrency, 6, 1, 24);
  const batchSize = boundedInt(values.batch, EXPAND_DEFAULTS.batchSize, 1, 40);
  const modelConcurrency = boundedInt(values['model-concurrency'], 4, 1, 8);
  const digestConcurrency = boundedInt(values['digest-concurrency'], 3, 1, 6);
  const timeoutMs = boundedInt(values.timeout, 15_000, 2000, 60_000);
  const from = isoDay('from', values.from), to = isoDay('to', values.to);
  const model = values.model;
  const dryRun = Boolean(values['dry-run']);
  const useModel = !values['no-llm'] && !dryRun;
  const useDigest = !values['no-digest'] && !dryRun;
  // Digests are rebuilt on demand: an item pass can skip them so a long archive
  // run never pays for the same 90 days on every batch.
  const digestsOnly = Boolean(values['digests-only']) && !dryRun;
  // A dry run never needs a key: it prints exactly what would be written.
  const apiKey = useModel || useDigest ? await resolveApiKey({ keychainOpenrouter: values['keychain-openrouter'] }) : null;
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(databaseUrl);
  const rows = digestsOnly ? [] : await sql`
    SELECT id, item FROM orin_items
    WHERE (${Boolean(values.refresh)}::boolean
        OR NOT (item ? 'enrichment')
        OR (coalesce(item->'enrichment'->>'confidence', '') <> 'high' AND item->'enrichment'->'llm' IS NULL))
      AND (${from}::text IS NULL OR substring(coalesce(item->>'publishedAt', item->>'collectedAt', '') for 10) >= ${from}::text)
      AND (${to}::text IS NULL OR substring(coalesce(item->>'publishedAt', item->>'collectedAt', '') for 10) <= ${to}::text)
    ORDER BY substring(coalesce(item->>'publishedAt', item->>'collectedAt', '') for 10) DESC NULLS LAST, updated_at DESC
  `;
  // --hosts scopes a run to one platform, which is how a new resolver (for
  // example the browser for Google share links) is applied to items an earlier
  // pass already stamped.
  const hosts = values.hosts ? new Set(values.hosts.split(',').map(host => host.trim().toLowerCase().replace(/^www\./, '')).filter(Boolean)) : null;
  const onHost = row => {
    if (!hosts) return true;
    try { return hosts.has(new URL(row.item.url).hostname.toLowerCase().replace(/^www\./, '')); } catch { return false; }
  };
  const targets = rows.filter(row => onHost(row) && (values.all || needsEnrichment(row.item) || Boolean(values.refresh))).slice(0, limit);
  if (digestsOnly) console.info(`Archive repair: rebuilding every imported chat digest${dryRun ? ' (dry run)' : ''}.`);
  else console.info(`Archive repair: ${targets.length} item(s) selected out of ${rows.length} candidate(s)${dryRun ? ' (dry run)' : ''}; concurrency ${concurrency}.`);
  if (!targets.length && !digestsOnly) return;

  // Google share links only resolve inside a browser; launch one only when the
  // selected batch actually contains such a link.
  const resolver = values['browser-resolve'] && targets.some(row => isJsOnlyShareLink(row.item.url)) ? await createBrowserResolver() : null;
  if (resolver) console.info(`Browser resolver enabled for ${targets.filter(row => isJsOnlyShareLink(row.item.url)).length} Google app-shell link(s).`);
  let completed = 0, enriched = 0, unreadable = 0;
  let results;
  try {
    results = await mapPool(targets, concurrency, async row => {
      try {
        const result = await enrichWithBrowserFallback(row.item, { resolver, timeoutMs });
        if (result.enrichment.confidence === 'low') unreadable++;
        return { id: row.id, item: row.item, result, patch: enrichmentPatch(row.item, result, { refresh: Boolean(values.refresh) }) };
      } catch (error) {
        return { id: row.id, item: row.item, error: error.message };
      } finally {
        completed++;
        if (completed % 25 === 0 || completed === targets.length) console.info(`  read ${completed}/${targets.length} links`);
      }
    });
  } finally { await resolver?.close(); }
  const patches = results.filter(row => row.patch);
  enriched = patches.filter(row => row.result.enrichment.via !== 'fallback').length;
  for (const failure of results.filter(row => row.error).slice(0, 5)) console.info(`  skipped ${failure.item.url}: ${failure.error}`);
  console.info(`Recovered readable metadata for ${enriched} item(s); ${unreadable} link(s) could not be read.`);
  if (dryRun) {
    for (const row of patches.slice(0, 12)) console.info(`  ${row.item.url}\n    title: ${row.patch.title || row.item.title}\n    excerpt: ${row.patch.excerpt || row.item.excerpt}`);
    console.info(`Dry run: ${patches.length} patch(es) prepared and nothing written${useModel ? '' : '; the model and digest passes are skipped in a dry run'}.`);
    return;
  }
  const applied = await writePatches(sql, patches);
  console.info(`Wrote ${applied}/${patches.length} enriched item(s).`);
  if (applied !== patches.length) console.info('  Some items changed or disappeared while the run was in flight; rerun to pick them up.');
  const touchedIds = patches.map(row => row.id);

  if (useModel && touchedIds.length) {
    const pending = await sql`
      SELECT id, item FROM orin_items
      WHERE id = ANY(${touchedIds}::text[])
        AND coalesce(item->'enrichment'->>'confidence', '') <> 'high'
        AND item->'enrichment'->'llm' IS NULL
      ORDER BY id
    `;
    console.info(`Model pass: ${pending.length} item(s) still have no page description; model ${model}, ${modelConcurrency} batch(es) at a time.`);
    const batches = [];
    for (let index = 0; index < pending.length; index += batchSize) batches.push(pending.slice(index, index + batchSize));
    let failures = 0, tokens = 0, expanded = 0, finished = 0;
    await mapPool(batches, modelConcurrency, async batch => {
      try {
        const response = await expandBatch(batch.map(row => evidence(row.item, row.id)), { apiKey, model });
        const patches = response.items.map(row => {
          const source = batch.find(candidate => candidate.id === row.id);
          if (!source) throw new Error('Model returned an unknown item id');
          const item = source.item;
          const patch = { enrichment: { ...item.enrichment, llm: { model, at: new Date().toISOString() } } };
          if (row.title && !isPlaceholderTitle(row.title, item.url) && row.title !== item.title) patch.title = row.title.slice(0, 500);
          if (row.excerpt && row.excerpt !== item.excerpt) patch.excerpt = row.excerpt.slice(0, 12000);
          return { id: row.id, patch };
        });
        const written = patches.length ? await writePatches(sql, patches) : 0;
        expanded += written;
        tokens += Number(response.usage?.total_tokens || 0);
      } catch (error) {
        failures++;
        console.info(`  expansion batch failed: ${error.message}`);
      } finally {
        finished++;
        if (finished % 5 === 0 || finished === batches.length) console.info(`  expanded ${Math.min(finished * batchSize, pending.length)}/${pending.length}`);
      }
    });
    console.info(`Model pass wrote ${expanded} item(s)${failures ? `; ${failures} batch(es) failed` : ''}; ${tokens.toLocaleString()} tokens.`);
  }

  if (useDigest && (touchedIds.length || digestsOnly)) {
    const days = digestsOnly
      ? await sql`SELECT day::text AS day FROM orin_digests
          WHERE digest->>'title' LIKE 'WhatsApp chat%'
            AND (${from}::text IS NULL OR day >= ${from}::date)
            AND (${to}::text IS NULL OR day <= ${to}::date)
          ORDER BY day DESC`
      : await sql`SELECT DISTINCT day::text AS day FROM orin_digest_items WHERE item_id = ANY(${touchedIds}::text[]) ORDER BY day DESC`;
    let rewritten = 0, skipped = 0;
    await mapPool(days, digestConcurrency, async ({ day: date }) => {
      try {
        const [entry] = await sql`SELECT digest FROM orin_digests WHERE day = ${date}`;
        const dayRows = await sql`SELECT i.item FROM orin_items i JOIN orin_digest_items d ON d.item_id = i.id WHERE d.day = ${date} ORDER BY i.item->>'publishedAt'`;
        const items = dayRows.map(row => row.item).filter(item => publicHttpUrl(item.url));
        // Only imported chat days are rebuilt here; a collector digest has its own
        // ranking and topic context that this archive prompt would flatten.
        const chatDay = String(entry?.digest?.title || '').startsWith('WhatsApp chat') || dayRows.filter(row => CHAT_AUTHOR.test(String(row.item.author || ''))).length > dayRows.length / 2;
        if (!items.length || !chatDay) { skipped++; return; }
        const { digest } = await rewriteDayDigest(date, items, { apiKey, model, title: entry?.digest?.title });
        const merged = { ...digest, ...(entry?.digest?.title ? { title: entry.digest.title } : {}) };
        const status = { status: 'ok', message: `Archive digest rebuilt from ${items.length} enriched items.`, model };
        await sql`UPDATE orin_digests SET digest = ${jsonLiteral(merged)}::jsonb, digest_status = ${jsonLiteral(status)}::jsonb, updated_at = now() WHERE day = ${date}`;
        rewritten++;
        console.info(`  ${date}: digest rebuilt around ${digest.groups.length} group(s) covering ${digest.itemCount} item(s)`);
      } catch (error) {
        skipped++;
        console.info(`  ${date}: digest kept (${error.message})`);
      }
    });
    console.info(`Digests rewritten for ${rewritten} day(s)${skipped ? `; ${skipped} day(s) left unchanged` : ''}.`);
  }

  console.info('Archive repair complete.');
}

main().catch(error => { console.error(`ORIN archive repair: ${error.message}`); process.exitCode = 1; });
