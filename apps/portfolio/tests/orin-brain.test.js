import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBrainModel, clusterTopics, digestFreshness, displaySource, formatAge, layoutBrain, neighborhood, shortLabel, shortSourceLabel, topicSimilarity, topicTokens,
} from '../src/components/orin/brainGraph.js';
import {
  brainLayout, buildBrainShell, curveBetween, hemispherePoints, projectPoint, rotatePoint, samplePath,
} from '../src/components/orin/brainScene.js';

const id = (seed) => seed.repeat(64).slice(0, 64);
const item = (seed, source, title, extra = {}) => ({
  id: id(seed), source, url: `https://example.test/${seed}`, title, excerpt: '', ...extra,
});

const digestItems = [
  item('a', 'arxiv', 'Fused attention kernels on AMD hardware', { topics: ['GPU kernels'], ranking: { score: 92, tracks: ['GPU kernels'], discovery: false }, saved: true }),
  item('b', 'twitter', 'ROCm kernel throughput notes', { topics: ['ROCm kernels'], ranking: { score: 71, tracks: ['ROCm kernels'] } }),
  item('c', 'reddit', 'Quantization quality tradeoffs', { topics: ['Quantization'], ranking: { score: 64, tracks: ['Quantization'] }, read: true, feedback: 1 }),
  item('d', 'hackernews', 'Serving inference at the edge', { ranking: { score: 58, tracks: ['Inference', 'Inference optimization'] } }),
  item('e', 'arxiv', 'Second kernel paper', { topics: ['GPU kernels'], ranking: { score: 40, tracks: ['GPU kernels'] } }),
];

test('topic tokens drop stopwords and topic similarity merges one idea', () => {
  assert.deepEqual(topicTokens('The GPU kernels for serving'), ['gpu', 'kernels', 'serving']);
  assert.equal(topicSimilarity('GPU kernels', 'ROCm kernels'), 0.5);
  assert.equal(topicSimilarity('GPU kernel', 'GPU kernels'), 1);
  assert.equal(topicSimilarity('Quantization', 'GPU kernels'), 0);
});

test('clusterTopics groups similar topics and labels each segment by volume', () => {
  const clusters = clusterTopics([
    { topic: 'GPU kernels', count: 9 },
    { topic: 'ROCm kernels', count: 4 },
    { topic: 'Inference', count: 6 },
    { topic: 'Inference optimization', count: 2 },
    { topic: 'Agents', count: 3 },
  ]);
  assert.deepEqual(clusters.map((cluster) => cluster.label), ['GPU kernels', 'Inference', 'Agents']);
  assert.deepEqual(clusters[0].topics, ['GPU kernels', 'ROCm kernels']);
  assert.equal(clusters[0].count, 13);
  assert.deepEqual(clusterTopics([{ topic: 'GPU kernels', count: 9 }, { topic: 'ROCm kernels', count: 4 }]), clusterTopics([{ topic: 'ROCm kernels', count: 4 }, { topic: 'GPU kernels', count: 9 }]));
});

test('buildBrainModel turns a digest into sources, topic segments and action neurons', () => {
  const model = buildBrainModel({ items: digestItems, groups: [{ title: 'Kernel work', summary: '', urls: ['https://example.test/a', 'https://example.test/b'] }] });
  assert.deepEqual(model.stats, { items: 5, available: 5, sources: 4, availableSources: 4, segments: 3, threads: 1, links: 9, unread: 4, saved: 1, truncated: 0 });
  assert.deepEqual(model.sources.map((source) => source.source), ['arxiv', 'hackernews', 'reddit', 'twitter']);
  assert.equal(model.sources[0].label, 'arXiv');
  assert.equal(model.sources[0].caption, 'arXiv');
  assert.deepEqual(model.topics.map((topic) => topic.label), ['GPU kernels', 'Inference', 'Quantization']);
  assert.deepEqual(model.topics[0].topics, ['GPU kernels', 'ROCm kernels']);
  assert.equal(model.threads[0].itemIds.length, 2);
  const kernelItem = model.items.find((node) => node.id === id('a'));
  assert.deepEqual(kernelItem.topicIds, ['topic:0']);
  assert.equal(kernelItem.threadId, 'thread:0');
  assert.equal(kernelItem.saved, true);
  assert.ok(model.edges.every((edge) => edge.from && edge.to && edge.weight > 0));
  // Every item is reachable from a source through its first segment.
  assert.equal(model.edges.filter((edge) => edge.kind === 'topic-item').length, 5);
});

