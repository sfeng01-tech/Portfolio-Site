import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { runResearch, ResearchCancelled, ResearchBudgetExceeded } from './research-engine.mjs';

// Only fixed messages and HTTP status codes are persisted; provider bodies,
// request text, URLs and credentials must never leak to the owner or logs.
export function researchFailureMessage(error) {
  if (error instanceof ResearchBudgetExceeded) return 'Budget reached before completion. Partial evidence is retained.';
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'A research provider timed out. Partial evidence is retained.';
  const message = typeof error?.message === 'string' ? error.message : '';
  const status = message.match(/^Research (model|search|extract) request failed \((\d{3})\)$/);
  if (status) return `The ${status[1]} provider returned HTTP ${status[2]}. Partial evidence is retained.`;
  if (/^Invalid research perspective plan: (array count \d+|missing or non-array); expected [23]$/.test(message)) return `${message}. Partial evidence is retained.`;
  const known = new Set([
    'Research model pricing or context unavailable', 'Unable to check research model pricing',
    'Research model reached the output token limit', 'Research model returned invalid JSON',
    'Invalid research perspective plan', 'Invalid research perspective ID',
    'Research plan omitted or duplicated a requested perspective',
    'Research evidence exceeds configured model context', 'Research model is not configured',
    'Web research search provider is not configured', 'Invalid research budget', 'Invalid search request allowance'
  ]);
  if (known.has(message)) return `${message}. Partial evidence is retained.`;
  if (/^(Invalid|Unsupported) (research |first-pass |follow-up |perspective |outline |evidence |research brief )/.test(message)
      && /^[A-Za-z -]{1,100}$/.test(message)) return `Research output could not be validated: ${message}. Partial evidence is retained.`;
  return 'Research could not complete. Check worker configuration/provider availability and review retained evidence.';
}

