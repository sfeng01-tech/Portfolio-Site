import { createHash } from 'node:crypto';

export const SOURCE_HOSTS = {
  twitter: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
  linkedin: ['linkedin.com', 'www.linkedin.com'],
  reddit: ['reddit.com', 'www.reddit.com', 'old.reddit.com', 'oauth.reddit.com'],
  arxiv: ['arxiv.org', 'rss.arxiv.org', 'export.arxiv.org'],
  hackernews: ['news.ycombinator.com'],
  rss: ['rocm.blogs.amd.com', 'developer.nvidia.com', 'huggingface.co', 'pytorch.org'],
};

export function allowedSourceUrl(source, value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && SOURCE_HOSTS[source]?.includes(url.hostname);
  } catch { return false; }
}

export function canonicalUrl(value) {
  const url = new URL(value);
  if (url.protocol === 'http:' && url.hostname === 'arxiv.org') url.protocol = 'https:';
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('Only HTTPS source links are accepted');
  url.hash = '';
  for (const name of [...url.searchParams.keys()]) {
    if (/^(utm_|ref$|ref_src$|trk$|trackingId$)/i.test(name)) url.searchParams.delete(name);
  }
  return url.toString();
}

export function plainText(value) {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/&#(x[0-9a-f]+|\d+);/gi, (match, code) => {
    const number = code.toLowerCase().startsWith('x') ? parseInt(code.slice(1), 16) : Number(code);
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : match;
  }).replace(/&(amp|lt|gt|quot|apos);/g, (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[entity])).replace(/\s+/g, ' ').trim();
}

export function normalizeItem(item, source, now = new Date()) {
  const url = canonicalUrl(item.url);
  // HN articles can point to external publishers. Keep discussion URL as provenance.
  if (!allowedSourceUrl(source, url)) throw new Error('Unexpected source host');
  const title = plainText(item.title).slice(0, 500);
  const excerpt = plainText(item.excerpt).slice(0, 12000);
  if (!title || !excerpt) throw new Error('Missing title or excerpt');
  const result = { id: createHash('sha256').update(url).digest('hex'), source, url, title, excerpt, collectedAt: now.toISOString() };
  if (item.author) result.author = plainText(item.author).slice(0, 200);
  if (item.publishedAt && Number.isFinite(Date.parse(item.publishedAt))) result.publishedAt = new Date(item.publishedAt).toISOString();
  const metrics = Object.fromEntries(Object.entries(item.metrics || {}).filter(([key, value]) => ['likes', 'reposts', 'comments', 'score'].includes(key) && Number.isFinite(value) && value >= 0 && value <= 1e10).map(([key, value]) => [key, Math.floor(value)]));
  if (Object.keys(metrics).length) result.metrics = metrics;
  return result;
}

export function relevance(item, topics) {
  const text = `${item.title} ${item.excerpt}`.toLowerCase();
  return topics.reduce((score, topic) => {
    const escaped = topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return score + (new RegExp(`(?:^|[^a-z0-9])${escaped}s?(?:$|[^a-z0-9])`, 'i').test(text) ? 1 : 0);
  }, 0);
}

export function observedPopularity(item) {
  const metrics = item.metrics || {};
  const available = ['score', 'likes', 'reposts', 'comments'].filter(key => Number.isFinite(metrics[key]));
  if (!available.length) return null;
  return Math.log1p((metrics.score || 0) + (metrics.likes || 0) + 2 * (metrics.reposts || 0) + (metrics.comments || 0));
}

export function selectItems(items, config, seen = {}, date, now = new Date()) {
  const unique = new Map();
  for (const item of items) {
    if (seen[item.url] && seen[item.url] !== date) continue;
    if (item.publishedAt && (now - new Date(item.publishedAt) > config.maxAgeHours * 3600000 || new Date(item.publishedAt) - now > 3600000)) continue;
    const score = relevance(item, config.topics);
    if (!score) continue;
    const previous = unique.get(item.url);
    if (!previous || item.excerpt.length > previous.item.excerpt.length) unique.set(item.url, { item, score });
  }
  // Source quotas avoid high volume research feeds crowding out social discussions.
  const ranked = [...unique.values()].sort((a, b) => b.score - a.score || String(b.item.publishedAt || '').localeCompare(String(a.item.publishedAt || '')));
  // Keep cross-source slots fixed. Observed engagement only rearranges items
  // from the same source with the same relevance score; platforms' counts
  // are never directly compared. Unknown engagement stays unknown.
  const peerGroups = new Map();
  for (const row of ranked) {
    const key = `${row.item.source}:${row.score}`;
    if (!peerGroups.has(key)) peerGroups.set(key, []);
    peerGroups.get(key).push(row);
  }
  for (const peers of peerGroups.values()) peers.sort((a, b) => {
    const left = observedPopularity(a.item), right = observedPopularity(b.item);
    if (left !== null || right !== null) return (right ?? -1) - (left ?? -1) || String(b.item.publishedAt || '').localeCompare(String(a.item.publishedAt || ''));
    return String(b.item.publishedAt || '').localeCompare(String(a.item.publishedAt || ''));
  });
  const popularityRanked = ranked.map(row => peerGroups.get(`${row.item.source}:${row.score}`).shift());
  const selected = [];
  const counts = {};
  const quota = Math.max(10, Math.ceil(config.maxItems / 3));
  for (const { item } of popularityRanked) {
    if ((counts[item.source] || 0) >= quota) continue;
    selected.push(item); counts[item.source] = (counts[item.source] || 0) + 1;
    if (selected.length === config.maxItems) break;
  }
  return selected;
}

export function validateDigest(raw, items) {
  if (!raw || typeof raw.title !== 'string' || !raw.title.trim() || typeof raw.summary !== 'string' || !raw.summary.trim() || !Array.isArray(raw.groups) || !raw.groups.length || raw.groups.length > 30) throw new Error('Invalid model digest');
  const allowed = new Set(items.map(item => item.url));
  const groups = raw.groups.map(group => {
    if (typeof group.title !== 'string' || !group.title.trim() || typeof group.summary !== 'string' || !group.summary.trim() || !Array.isArray(group.urls) || !group.urls.length || group.urls.some(url => !allowed.has(url))) throw new Error('Model introduced missing or unknown sources');
    return { title: group.title.slice(0, 200), summary: group.summary.slice(0, 4000), urls: [...new Set(group.urls)] };
  });
  return { title: raw.title.slice(0, 200), summary: raw.summary.slice(0, 6000), groups };
}

export function dailyDate(timezone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
