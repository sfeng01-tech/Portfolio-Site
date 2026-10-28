import { displaySource } from './brainGraph.js';

export function sourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

const clean = value => typeof value === 'string' ? value.trim() : '';
const sentences = new Intl.Segmenter('en', { granularity: 'sentence' });

// Keep complete sentences, including decimal measurements and their caveats.
// This is an excerpt of the stored editorial text, never a new synthesis.
export function summaryParts(value, count = 2) {
  const parts = [...sentences.segment(clean(value))].map(part => part.segment.trim()).filter(Boolean);
  return { lead: parts.slice(0, count).join(' '), rest: parts.slice(count).join(' ') };
}

export function buildDailyBrief({ digest, items = [], sourceStatus = [] } = {}) {
  const byUrl = new Map();
  for (const item of items) {
    for (const value of [item.url, item.resolvedUrl]) {
      const url = sourceUrl(value);
      if (url) byUrl.set(url, item);
    }
  }
  const resolveSource = value => {
    const original = sourceUrl(value);
    if (!original) return null;
    const item = byUrl.get(original);
    const url = sourceUrl(item?.resolvedUrl) || original;
    return {
      url, item,
      title: clean(item?.title) || `${new URL(url).hostname.replace(/^www\./, '')}${new URL(url).pathname === '/' ? '' : new URL(url).pathname}`,
      publisher: item?.source ? displaySource(item.source) : new URL(url).hostname.replace(/^www\./, ''),
    };
  };
  const sourcesFor = values => [...new Map(values.map(resolveSource).filter(Boolean).map(source => [source.url, source])).values()];
  let groups = (digest?.groups || []).map((group, index) => ({
    id: `daily-topic-${index + 1}`, title: clean(group.title) || 'Collected sources',
    summary: clean(group.summary), sources: sourcesFor(group.urls || []), editorial: true,
  })).filter(group => group.summary || group.sources.length);

  // Archives published during a summary outage still get a useful reading view.
  // Categories organize excerpts; the UI explicitly distinguishes these from a digest.
  if (!groups.length) {
    const buckets = new Map();
    for (const item of items) {
      const title = clean(item.category) || clean(item.topics?.[0]) || 'Other finds';
      if (!buckets.has(title)) buckets.set(title, []);
      buckets.get(title).push(item.url);
    }
    groups = [...buckets].map(([title, urls], index) => ({
      id: `daily-topic-${index + 1}`, title, summary: '', sources: sourcesFor(urls), editorial: false,
    }));
  }
  const topics = groups.map(group => ({
    ...group, ...summaryParts(group.summary),
    takeaway: summaryParts(group.summary, 1).lead,
    reason: group.sources.map(source => clean(source.item?.ranking?.reason)).find(Boolean) || '',
  }));
  const ranked = items.filter(item => sourceUrl(item.resolvedUrl) || sourceUrl(item.url))
    .slice().sort((a, b) => (Number(b.ranking?.score) || 0) - (Number(a.ranking?.score) || 0));
  const recommended = [];
  const selected = new Set();
  const add = item => {
    const source = resolveSource(item.url);
    if (source && !selected.has(source.url) && recommended.length < 3) {
      selected.add(source.url);
      recommended.push({ ...source, reason: clean(item.ranking?.reason) || summaryParts(item.excerpt, 1).lead });
    }
  };
  // Offer a few different threads before filling remaining slots by relevance.
  for (const topic of topics) {
    const urls = new Set(topic.sources.map(source => source.url));
    const candidate = ranked.find(item => urls.has(sourceUrl(item.resolvedUrl) || sourceUrl(item.url)) && !selected.has(sourceUrl(item.resolvedUrl) || sourceUrl(item.url)));
    if (candidate) add(candidate);
  }
  for (const item of ranked) add(item);
  const stamps = [...items.map(item => item.collectedAt), ...sourceStatus.map(source => source.checkedAt)]
    .map(value => Date.parse(value)).filter(Number.isFinite);
  return { topics, takeaways: topics.filter(topic => topic.takeaway).slice(0, 5), recommended, collectedAt: stamps.length ? Math.max(...stamps) : null };
}