test('buildBrainModel caps neurons, keeps the strongest and reports the remainder', () => {
  const model = buildBrainModel({ items: digestItems, maxItems: 3 });
  assert.equal(model.stats.items, 3);
  assert.equal(model.stats.available, 5);
  assert.equal(model.stats.sources, 3);
  assert.equal(model.stats.availableSources, 4);
  assert.equal(model.stats.truncated, 2);
  // Saved first, then highest fit score.
  assert.deepEqual(model.items.map((node) => node.id), [id('a'), id('b'), id('c')]);
  assert.equal(model.items[0].label.length <= 68, true);
});

test('items without topics fall back to a shared segment', () => {
  const model = buildBrainModel({ items: [item('f', 'rss', 'An untagged article'), item('g', 'rss', 'Another untagged article')] });
  assert.deepEqual(model.topics.map((topic) => topic.label), ['Unfiled']);
  assert.equal(model.topics[0].count, 2);
});

test('an owner or model category regroups the item ahead of topics and tracks', () => {
  const moved = item('h', 'reddit', 'Quantization quality tradeoffs', {
    topics: ['GPU kernels'], ranking: { score: 64, tracks: ['GPU kernels'] },
    category: 'Agents', categorySource: 'user',
  });
  const model = buildBrainModel({ items: [moved] });
  assert.deepEqual(model.topics.map((topic) => topic.label), ['Agents']);
  assert.deepEqual(model.items[0].topicIds, ['topic:0']);
  // A category is the strongest grouping signal even when it sits alone.
  const mixed = buildBrainModel({ items: [moved, digestItems[2]] });
  assert.equal(mixed.topics.some((topic) => topic.label === 'Agents'), true);
  assert.equal(mixed.topics.some((topic) => topic.label === 'Quantization'), true);
});

test('layoutBrain produces bounded, serializable node and link geometry', () => {
  const model = buildBrainModel({ items: digestItems, groups: [{ title: 'Kernel work', summary: '', urls: ['https://example.test/a'] }] });
  const view = layoutBrain(model);
  assert.equal(view.width, 880);
  assert.ok(view.height >= 380);
  assert.equal(view.nodes.length, model.stats.sources + model.stats.segments + model.stats.items);
  assert.equal(view.links.length, model.edges.length);
  const ids = new Set(view.nodes.map((node) => node.id));
  for (const node of view.nodes) {
    assert.ok(node.x >= 0 && node.x <= view.width, `${node.id} x in range`);
    assert.ok(node.y >= 0 && node.y <= view.height, `${node.id} y in range`);
    assert.ok(node.r > 0);
  }
  for (const link of view.links) {
    assert.ok(ids.has(link.from) && ids.has(link.to));
    assert.match(link.d, /^M [-\d.]+ [-\d.]+ C /);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(view)).links.length, view.links.length);
  assert.deepEqual(layoutBrain(model), view);
});

test('neighborhood walks two hops from a selected neuron', () => {
  const model = buildBrainModel({ items: digestItems });
  const fromSource = neighborhood(model, `source:arxiv`);
  assert.ok(fromSource.has('source:arxiv'));
  assert.ok(fromSource.has(id('a')) && fromSource.has(id('e')));
  assert.ok(fromSource.has('topic:0'));
  assert.ok(!fromSource.has(`source:reddit`));
  const fromItem = neighborhood(model, id('c'));
  assert.ok(fromItem.has(id('c')) && fromItem.has('topic:2') && fromItem.has('source:reddit'));
  assert.equal(neighborhood(model, id('c'), 0).size, 1);
});

test('shortLabel trims long titles on word boundaries and displaySource is stable', () => {
  assert.equal(shortLabel('Fused attention kernels on AMD hardware for training', 24), 'Fused attention kernels…');
  assert.equal(shortLabel('Short title', 40), 'Short title');
  assert.equal(displaySource('huggingface'), 'Hugging Face Papers');
  assert.equal(displaySource('mastodon'), 'mastodon');
  assert.equal(displaySource(undefined), 'Unknown');
  // Map captions stay narrow enough for the source column; full names stay in legends.
  assert.equal(shortSourceLabel('huggingface'), 'HF Papers');
  assert.equal(shortSourceLabel('arxiv'), 'arXiv');
  assert.ok(shortSourceLabel('huggingface').length < displaySource('huggingface').length);
});

