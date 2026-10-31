import { randomUUID } from 'node:crypto';
import { orinSql, privateResponse, requireOrinOwner, sendError } from '../../apps/portfolio/server/orin.js';
import { fail } from '../../apps/portfolio/server/validation-helpers.js';
import {
  DEFAULT_RESEARCH_PROFILE, validateResearchProfile, validateResearchBatch,
  validateResearchPatch, publicResearchJob, researchCapabilities
} from '../../apps/portfolio/server/orin-research.js';
import { recommendInvestigations } from '../../apps/portfolio/server/orin-research-recommendations.js';

// Dependency injection supports storage/auth contract tests without live access.
export function createResearchHandler({ getSql = orinSql, authorize = requireOrinOwner, environment = () => process.env, recommend = recommendInvestigations } = {}) {
  return async function handler(req, res) {
    privateResponse(res);
    if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST, PATCH');
      return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
      await authorize(req, req.method !== 'GET');
      const capabilities = researchCapabilities(environment());
      if (req.method === 'POST' && req.body?.action === 'profile') {
        const profile = validateResearchProfile(req.body.profile);
        const sql = await getSql();
        await sql`INSERT INTO orin_research_profile (id, profile) VALUES (1, ${JSON.stringify(profile)}::jsonb)
          ON CONFLICT (id) DO UPDATE SET profile = EXCLUDED.profile, updated_at = now()`;
        return res.status(200).json({ profile });
      }
      if (req.method === 'POST') {
        if (req.body?.action !== 'submit') throw fail('Invalid research action');
        const batch = validateResearchBatch(req.body);
        if (!capabilities.library || (batch.scope === 'web' && !capabilities.web)) throw fail(capabilities.message, 503);
        const sql = await getSql();
        const [saved] = await sql`SELECT profile FROM orin_research_profile WHERE id = 1`;
        const profile = saved?.profile ?? DEFAULT_RESEARCH_PROFILE;
        const batchId = randomUUID();
        const allowance = Math.floor(batch.maxUsd * 1e6 / batch.jobs.length) / 1e6;
        const payload = batch.jobs.map(job => ({
          id: randomUUID(), question: job.question, prompt: job.prompt, sources: job.sources, profile,
          options: { scope: batch.scope, batchPrompt: batch.batchPrompt, maxUsd: allowance, batchMaxUsd: batch.maxUsd, batchId, model: capabilities.model, ...(job.suggestionId ? { suggestionId: job.suggestionId } : {}) }
        }));
        // One INSERT makes batch creation all-or-nothing; no partially queued batch.
        const rows = await sql`INSERT INTO orin_research_jobs (id, question, prompt, sources, profile, options)
          SELECT id, question, prompt, sources, profile, options
          FROM jsonb_to_recordset(${JSON.stringify(payload)}::jsonb)
            AS entry(id uuid, question text, prompt text, sources jsonb, profile jsonb, options jsonb)
          RETURNING *`;
        return res.status(201).json({ jobs: rows.map(publicResearchJob), batchId });
      }
      if (req.method === 'PATCH') {
        const patch = validateResearchPatch(req.body);
        const sql = await getSql();
        let row;
        if (patch.action === 'cancel') {
          [row] = await sql`UPDATE orin_research_jobs SET status = 'cancelled', progress = 'Cancelled by owner',
            lease_token = NULL, lease_expires_at = NULL, updated_at = now()
            WHERE id = ${patch.id} AND status IN ('queued', 'running') RETURNING *`;
          if (!row) throw fail('Research job is missing or is no longer cancellable', 409);
        } else {
          [row] = await sql`UPDATE orin_research_jobs SET feedback = ${JSON.stringify(patch.feedback)}::jsonb,
            updated_at = now() WHERE id = ${patch.id} RETURNING *`;
          if (!row) throw fail('Research job not found', 404);
        }
        return res.status(200).json({ job: publicResearchJob(row) });
      }
      const sql = await getSql();
      const [profiles, rows, candidates] = await Promise.all([
        sql`SELECT profile FROM orin_research_profile WHERE id = 1`,
        sql`SELECT * FROM orin_research_jobs ORDER BY created_at DESC LIMIT 100`,
        sql`SELECT * FROM (
          (SELECT id, item, saved, updated_at FROM orin_items ORDER BY updated_at DESC LIMIT 200)
          UNION
          (SELECT id, item, saved, updated_at FROM orin_items WHERE saved ORDER BY updated_at DESC LIMIT 100)
        ) candidates ORDER BY updated_at DESC`
      ]);
      const profile = profiles[0]?.profile ?? DEFAULT_RESEARCH_PROFILE;
      const jobs = rows.map(publicResearchJob);
      const items = candidates.map(row => ({ ...row.item, id: row.id, saved: row.saved }));
      return res.status(200).json({ profile, jobs, suggestions: recommend(items, profile, jobs), capabilities });
    } catch (error) { return sendError(res, error); }
  };
}

export default createResearchHandler();
