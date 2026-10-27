// Pure, testable model behind the ORIN live actions brain.
//
// Digest items are turned into a three-layer network:
//   source neurons -> topic segments -> action neurons (items)
// "Segmenting similar topics" happens in clusterTopics(), which merges topics
// that describe the same idea (for example "GPU kernels" and "ROCm kernels")
// so one segment carries every source that reported on it.
//
// This module has no React or DOM dependency so it can be unit tested directly.

export const SOURCE_LABELS = Object.freeze({
  x: 'X / Twitter',
  twitter: 'X / Twitter',
  linkedin: 'LinkedIn',
  reddit: 'Reddit',
  arxiv: 'arXiv',
  hackernews: 'Hacker News',
  google_news: 'Google News',
  threads: 'Threads',
  huggingface: 'Hugging Face Papers',
  alphaxiv: 'alphaXiv',
  substack: 'Substack',
  rss: 'Articles',
  shared: 'Shared with me',
});

export const displaySource = (source) => SOURCE_LABELS[source] || String(source ?? 'Unknown');

// Compact captions for the map itself, where the source column is narrow.
// Legends and tooltips still carry the full label.
export const SOURCE_SHORT_LABELS = Object.freeze({
  huggingface: 'HF Papers',
  hackernews: 'Hacker News',
  google_news: 'Google News',
});

export const shortSourceLabel = (source) => SOURCE_SHORT_LABELS[source] || displaySource(source);

// Warm, low-saturation hues that sit inside the portfolio palette in both themes.
export const SOURCE_COLORS = Object.freeze([
  '#b44828', '#8a6a3b', '#5f7a52', '#3f6b73',
  '#6a5a8a', '#a4573f', '#7a7040', '#4d6b52',
]);

export const FALLBACK_TOPIC = 'Unfiled';

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'these', 'those', 'are', 'was', 'were',
  'how', 'why', 'what', 'when', 'where', 'which', 'while', 'who', 'into', 'onto', 'over', 'under',
  'using', 'used', 'use', 'via', 'new', 'toward', 'towards', 'based', 'your', 'you', 'its', 'their',
  'does', 'not', 'but', 'can', 'will', 'more', 'most', 'than', 'then', 'about', 'after', 'before',
  'between', 'all', 'any', 'also', 'such', 'only', 'out', 'off', 'per', 'a', 'an', 'of', 'to', 'in',
  'on', 'at', 'is', 'it', 'as', 'be', 'by', 'or', 'if', 'we', 'our', 'it\u2019s',
]);

