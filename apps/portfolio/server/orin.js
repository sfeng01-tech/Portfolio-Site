import { createHash, timingSafeEqual } from 'node:crypto';
import { getAuthorizedOrinUser, requireSameOrigin } from './githubAuth.js';

export const ORIN_SOURCES = ['twitter', 'linkedin', 'reddit', 'arxiv', 'hackernews', 'google_news', 'threads', 'huggingface', 'alphaxiv', 'substack', 'rss'];
export const ORIN_DEMO_MODE = () => process.env.ORIN_DEMO_MODE === 'true';
export const demoOrinUser = () => ({ token: 'demo', user: { login: 'demo', name: 'ORIN Demo', avatar_url: '', html_url: '' } });
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const string = (value, max, optional = false) => {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw fail('Invalid text field');
  return value.trim();
};
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function safeUrl(value, source) {
  if (typeof value !== 'string' || value.length > 2048) throw fail('Invalid article URL');
  let url;
  try { url = new URL(value); } catch { throw fail('Invalid article URL'); }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port
      || !hostname.includes('.') || hostname.endsWith('.local') || hostname.endsWith('.internal')
      || hostname === 'localhost' || /^[\d.]+$/.test(hostname) || hostname.includes(':')) throw fail('Invalid article URL');
  const domains = { huggingface: ['huggingface.co'], alphaxiv: ['alphaxiv.org'], twitter: ['twitter.com', 'x.com'], linkedin: ['linkedin.com'], reddit: ['reddit.com', 'redd.it'], arxiv: ['arxiv.org'], hackernews: ['news.ycombinator.com'], google_news: ['news.google.com'], threads: ['threads.com', 'threads.net'] };
  if (domains[source] && !domains[source].some(domain => hostname === domain || hostname.endsWith(`.${domain}`))) throw fail('URL does not match its source');
  if (source === 'substack' && !/^[a-z0-9-]+\.substack\.com$/.test(hostname) && !['magazine.sebastianraschka.com', 'latent.space', 'www.latent.space', 'interconnects.ai', 'www.interconnects.ai', 'newsletter.ruder.io', 'newsletter.semianalysis.com'].includes(hostname)) throw fail('URL does not match its source');
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
  return url.toString();
}
export function paperIdFor(value) {
  const url = new URL(value);
  const prefixes = { 'arxiv.org': /^\/(?:abs|pdf)\//, 'export.arxiv.org': /^\/(?:abs|pdf)\//, 'huggingface.co': /^\/papers\//, 'alphaxiv.org': /^\/abs\//, 'www.alphaxiv.org': /^\/abs\// };
  const prefix = prefixes[url.hostname];
  if (!prefix?.test(url.pathname)) return undefined;
  const id = url.pathname.replace(prefix, '').replace(/\.pdf$/, '').replace(/v\d+$/, '');
  return /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})$/.test(id) ? `arxiv:${id}` : undefined;
}
// Category labels power the brain grouping and the classifier taxonomy. They
// travel inside the item JSONB, so only bounds are enforced here; membership in
// the editable taxonomy is enforced where the label is chosen (browser picker,
// collector classification schema).
export function validateCategory(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 80 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw fail('Invalid category');
  return value.trim();
}
export const CATEGORY_SOURCES = ['user', 'model'];