test('the brain tolerates missing or malformed digest fields', () => {
  const model = buildBrainModel({ items: [{ id: 'x', source: 'arxiv' }, null, { source: 'arxiv' }, 'nope'], groups: [null, { title: 'Loose thread' }] });
  assert.equal(model.stats.items, 1);
  assert.equal(model.stats.segments, 1);
  assert.equal(model.stats.threads, 0);
  assert.equal(model.items[0].threadId, null);
  assert.equal(model.items[0].score, 0);
  assert.deepEqual(layoutBrain(model).links.length, 2);
});

// --- 3D brain scene ---------------------------------------------------------

test('shapeBrain carves a midline fissure and stays within brain proportions', () => {
  const shell = buildBrainShell();
  const nearMidline = shell.points.filter((point) => Math.abs(point.x) < 0.06 && point.y > 0.1).map((point) => point.y);
  const shoulders = shell.points.filter((point) => Math.abs(point.x) > 0.25 && Math.abs(point.x) < 0.35 && point.y > 0.1).map((point) => point.y);
  assert.ok(Math.max(...nearMidline) + 0.1 < Math.max(...shoulders), 'the groove must sit below the hemispheres');
  const width = Math.max(...shell.points.map((point) => Math.abs(point.x)));
  const height = Math.max(...shell.points.map((point) => Math.abs(point.y)));
  const depth = Math.max(...shell.points.map((point) => Math.abs(point.z)));
  assert.ok(width > 0.8 && width < 1.25 && height < width && depth > height, `${width} ${height} ${depth}`);
  assert.ok(shell.contours.length >= 12, 'gyri folds are what make the surface readable');
  assert.equal(shell.fissure.length, 3);
});

test('the brain shell and neuron placement are deterministic', () => {
  assert.deepEqual(buildBrainShell().points, buildBrainShell().points);
  const model = buildBrainModel({ items: digestItems });
  assert.deepEqual(brainLayout(model).nodes, brainLayout(model).nodes);
});

test('hemispheres keep sources left, actions right and spread over the surface', () => {
  const left = hemispherePoints(10, -1);
  const right = hemispherePoints(34, 1);
  assert.equal(left.length, 10);
  assert.equal(right.length, 34);
  assert.ok(left.every((point) => point.x < 0));
  assert.ok(right.every((point) => point.x > 0));
  const spread = (points) => Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y));
  assert.ok(spread(left) > 0.7, 'sources must not pile up at the top');
  assert.ok(spread(right) > 1.0, 'actions must cover the hemisphere');
  assert.equal(new Set(right.map((point) => `${point.x},${point.y}`)).size, 34);
});

test('brainLayout runs sources through the midline spine into action neurons', () => {
  const model = buildBrainModel({ items: digestItems, groups: [{ title: 'Kernel work', summary: '', urls: ['https://example.test/a', 'https://example.test/b'] }] });
  const layout = brainLayout(model);
  assert.equal(layout.nodes.length, model.stats.sources + model.stats.segments + model.stats.items);
  for (const node of layout.nodes) {
    if (node.kind === 'source') assert.ok(node.p.x < 0, 'sources sit on the left hemisphere');
    if (node.kind === 'item') assert.ok(node.p.x > 0, 'actions sit on the right hemisphere');
    if (node.kind === 'topic') assert.equal(node.p.x, 0, 'segments run down the midline');
    assert.ok(Math.hypot(node.p.x, node.p.y, node.p.z) > 0, `${node.id} has a position`);
  }
  assert.equal(layout.edges.length, model.edges.length);
  for (const edge of layout.edges) {
    const from = layout.nodesById.get(edge.from);
    const to = layout.nodesById.get(edge.to);
    assert.ok(from && to, 'edges reference placed neurons');
    assert.deepEqual(edge.path[0], from.p);
    assert.deepEqual(edge.path[edge.path.length - 1], to.p);
  }
});