export function topicTokens(value) {
  return String(value ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

const tokenMatches = (left, right) => left === right
  || (left.length > 3 && right.length > 3 && (left.startsWith(right) || right.startsWith(left)));

// Overlap measured against the larger token set, so "gpu kernels" and
// "gpu kernels rocm" still read as the same idea (2/3) rather than 2/4.
export function topicSimilarity(left, right) {
  const leftTokens = [...new Set(topicTokens(left))];
  const rightTokens = [...new Set(topicTokens(right))];
  if (!leftTokens.length || !rightTokens.length) {
    return String(left ?? '').trim().toLowerCase() === String(right ?? '').trim().toLowerCase() ? 1 : 0;
  }
  let shared = 0;
  const claimed = new Set();
  for (const token of leftTokens) {
    for (const candidate of rightTokens) {
      if (claimed.has(candidate)) continue;
      if (tokenMatches(token, candidate)) { shared += 1; claimed.add(candidate); break; }
    }
  }
  return shared / Math.max(leftTokens.length, rightTokens.length);
}

// Deterministic single-link clustering: topics are visited by descending volume
// so the most reported idea becomes the segment label.
export function clusterTopics(entries = [], threshold = 0.5) {
  const topics = entries
    .map((entry) => ({ topic: String(entry?.topic ?? '').trim(), count: Math.max(1, Number(entry?.count) || 1) }))
    .filter((entry) => entry.topic)
    .sort((left, right) => right.count - left.count || left.topic.localeCompare(right.topic));

  const parent = topics.map((_, index) => index);
  const find = (index) => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== root) { const next = parent[index]; parent[index] = root; index = next; }
    return root;
  };
  const union = (left, right) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent[b] = a;
  };

  for (let i = 0; i < topics.length; i += 1) {
    for (let j = i + 1; j < topics.length; j += 1) {
      if (topicSimilarity(topics[i].topic, topics[j].topic) >= threshold) union(i, j);
    }
  }

  const buckets = new Map();
  topics.forEach((entry, index) => {
    const root = find(index);
    if (!buckets.has(root)) buckets.set(root, []);
    buckets.get(root).push(entry);
  });

  return [...buckets.values()]
    .map((members) => ({
      label: members[0].topic,
      topics: members.map((member) => member.topic).sort((left, right) => left.localeCompare(right)),
      count: members.reduce((sum, member) => sum + member.count, 0),
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

// Collection freshness. The digest date alone hides a stalled collector, so the
// newest ingested timestamp is surfaced as well.
export function digestFreshness({ items = [], sourceStatus = [], date = '', availableDates = [] } = {}, now = Date.now()) {
  const stamps = [
    ...(items || []).map((item) => item?.collectedAt),
    ...(sourceStatus || []).map((status) => status?.checkedAt),
  ].map((value) => Date.parse(value)).filter((value) => Number.isFinite(value));
  const latest = stamps.length ? Math.max(...stamps) : null;
  const ageHours = latest === null ? null : Math.max(0, (now - latest) / 3_600_000);
  // An older digest is a deliberate look back, not a stalled collector.
  const isLatest = !availableDates.length || !date || date === availableDates[0];
  return { latest, ageHours, isLatest, stale: isLatest && (ageHours === null || ageHours > 30) };
}

export function formatAge(hours) {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return 'never';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function shortLabel(value, max = 46) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  const kept = space > max * 0.6 ? cut.slice(0, space) : cut;
  return `${kept.trim()}…`;
}

const itemScore = (item) => {
  const score = Number(item?.ranking?.score);
  return Number.isFinite(score) ? score : 0;
};

// Highest-signal items first, but stable: ties break on title then id so the
// same digest always produces the same brain.
function compareItems(left, right) {
  return Number(Boolean(right.saved)) - Number(Boolean(left.saved))
    || itemScore(right) - itemScore(left)
    || String(left.title ?? '').localeCompare(String(right.title ?? ''))
    || String(left.id).localeCompare(String(right.id));
}

function itemTopics(item) {
  // An explicit category (owner-edited or model-assigned) defines the segment
  // on its own, so editing a label immediately regroups the brain.
  const category = String(item.category ?? '').trim();
  if (category) return [category];
  const declared = Array.isArray(item.topics) ? item.topics.map((topic) => String(topic).trim()).filter(Boolean) : [];
  const tracks = Array.isArray(item.ranking?.tracks) ? item.ranking.tracks.map((track) => String(track).trim()).filter(Boolean) : [];
  const topics = declared.length ? declared : tracks;
  const unique = [...new Set(topics)].slice(0, 4);
  return unique.length ? unique : [FALLBACK_TOPIC];
}

export function buildBrainModel({ items = [], groups = [], maxItems = 40, clusterThreshold = 0.5 } = {}) {
  const usable = (Array.isArray(items) ? items : [])
    .filter((item) => item && typeof item.id === 'string' && typeof item.source === 'string' && item.source);
  const selected = [...usable].sort(compareItems).slice(0, Math.max(1, maxItems));

  const sourceMap = new Map();
  const topicCounts = new Map();
  const itemTopicIds = new Map();
  for (const item of selected) {
    if (!sourceMap.has(item.source)) {
      sourceMap.set(item.source, { id: `source:${item.source}`, source: item.source, label: displaySource(item.source), caption: shortSourceLabel(item.source), count: 0 });
    }
    sourceMap.get(item.source).count += 1;
    const topics = itemTopics(item);
    itemTopicIds.set(item.id, topics);
    for (const topic of topics) topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
  }

  const clusters = clusterTopics(
    [...topicCounts.entries()].map(([topic, count]) => ({ topic, count })),
    clusterThreshold,
  );

  const topics = clusters.map((cluster, index) => ({
    id: `topic:${index}`,
    label: cluster.label,
    topics: cluster.topics,
    count: cluster.count,
  }));
  const clusterByTopic = new Map();
  topics.forEach((topic) => topic.topics.forEach((name) => clusterByTopic.set(name, topic.id)));

  const sources = [...sourceMap.values()]
    .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source))
    .map((source, index) => ({ ...source, color: SOURCE_COLORS[index % SOURCE_COLORS.length] }));

  const threads = (Array.isArray(groups) ? groups : [])
    .map((group, index) => ({
      id: `thread:${index}`,
      label: String(group?.title ?? `Thread ${index + 1}`).slice(0, 120),
      summary: String(group?.summary ?? '').slice(0, 400),
      index,
      itemIds: [],
    }));
  const threadByUrl = new Map();
  threads.forEach((thread, index) => {
    for (const url of groups[index]?.urls || []) if (!threadByUrl.has(url)) threadByUrl.set(url, thread.id);
  });

  const nodes = selected.map((item) => {
    const threadId = threadByUrl.get(item.url) || null;
    if (threadId) threads.find((thread) => thread.id === threadId).itemIds.push(item.id);
    return {
      id: item.id,
      label: shortLabel(item.title, 68),
      sourceId: `source:${item.source}`,
      source: item.source,
      topicIds: [...new Set(itemTopicIds.get(item.id).map((topic) => clusterByTopic.get(topic)).filter(Boolean))],
      threadId,
      score: itemScore(item),
      discovery: Boolean(item.ranking?.discovery),
      saved: Boolean(item.saved),
      read: Boolean(item.read),
      feedback: [-1, 0, 1].includes(item.feedback) ? item.feedback : 0,
      url: typeof item.url === 'string' ? item.url : null,
    };
  });

  const weights = new Map();
  const edges = [];
  for (const node of nodes) {
    for (const topicId of node.topicIds) {
      const key = `${node.sourceId}->${topicId}`;
      const existing = weights.get(key);
      if (existing) existing.weight += 1;
      else { const edge = { id: key, from: node.sourceId, to: topicId, weight: 1, kind: 'source-topic' }; weights.set(key, edge); edges.push(edge); }
    }
    edges.push({ id: `${node.topicIds[0]}->${node.id}`, from: node.topicIds[0], to: node.id, weight: 1, kind: 'topic-item' });
  }

  return {
    sources,
    topics,
    items: nodes,
    threads: threads.filter((thread) => thread.itemIds.length),
    edges,
    stats: {
      items: nodes.length,
      available: usable.length,
      sources: sources.length,
      availableSources: new Set(usable.map((item) => item.source)).size,
      segments: topics.length,
      threads: threads.filter((thread) => thread.itemIds.length).length,
      links: edges.length,
      unread: nodes.filter((node) => !node.read).length,
      saved: nodes.filter((node) => node.saved).length,
      truncated: usable.length - nodes.length,
    },
  };
}

const round = (value) => Math.round(value * 10) / 10;

function linkPath(from, to) {
  const reach = Math.max(24, (to.x - from.x) * 0.5);
  const startX = from.x + from.r;
  const endX = to.x - to.r;
  return `M ${round(startX)} ${round(from.y)} C ${round(startX + reach)} ${round(from.y)}, ${round(endX - reach)} ${round(to.y)}, ${round(endX)} ${round(to.y)}`;
}

const radiusFor = (kind, node) => {
  if (kind === 'source') return round(9 + Math.min(11, node.count * 1.5));
  if (kind === 'topic') return round(8 + Math.min(15, Math.sqrt(node.count) * 3.6));
  return round(5.5 + Math.min(3, node.score / 34));
};

export function layoutBrain(model, {
  width = 880, rowHeight = 29, paddingX = 148, paddingY = 46, minHeight = 380,
  actionLanes = 2, laneGap = 52, topicGap = 14,
} = {}) {
  const itemsByTopic = new Map(model.topics.map((topic) => [topic.id, []]));
  for (const item of model.items) {
    const topicId = item.topicIds[0] || model.topics[0]?.id;
    if (topicId && itemsByTopic.has(topicId)) itemsByTopic.get(topicId).push(item);
  }

  const topicPositions = new Map();
  const itemPositions = new Map();
  const blocks = [];
  let cursor = paddingY;
  for (const topic of model.topics) {
    const items = itemsByTopic.get(topic.id) || [];
    const rows = Math.max(1, Math.ceil(items.length / actionLanes));
    const top = cursor;
    const bottom = top + (rows - 1) * rowHeight;
    topicPositions.set(topic.id, { x: width / 2, y: (top + bottom) / 2 });
    items.forEach((item, index) => {
      const lane = index % actionLanes;
      itemPositions.set(item.id, {
        x: width - paddingX + lane * laneGap,
        y: top + Math.floor(index / actionLanes) * rowHeight,
        lane,
      });
    });
    blocks.push({ topicId: topic.id, top, bottom, itemCount: items.length });
    cursor = bottom + rowHeight + topicGap;
  }

  const contentHeight = Math.max(0, cursor - topicGap + paddingY);
  const sourceHeight = paddingY * 2 + Math.max(0, model.sources.length - 1) * rowHeight;
  const height = Math.max(minHeight, contentHeight, sourceHeight);
  const offset = Math.max(0, (height - contentHeight) / 2);
  const nodes = new Map();
  const sourceSpan = height - paddingY * 2;
  const topicOrder = new Map(model.topics.map((topic, index) => [topic.id, index]));
  const sourceWeights = new Map();
  for (const edge of model.edges) {
    if (edge.kind !== 'source-topic') continue;
    const weights = sourceWeights.get(edge.from) || [];
    weights.push({ order: topicOrder.get(edge.to) || 0, weight: edge.weight });
    sourceWeights.set(edge.from, weights);
  }
  const sourceOrder = [...model.sources].sort((left, right) => {
    const rank = (source) => {
      const weights = sourceWeights.get(source.id) || [];
      const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
      return total ? weights.reduce((sum, entry) => sum + entry.order * entry.weight, 0) / total : model.topics.length;
    };
    return rank(left) - rank(right) || left.source.localeCompare(right.source);
  });
  sourceOrder.forEach((node, index) => {
    const y = sourceOrder.length === 1 ? height / 2 : paddingY + (sourceSpan * index) / (sourceOrder.length - 1);
    nodes.set(node.id, { ...node, kind: 'source', x: paddingX, y: round(y), r: radiusFor('source', node) });
  });
  model.topics.forEach((node) => {
    const position = topicPositions.get(node.id);
    nodes.set(node.id, { ...node, kind: 'topic', x: position.x, y: round(position.y + offset), r: radiusFor('topic', node) });
  });
  model.items.forEach((node) => {
    const position = itemPositions.get(node.id);
    if (!position) return;
    nodes.set(node.id, { ...node, kind: 'item', ...position, y: round(position.y + offset), r: radiusFor('item', node) });
  });

  const links = model.edges
    .map((edge) => {
      const from = nodes.get(edge.from);
      const to = nodes.get(edge.to);
      if (!from || !to) return null;
      return {
        id: edge.id,
        kind: edge.kind,
        weight: edge.weight,
        from: edge.from,
        to: edge.to,
        x1: from.x, y1: from.y, x2: to.x, y2: to.y,
        d: linkPath(from, to),
      };
    })
    .filter(Boolean);

  return {
    width, height, nodes: [...nodes.values()], links,
    blocks: blocks.map((block) => ({ ...block, top: block.top + offset, bottom: block.bottom + offset })),
  };
}

// Two-hop neighborhood used for focus highlighting. Editing state is never
// shared, so callers can keep the returned set around safely.
export function neighborhood(model, nodeId, maxHops = 2) {
  const adjacency = new Map();
  for (const edge of model.edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
    adjacency.get(edge.from).push(edge.to);
    adjacency.get(edge.to).push(edge.from);
  }
  const seen = new Set([nodeId]);
  let frontier = [nodeId];
  for (let hop = 0; hop < maxHops && frontier.length; hop += 1) {
    const next = [];
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) || []) {
        if (!seen.has(neighbor)) { seen.add(neighbor); next.push(neighbor); }
      }
    }
    frontier = next;
  }
  return seen;
}