export function validateRanking(value) {
  if (value === undefined) return undefined;
  const tracks = ['GPU kernels', 'Quantization', 'Inference', 'Training', 'Agents', 'AI hardware', 'Research'];
  if (!value || value.method !== 'llm' || !Number.isInteger(value.score) || value.score < 0 || value.score > 100 || typeof value.discovery !== 'boolean'
      || !Array.isArray(value.tracks) || value.tracks.length < 1 || value.tracks.length > 3 || value.tracks.some(track => !tracks.includes(track))) throw fail('Invalid ranking');
  return { method: 'llm', score: value.score, tracks: value.tracks, reason: string(value.reason, 240), discovery: value.discovery };
}
const timestamp = value => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 40 || Number.isNaN(Date.parse(value))) throw fail('Invalid timestamp');
  return new Date(value).toISOString();
};
export const itemId = url => createHash('sha256').update(url).digest('hex');
export function validateIngest(body) {
  if (!body || Buffer.byteLength(JSON.stringify(body)) > 2_000_000 || !validDate(body.date)
      || !Array.isArray(body.items) || body.items.length > 100) throw fail('Invalid digest payload (maximum 100 items)');
  const items = body.items.map(item => {
    if (!item || !ORIN_SOURCES.includes(item.source)) throw fail('Invalid source');
    const url = safeUrl(item.url, item.source);
    const metrics = {};
    for (const key of ['likes', 'reposts', 'comments', 'score']) {
      if (item.metrics?.[key] !== undefined) {
        const value = item.metrics[key];
        if (!Number.isFinite(value) || value < 0 || value > 1e10) throw fail('Invalid popularity metric');
        metrics[key] = value;
      }
    }
    if (item.topics !== undefined && (!Array.isArray(item.topics) || item.topics.length > 20)) throw fail('Invalid topics');
    // Model-assigned or user label, always paired with its source; the label
    // content itself is bounded here and pattern-free on purpose so the
    // taxonomy can evolve without API releases.
    if (item.category === undefined && item.categorySource !== undefined) throw fail('Invalid category source');
    if (item.categorySource !== undefined && !CATEGORY_SOURCES.includes(item.categorySource)) throw fail('Invalid category source');
    const category = item.category === undefined ? undefined : validateCategory(item.category);
    return { ranking: validateRanking(item.ranking), paperId: paperIdFor(url), id: itemId(url), source: item.source, url, title: string(item.title, 500), excerpt: string(item.excerpt ?? item.text, 12000, true), author: string(item.author, 200, true), publishedAt: timestamp(item.publishedAt), collectedAt: timestamp(item.collectedAt), metrics, topics: (item.topics || []).map(topic => string(topic, 100)), ...(category === undefined ? {} : { category, categorySource: item.categorySource ?? 'model' }) };
  });
  const uniqueItems = [...new Map(items.map(item => [item.id, item])).values()];
  const knownUrls = new Set(uniqueItems.map(item => item.url));
  let digest = null;
  if (body.digest !== undefined && body.digest !== null) {
    if (!Array.isArray(body.digest.groups) || body.digest.groups.length > 30) throw fail('Invalid digest groups');
    digest = { title: string(body.digest.title, 200), summary: string(body.digest.summary, 6000, true), groups: body.digest.groups.map(group => {
      if (!Array.isArray(group.urls) || group.urls.length > 100) throw fail('Invalid group references');
      const urls = group.urls.map(url => safeUrl(url));
      if (urls.some(url => !knownUrls.has(url))) throw fail('Group references unknown item');
      return { title: string(group.title, 200), summary: string(group.summary, 4000, true), urls };
    }) };
  }
  if (body.sourceStatus !== undefined && (!Array.isArray(body.sourceStatus) || body.sourceStatus.length > 40)) throw fail('Invalid source status');
  const sourceStatus = (body.sourceStatus || []).map(status => {
    if (!ORIN_SOURCES.includes(status.source) || !['ok', 'blocked', 'error', 'disabled'].includes(status.status)) throw fail('Invalid source status');
    return { source: status.source, status: status.status, message: string(status.message, 500, true), checkedAt: timestamp(status.checkedAt), ...(status.url ? { url: safeUrl(status.url) } : {}) };
  });
  let rankingStatus;
  if (body.rankingStatus !== undefined) {
    const value = body.rankingStatus;
    if (!value || !['llm', 'keyword'].includes(value.method)) throw fail('Invalid ranking status');
    rankingStatus = { method: value.method, message: string(value.message, 500), model: string(value.model, 150, true) };
  }
  if (body.replace !== undefined && typeof body.replace !== 'boolean') throw fail('Invalid replace flag');
  // Keep metadata in existing JSON storage: no database migration is required.
  if (digest && rankingStatus) digest.rankingStatus = rankingStatus;
  return { date: body.date, items: uniqueItems, digest, sourceStatus, replace: body.replace === true };
}

// Pure transformation used after querying prior-day membership. Retain same-day
// retries; remove summaries that could otherwise describe an excluded article.
export function suppressPreviousItems(payload, previousIds, previousPaperIds = []) {
  const excluded = new Set(previousIds);
  const papers = new Set(previousPaperIds);
  const items = payload.items.filter(item => !excluded.has(item.id) && !(item.paperId && papers.has(item.paperId)));
  if (items.length === payload.items.length) return { ...payload, skipped: 0 };
  const keptUrls = new Set(items.map(item => item.url));
  const digest = payload.digest ? {
    ...payload.digest,
    summary: '',
    groups: payload.digest.groups.map(group => {
      const urls = group.urls.filter(url => keptUrls.has(url));
      return { ...group, urls, summary: urls.length === group.urls.length ? group.summary : '' };
    }).filter(group => group.urls.length)
  } : null;
  return { ...payload, items, digest, skipped: payload.items.length - items.length };
}

export function requireIngestToken(req) {
  const expected = process.env.ORIN_INGEST_TOKEN;
  if (!expected || expected.length < 32) throw fail('ORIN ingestion is not configured', 503);
  const actual = req.headers.authorization || '';
  const expectedBuffer = Buffer.from(`Bearer ${expected}`);
  const actualBuffer = Buffer.from(actual);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) throw fail('Not authenticated', 401);
}
export async function requireOrinOwner(req, write = false) {
  if (ORIN_DEMO_MODE()) return demoOrinUser();
  let auth;
  try { auth = await getAuthorizedOrinUser(req); } catch { throw fail('Unable to verify GitHub session', 502); }
  if (!auth) throw fail('Not authenticated', 401);
  if (write) {
    requireSameOrigin(req);
    // Browser mutations must carry their origin, preventing cross-site form submissions.
    if (!req.headers.origin) throw fail('Origin header required', 403);
    if (!req.headers['content-type']?.startsWith('application/json')) throw fail('JSON content type required', 415);
  }
  return auth;
}
export async function orinSql() {
  if (!process.env.ORIN_DATABASE_URL) throw fail('ORIN database is not configured', 503);
  const { neon } = await import('@neondatabase/serverless');
  return neon(process.env.ORIN_DATABASE_URL);
}
export function sendError(res, error) {
  // Database/provider diagnostics can contain connection details; never expose them.
  return res.status(error.status || 503).json({ error: error.status ? error.message : 'ORIN storage is unavailable. Check database setup.' });
}
export const privateResponse = res => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Cookie');
};
