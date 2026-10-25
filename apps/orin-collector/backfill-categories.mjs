#!/usr/bin/env node
// One-off maintenance pass: give every artifact without a category a
// model-assigned label from the editable taxonomy. Items that already carry a
// category are untouched, and the assignment is applied only while the label is
// still missing, so owner edits made during the run are never clobbered.
import { parseArgs } from 'node:util';
import { boundedText } from './sources.mjs';
import { categorizeBatch, CATEGORY_DEFAULTS } from './categorize.mjs';

const { values } = parseArgs({ options: {
  limit: { type: 'string', default: '400' },
  batch: { type: 'string', default: '30' },
  model: { type: 'string' },
  'dry-run': { type: 'boolean' },
  'keychain-openrouter': { type: 'boolean' },
} });

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

async function main() {
  const databaseUrl = process.env.ORIN_DATABASE_URL;
  if (!databaseUrl) throw new Error('Set ORIN_DATABASE_URL; the script touches only category fields');
  const apiKey = await resolveApiKey({ keychainOpenrouter: values['keychain-openrouter'] });
  const limit = Math.min(Math.max(Number.parseInt(values.limit, 10) || 400, 1), 2000);
  const batchSize = Math.min(Math.max(Number.parseInt(values.batch, 10) || CATEGORY_DEFAULTS.batchSize, 5), 60);
  const model = values.model || CATEGORY_DEFAULTS.model;
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(databaseUrl);
  const taxonomyRows = await sql`SELECT label FROM orin_categories ORDER BY label`;
  const categories = taxonomyRows.map(row => row.label);
  if (!categories.length) throw new Error('Taxonomy is empty; add categories in the ORIN UI or seed orin_categories first');
  const pending = await sql`SELECT id, item->>'title' AS title, item->>'excerpt' AS excerpt FROM orin_items WHERE item->>'category' IS NULL ORDER BY updated_at DESC LIMIT ${limit}`;
  console.info(`Taxonomy: ${categories.join(', ')}`);
  console.info(`${pending.length} item(s) without a category, up to ${limit}; model ${model}${values['dry-run'] ? ' (dry run)' : ''}.`);
  let tagged = 0;
  for (let index = 0; index < pending.length; index += batchSize) {
    const batch = pending.slice(index, index + batchSize);
    const assignments = await categorizeBatch(batch, categories, { apiKey, model });
    if (values['dry-run']) {
      const titles = new Map(batch.map(item => [item.id, item.title]));
      for (const row of assignments) console.info(`  ${titles.get(row.id) || row.id} → ${row.category}`);
    }
    if (!values['dry-run']) {
      await sql.transaction(assignments.map(row => sql`UPDATE orin_items SET item = jsonb_set(jsonb_set(item, '{category}', to_jsonb(${row.category}::text), true), '{categorySource}', '"model"'::jsonb, true), updated_at = now() WHERE id = ${row.id} AND item->>'category' IS NULL`));
    }
    tagged += assignments.length;
    console.info(`Categorized ${Math.min(index + batchSize, pending.length)}/${pending.length}${values['dry-run'] ? ' (dry run; nothing written)' : ''}`);
  }
  console.info(`Done: ${tagged} item(s) received a category${values['dry-run'] ? ' in dry-run mode' : ''}.`);
}

main().catch(error => { console.error(`ORIN categorize: ${error.message}`); process.exitCode = 1; });