test('rotation preserves length and projectPoint keeps the brain the right way up', () => {
  const spun = rotatePoint({ x: 0, y: 0, z: 1 }, Math.PI / 2, 0);
  assert.ok(Math.abs(spun.x - 1) < 1e-9 && Math.abs(spun.z) < 1e-9);
  for (const [yaw, pitch] of [[0.4, -0.2], [2.2, 0.6], [-1.1, -0.9]]) {
    const rotated = rotatePoint({ x: 0.3, y: -0.5, z: 0.7 }, yaw, pitch);
    assert.ok(Math.abs(Math.hypot(rotated.x, rotated.y, rotated.z) - Math.hypot(0.3, -0.5, 0.7)) < 1e-9);
  }
  const view = { width: 900, height: 460 };
  const middle = projectPoint({ x: 0, y: 0, z: 0 }, view);
  assert.equal(middle.x, 450);
  assert.equal(middle.y, 230);
  // Canvas y grows downward, so brain-up must map to a smaller screen y.
  assert.ok(projectPoint({ x: 0, y: 0.5, z: 0 }, view).y < middle.y, 'up is up');
  assert.ok(projectPoint({ x: 0, y: -0.5, z: 0 }, view).y > middle.y);
  assert.ok(projectPoint({ x: 0, y: 0, z: 0.6 }, view).scale > middle.scale, 'nearer looks larger');
});

test('edge paths start and end at their neurons and bow outward', () => {
  const path = curveBetween({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  assert.deepEqual(path[0], { x: 1, y: 0, z: 0 });
  assert.deepEqual(path[path.length - 1], { x: 0, y: 0, z: 1 });
  const middle = path[Math.floor(path.length / 2)];
  assert.ok(Math.hypot(middle.x, middle.y, middle.z) > 0.75, 'the arc bulges toward the surface');
  assert.deepEqual(samplePath(path, 0), path[0]);
  assert.deepEqual(samplePath(path, 1), path[path.length - 1]);
  assert.deepEqual(samplePath(path, 0.5), middle);
  assert.deepEqual(samplePath(path, -5), path[0]);
  assert.deepEqual(samplePath([], 0.5), { x: 0, y: 0, z: 0 });
});

test('freshness surfaces a stalled collector and stays quiet on old digests', () => {
  const now = Date.parse('2026-10-26T10:00:00.000Z');
  const items = [{ collectedAt: '2026-10-26T07:00:00.000Z' }, { collectedAt: '2026-10-26T08:30:00.000Z' }, {}];
  const fresh = digestFreshness({ items, date: '2026-10-26', availableDates: ['2026-10-26', '2026-10-25'] }, now);
  assert.equal(fresh.isLatest, true);
  assert.equal(fresh.stale, false);
  assert.ok(Math.abs(fresh.ageHours - 1.5) < 1e-6);

  const stalled = digestFreshness({ items, date: '2026-10-26', availableDates: ['2026-10-26'] }, now + 40 * 3_600_000);
  assert.equal(stalled.stale, true);

  // Looking back at an older digest is not a stalled collector.
  const lookingBack = digestFreshness({ items, date: '2026-10-25', availableDates: ['2026-10-26', '2026-10-25'] }, now + 400 * 3_600_000);
  assert.equal(lookingBack.isLatest, false);
  assert.equal(lookingBack.stale, false);

  // No timestamps at all is the worst case, not a silent pass.
  assert.equal(digestFreshness({ items: [], date: '2026-10-26', availableDates: ['2026-10-26'] }, now).stale, true);
  assert.equal(digestFreshness({}, now).ageHours, null);

  // sourceStatus alone can prove the collector ran.
  const fromStatus = digestFreshness({ sourceStatus: [{ source: 'hackernews', status: 'ok', checkedAt: '2026-10-26T09:00:00.000Z' }], date: '2026-10-26', availableDates: ['2026-10-26'] }, now);
  assert.ok(Math.abs(fromStatus.ageHours - 1) < 1e-6);
  assert.equal(fromStatus.stale, false);

  assert.equal(formatAge(0.5), '30m ago');
  assert.equal(formatAge(26), '1d ago');
  assert.equal(formatAge(null), 'never');
});
