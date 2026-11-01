import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  chunkHash, chunkId, chunkText, estimateTokens, itemChunkText, noteChunkText
} from '../portfolio/server/orin-chunk.js';

const EMBEDDING_MODEL = 'openai/text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const BATCH = 16;
const MAX_ITEMS = 2000;
const MAX_NOTES = 500;
// A per-run allowance, not an invoice. UTF-8 bytes plus request overhead
// conservatively bound the embedding input.
const MAX_RUN_USD = 0.80;

export async function embedBatch(texts, apiKey, fetchImpl = fetch) {
  const response = await fetchImpl('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'ORIN ask index' },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
      provider: { max_price: { prompt: 1 }, require_parameters: true }
    })
  });
  if (!response.ok) throw new Error(`Embedding request failed (${response.status})`);
  const data = await response.json();
  if (data?.data?.length !== texts.length) throw new Error('Embedding response length mismatch');
  const vectors = data.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map(row => row.embedding);
  for (const vector of vectors) {
    if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS || vector.some(value => !Number.isFinite(value))) {
      throw new Error('Invalid embedding vector');
    }
  }
  return vectors.map(vector => JSON.stringify(vector));
}

export function buildChunkRecords(items, notes) {
  const records = [];
  for (const row of items) {
    const item = row.item || {};
    if (item.deleted === true) continue;
    const title = String(item.title || '').trim();
    const pieces = chunkText(itemChunkText(item));
    pieces.forEach((text, ordinal) => records.push({
      id: chunkId('item', row.id, ordinal),
      sourceKind: 'item',
      sourceId: row.id,
      ordinal,
      title,
      text,
      tokenCount: estimateTokens(text),
      hash: chunkHash(text)
    }));
  }
  for (const note of notes) {
    const title = String(note.title || '').trim();
    const pieces = chunkText(noteChunkText(note));
    pieces.forEach((text, ordinal) => records.push({
      id: chunkId('note', String(note.id), ordinal),
      sourceKind: 'note',
      sourceId: String(note.id),
      ordinal,
      title,
      text,
      tokenCount: estimateTokens(text),
      hash: chunkHash(text)
    }));
  }
  return records;
}

export async function indexAsk({ sql, apiKey = '', fetchImpl = fetch, dryRun = false, log = console.log }) {
  const [state] = await sql`SELECT to_regclass('public.orin_chunks') IS NOT NULL AS present`;
  if (!state?.present) throw new Error('Apply apps/portfolio/server/orin-ask-schema.sql first');

  const [items, notes, existing] = await Promise.all([
    sql`SELECT i.id, i.item FROM orin_items i
      WHERE NOT coalesce((i.item->>'deleted')::boolean, false)
      ORDER BY i.updated_at DESC LIMIT ${MAX_ITEMS}`,
    sql`SELECT id, title, content FROM orin_notes ORDER BY updated_at DESC LIMIT ${MAX_NOTES}`,
    sql`SELECT id, content_hash AS hash FROM orin_chunks`
  ]);

  const desired = buildChunkRecords(items, notes);
  const known = new Map(existing.map(row => [row.id, row.hash]));
  const changed = desired.filter(record => known.get(record.id) !== record.hash);

  if (dryRun) {
    log(`Would index ${desired.length} passages from ${items.length} items and ${notes.length} notes; ${changed.length} need writing.`);
    return { passages: desired.length, changed: changed.length, embedded: 0, removed: 0, allowanceUsd: 0 };
  }

  const desiredIds = desired.map(record => record.id);
  const removed = desiredIds.length
    ? await sql`DELETE FROM orin_chunks WHERE NOT (id = ANY(${desiredIds}::text[])) RETURNING id`
    : await sql`DELETE FROM orin_chunks RETURNING id`;

  let embedded = 0;
  let allowanceUsd = 0;
  for (let start = 0; start < changed.length; start += BATCH) {
    const batch = changed.slice(start, start + BATCH);
    let vectors = null;
    if (apiKey) {
      const texts = batch.map(record => record.text);
      const bound = (Buffer.byteLength(JSON.stringify({ model: EMBEDDING_MODEL, input: texts })) + 1024) / 1_000_000;
      if (allowanceUsd + bound > MAX_RUN_USD) {
        log(`Stopped at the per-run embedding allowance after ${embedded} passages.`);
        break;
      }
      allowanceUsd += bound;
      vectors = await embedBatch(texts, apiKey, fetchImpl);
      embedded += vectors.length;
    }
    const payload = JSON.stringify(batch.map((record, index) => ({
      id: record.id,
      source_kind: record.sourceKind,
      source_id: record.sourceId,
      ordinal: record.ordinal,
      title: record.title,
      text: record.text,
      token_count: record.tokenCount,
      content_hash: record.hash,
      embedding_model: vectors ? EMBEDDING_MODEL : null,
      embedding: vectors ? vectors[index] : null
    })));
    await sql`INSERT INTO orin_chunks
        (id, source_kind, source_id, ordinal, title, text, token_count, content_hash, embedding_model, embedding)
      SELECT entry.id, entry.source_kind, entry.source_id, entry.ordinal, entry.title, entry.text,
        entry.token_count, entry.content_hash, entry.embedding_model, entry.embedding::vector
      FROM jsonb_to_recordset(${payload}::jsonb)
        AS entry(id text, source_kind text, source_id text, ordinal integer, title text, text text,
          token_count integer, content_hash text, embedding_model text, embedding text)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title, text = EXCLUDED.text, token_count = EXCLUDED.token_count,
        content_hash = EXCLUDED.content_hash, embedding_model = EXCLUDED.embedding_model,
        embedding = EXCLUDED.embedding, indexed_at = now()`;
  }

  log(`Indexed ${desired.length} passages (${changed.length} changed); embedded ${embedded}; removed ${removed.length}; reserved per-run bound $${allowanceUsd.toFixed(6)}.`);
  if (!apiKey) log('No embedding key supplied: passages are stored for lexical search only.');
  return { passages: desired.length, changed: changed.length, embedded, removed: removed.length, allowanceUsd };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => !['--dry-run', '--keychain-openrouter'].includes(arg))) {
      throw new Error('Usage: ask-indexer.mjs [--dry-run] [--keychain-openrouter]');
    }
    if (!process.env.ORIN_DATABASE_URL) throw new Error('ORIN_DATABASE_URL is required');
    const apiKey = process.env.OPENROUTER_API_KEY || (!args.includes('--dry-run') && args.includes('--keychain-openrouter')
      ? execFileSync('security', ['find-generic-password', '-s', 'openrouter-api-key', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      : '');
    const { neon } = await import('@neondatabase/serverless');
    await indexAsk({ sql: neon(process.env.ORIN_DATABASE_URL), apiKey, dryRun: args.includes('--dry-run') });
  } catch (error) {
    console.error(`Ask indexing failed: ${error.message}`);
    process.exitCode = 1;
  }
}
