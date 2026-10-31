import { safeUrl } from './orin.js';
import { fail } from './validation-helpers.js';

export const RESEARCH_INTERESTS = [
  'Training', 'Inference', 'AI infrastructure', 'On-device deployment',
  'GPU and kernel programming', 'Quantization', 'Distillation', 'Agent systems',
  'Reinforcement learning', 'Harness development', 'Evaluation', 'AI model safety'
];
export const DEFAULT_RESEARCH_PROFILE = {
  interests: RESEARCH_INTERESTS,
  goals: 'Find credible, bounded contribution opportunities across AI systems and model safety. Check existing work and counterevidence; prefer concrete AMD ecosystem benefits while retaining valuable cross-platform ideas.',
  hardware: '', skills: '', timeBudget: '', amdFocus: 'preferred'
};
export const RESEARCH_OUTCOMES = ['worth-investigating', 'already-solved', 'insufficient-evidence', 'infeasible', 'experiment-started', 'contributed', 'dismissed'];
export const MAX_RESEARCH_JOBS = 10;
export const DEFAULT_RESEARCH_MODEL = 'deepseek/deepseek-v4.1-flash-1017';
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, limit, label, optional = false) => {
  if (optional && value === undefined) return '';
  if (typeof value !== 'string' || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) || (!optional && !value.trim())) throw fail(`Invalid ${label}`);
  return value.trim();
};

export function validateResearchProfile(profile) {
  if (!plain(profile) || !Array.isArray(profile.interests) || profile.interests.length < 1 || profile.interests.length > 30) throw fail('Choose between 1 and 30 research interests');
  const interests = [...new Set(profile.interests.map(value => text(value, 100, 'research interest')))];
  if (!['preferred', 'required', 'optional'].includes(profile.amdFocus)) throw fail('Invalid AMD focus');
  return {
    interests, goals: text(profile.goals, 5000, 'research goals', true),
    hardware: text(profile.hardware, 2000, 'hardware', true), skills: text(profile.skills, 2000, 'skills', true),
    timeBudget: text(profile.timeBudget, 500, 'time budget', true), amdFocus: profile.amdFocus
  };
}

export function validateResearchId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) throw fail('Invalid research id');
  return value;
}

export function validateResearchBatch(body) {
  if (!plain(body) || Buffer.byteLength(JSON.stringify(body)) > 300000 || !Array.isArray(body.jobs) || body.jobs.length < 1 || body.jobs.length > MAX_RESEARCH_JOBS) throw fail('Submit between 1 and 10 research questions (maximum 300 KB)');
  if (!['library', 'web'].includes(body.scope)) throw fail('Invalid research scope');
  if (!Number.isFinite(body.maxUsd) || body.maxUsd < 0.1 || body.maxUsd > 25) throw fail('Batch spending limit must be between $0.10 and $25');
  const jobs = body.jobs.map(job => {
    if (!plain(job)) throw fail('Invalid research question');
    const sources = job.sources ?? [];
    if (!Array.isArray(sources) || sources.length > 20) throw fail('Use at most 20 sources per question');
    const mapped = sources.map(source => {
      if (!plain(source)) throw fail('Invalid research source');
      const url = safeUrl(source.url);
      let itemId;
      if (source.itemId !== undefined) {
        if (typeof source.itemId !== 'string' || !/^[a-f0-9]{64}$/.test(source.itemId)) throw fail('Invalid research source item id');
        itemId = source.itemId;
      }
      return { url, title: text(source.title || url, 500, 'source title'), excerpt: text(source.excerpt, 12000, 'source excerpt', true), ...(itemId ? { itemId } : {}) };
    });
    return {
      question: text(job.question, 1500, 'research question'), prompt: text(job.prompt, 5000, 'question instructions', true),
      sources: [...new Map(mapped.map(source => [source.url, source])).values()],
      ...(job.suggestionId !== undefined ? { suggestionId: text(job.suggestionId, 160, 'suggestion id') } : {})
    };
  });
  return { jobs, scope: body.scope, batchPrompt: text(body.batchPrompt, 5000, 'batch instructions', true), maxUsd: body.maxUsd };
}

export function validateResearchPatch(body) {
  if (!plain(body)) throw fail('Invalid research update');
  const id = validateResearchId(body.id);
  if (body.action === 'cancel') return { id, action: 'cancel' };
  if (body.action !== 'feedback' || !plain(body.feedback) || !RESEARCH_OUTCOMES.includes(body.feedback.outcome)) throw fail('Invalid research feedback');
  return { id, action: 'feedback', feedback: { outcome: body.feedback.outcome, notes: text(body.feedback.notes, 4000, 'feedback notes', true) } };
}

export function researchCapabilities(env = process.env) {
  const library = Boolean(env.OPENROUTER_API_KEY?.trim());
  const model = env.ORIN_RESEARCH_MODEL?.trim() || DEFAULT_RESEARCH_MODEL;
  const web = library && Boolean(env.TAVILY_API_KEY?.trim());
  return {
    library, web, model: library ? model : null, workerRequired: true,
    message: !library ? 'Research needs OPENROUTER_API_KEY and a separately running research worker.'
      : !web ? 'Library research is configured. Web research additionally needs TAVILY_API_KEY. A separate research worker must be running.'
        : 'Research providers are configured. A separate research worker must be running to process queued jobs.'
  };
}

export function publicResearchJob(row) {
  // Deliberate allowlist: leases and worker internals never reach the browser.
  return {
    id: row.id, status: row.status, question: row.question, prompt: row.prompt,
    sources: row.sources, profile: row.profile, options: row.options, result: row.result,
    progress: row.progress, error: row.error, feedback: row.feedback,
    createdAt: row.created_at ?? row.createdAt, updatedAt: row.updated_at ?? row.updatedAt,
    startedAt: row.started_at ?? row.startedAt, spentUsd: Number(row.spent_usd ?? row.spentUsd ?? 0)
  };
}