export function createResearchStore(sql) {
  async function claim() {
    // Jobs interrupted twice become terminal rather than looping indefinitely.
    await sql`UPDATE orin_research_jobs SET status = 'failed', error = 'Worker interrupted repeatedly; retained evidence can be reviewed and resubmitted.',
      progress = 'Stopped after repeated worker interruption', lease_token = NULL, lease_expires_at = NULL, updated_at = now()
      WHERE status = 'running' AND lease_expires_at < now() AND attempts >= 2`;
    const token = randomUUID();
    const [job] = await sql`UPDATE orin_research_jobs SET status = 'running', lease_token = ${token}::uuid,
      lease_expires_at = now() + interval '5 minutes', attempts = attempts + 1,
      started_at = COALESCE(started_at, now()), updated_at = now(), progress = 'Starting investigation', error = NULL
      WHERE id = (SELECT id FROM orin_research_jobs
        WHERE status = 'queued' OR (status = 'running' AND lease_expires_at < now() AND attempts < 2)
        ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING *`;
    return job || null;
  }
  async function active(job) {
    const [row] = await sql`SELECT id FROM orin_research_jobs WHERE id = ${job.id}::uuid AND status = 'running'
      AND lease_token = ${job.lease_token}::uuid AND lease_expires_at > now()`;
    return Boolean(row);
  }
  async function reserve(job, amount) {
    const [row] = await sql`UPDATE orin_research_jobs SET spent_usd = spent_usd + ${amount},
      lease_expires_at = now() + interval '5 minutes', updated_at = now()
      WHERE id = ${job.id}::uuid AND status = 'running' AND lease_token = ${job.lease_token}::uuid
        AND lease_expires_at > now() AND spent_usd + ${amount} <= (options->>'maxUsd')::numeric RETURNING id`;
    return Boolean(row);
  }
  async function checkpoint(job, progress, partial) {
    const [row] = await sql`UPDATE orin_research_jobs SET progress = ${progress}, result = ${JSON.stringify(partial)}::jsonb,
      lease_expires_at = now() + interval '5 minutes', updated_at = now()
      WHERE id = ${job.id}::uuid AND status = 'running' AND lease_token = ${job.lease_token}::uuid
        AND lease_expires_at > now() RETURNING id`;
    if (!row) throw new ResearchCancelled();
  }
  async function finish(job, result) {
    const [row] = await sql`UPDATE orin_research_jobs SET status = 'completed', result = ${JSON.stringify(result)}::jsonb,
      progress = 'Contribution brief ready for review', error = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = now()
      WHERE id = ${job.id}::uuid AND status = 'running' AND lease_token = ${job.lease_token}::uuid
        AND lease_expires_at > now() RETURNING id`;
    return Boolean(row);
  }
  async function fail(job, error) {
    const message = researchFailureMessage(error);
    await sql`UPDATE orin_research_jobs SET status = 'failed', error = ${message}, progress = 'Investigation stopped',
      lease_token = NULL, lease_expires_at = NULL, updated_at = now()
      WHERE id = ${job.id}::uuid AND status = 'running' AND lease_token = ${job.lease_token}::uuid AND lease_expires_at > now()`;
  }
  async function searchLibrary(query) {
    // Search all historical items; daily freshness and already-read filters do not apply.
    const tokens = String(query).toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g)?.slice(0, 14) || [];
    const terms = tokens.filter(token => !['the', 'and', 'for', 'with', 'what', 'which', 'does', 'existing'].includes(token));
    if (!terms.length) return [];
    const tsQuery = terms.join(' OR ');
    const rows = await sql`SELECT id, item FROM orin_items
      WHERE to_tsvector('english', COALESCE(item->>'title', '') || ' ' || COALESCE(item->>'excerpt', ''))
        @@ websearch_to_tsquery('english', ${tsQuery})
      ORDER BY ts_rank(to_tsvector('english', COALESCE(item->>'title', '') || ' ' || COALESCE(item->>'excerpt', '')),
        websearch_to_tsquery('english', ${tsQuery})) DESC, updated_at DESC LIMIT 8`;
    return rows.map(row => ({ ...row.item, itemId: row.id, provenance: 'library', coverage: 'excerpt' }));
  }
  async function loadSources(sources) {
    const ids = [...new Set(sources.map(source => source.itemId).filter(id => /^[a-f0-9]{64}$/.test(id || '')))];
    if (!ids.length) return [];
    const rows = await sql`SELECT id, item FROM orin_items WHERE id = ANY(${ids}::text[]) LIMIT 20`;
    return rows.map(row => ({ ...row.item, itemId: row.id, provenance: 'library', coverage: 'excerpt' }));
  }
  return { claim, active, reserve, checkpoint, finish, fail, searchLibrary, loadSources };
}

export async function processNextResearch(store, { engine = runResearch, env = process.env, fetchImpl = fetch } = {}) {
  const job = await store.claim();
  if (!job) return false;
  try {
    const result = await engine(job, { env, fetchImpl,
      isActive: () => store.active(job), reserve: amount => store.reserve(job, amount),
      checkpoint: (message, result) => store.checkpoint(job, message, result), searchLibrary: query => store.searchLibrary(query),
      loadSources: sources => store.loadSources ? store.loadSources(sources) : [] });
    await store.finish(job, result);
  } catch (error) {
    if (!(error instanceof ResearchCancelled)) await store.fail(job, error);
  }
  return true;
}

export async function main(args = process.argv.slice(2), env = process.env) {
  if (args.some(arg => arg !== '--once')) throw new Error('Usage: node research-worker.mjs [--once]');
  for (const name of ['ORIN_DATABASE_URL', 'OPENROUTER_API_KEY']) if (!env[name]) throw new Error(`${name} is required`);
  const { neon } = await import('@neondatabase/serverless');
  const store = createResearchStore(neon(env.ORIN_DATABASE_URL));
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  try {
    do {
      const handled = await processNextResearch(store, { env });
      if (args.includes('--once')) return;
      if (!handled && !stopping) await new Promise(resolve => setTimeout(resolve, 10_000));
    } while (!stopping);
  } finally { process.off('SIGTERM', stop); process.off('SIGINT', stop); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('ORIN research worker failed. Check required environment, schema and database connectivity.'); process.exitCode = 1; });
}
