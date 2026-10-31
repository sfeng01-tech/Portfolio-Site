import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { buildDailyBrief, sourceUrl, summaryParts } from '../src/components/orin/dailyBrief.js';

const items = [
  { id: 'a', source: 'arxiv', title: 'OasisKV paper', url: 'https://arxiv.org/abs/2608.08097', excerpt: 'A paper excerpt.', collectedAt: '2026-10-28T14:00:00Z', ranking: { score: 95, reason: 'Addresses your serving memory interests.' } },
  { id: 'b', source: 'shared', title: 'Kernel walkthrough', url: 'https://chatgpt.com/share/test', resolvedUrl: 'https://example.org/kernels', excerpt: 'A kernel walkthrough.', ranking: { score: 90 } },
  { id: 'c', source: 'rss', title: 'Independent kernel work', url: 'https://example.org/independent', ranking: { score: 85 } },
  { id: 'd', source: 'rss', title: 'Training paper', url: 'https://example.org/training', ranking: { score: 80 } },
];
const groups = [
  { title: 'KV cache', summary: 'The authors report 1.86x throughput. This is an abstract claim. Independent validation is still needed.', urls: [items[0].url] },
  { title: 'GPU kernels', summary: 'Two approaches explore kernel optimization.', urls: [items[1].url, items[1].resolvedUrl, items[2].url] },
  { title: 'Training', summary: 'A separate training development.', urls: [items[3].url] },
];
const data = { date: '2026-10-28', availableDates: ['2026-10-28', '2026-10-27'], items, digest: { title: 'AI systems daily brief', summary: 'The editorial overview.', groups } };

test('brief preserves measurements, complete sentences and the remaining caveats', () => {
  assert.deepEqual(summaryParts(groups[0].summary), {
    lead: 'The authors report 1.86x throughput. This is an abstract claim.',
    rest: 'Independent validation is still needed.',
  });
  const brief = buildDailyBrief(data);
  assert.equal(brief.takeaways[0].takeaway, 'The authors report 1.86x throughput.');
  assert.equal(brief.topics[0].reason, items[0].ranking.reason);
  assert.equal(brief.topics[1].reason, '');
  assert.equal(brief.collectedAt, Date.parse(items[0].collectedAt));
});

test('source labels resolve stored metadata, repaired destinations and duplicate links', () => {
  const brief = buildDailyBrief(data);
  assert.equal(brief.topics[0].sources[0].title, 'OasisKV paper');
  assert.equal(brief.topics[0].sources[0].publisher, 'arXiv');
  assert.equal(brief.topics[1].sources.length, 2);
  assert.equal(brief.topics[1].sources[0].url, items[1].resolvedUrl);
  assert.equal(brief.recommended.length, 3);
  assert.deepEqual(brief.recommended.map(source => source.title), ['OasisKV paper', 'Kernel walkthrough', 'Training paper']);
});

test('archive days without summaries use honest excerpt groups without fabricating takeaways', () => {
  const brief = buildDailyBrief({ items: items.map(item => ({ ...item, category: 'Reading' })) });
  assert.equal(brief.takeaways.length, 0);
  assert.equal(brief.topics.length, 1);
  assert.equal(brief.topics[0].editorial, false);
  assert.equal(brief.topics[0].summary, '');
  assert.equal(brief.topics[0].sources.length, 4);
  assert.deepEqual(buildDailyBrief().topics, []);
});

test('unmatched archive sources retain usable labels and unsafe URLs are never rendered', () => {
  const brief = buildDailyBrief({ digest: { groups: [{ title: 'Older thread', urls: ['https://archive.example/paper', 'javascript:alert(1)', 'https://name:secret@example.org/'] }] } });
  assert.equal(brief.topics[0].sources.length, 1);
  assert.equal(brief.topics[0].sources[0].title, 'archive.example/paper');
  assert.equal(sourceUrl('http://example.org/'), null);
});

test('the quick read stays short while every stored topic and source remains available', () => {
  const manyGroups = Array.from({ length: 8 }, (_, index) => ({ title: `Topic ${index}`, summary: `Development ${index}. More context.`, urls: [`https://example.org/${index}`] }));
  const brief = buildDailyBrief({ digest: { groups: manyGroups } });
  assert.equal(brief.takeaways.length, 5);
  assert.equal(brief.topics.length, 8);
  assert.equal(brief.topics[7].sources[0].url, 'https://example.org/7');
});

test('the same reading component renders today, past dates, summary outages and empty days', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: Brief } = await server.ssrLoadModule('/src/components/orin/OrinDailyBrief.jsx');
    const render = props => renderToStaticMarkup(React.createElement(Brief, { data, today: '2026-10-28', ...props }));
    const today = render({});
    assert.match(today, /Today in 60 seconds/);
    assert.match(today, /Topic briefs/);
    assert.match(today, /Worth your time/);
    assert.match(today, /href="https:\/\/arxiv.org\/abs\/2608.08097"/);
    assert.match(today, /OasisKV paper/);
    assert.match(today, /Independent validation is still needed/);
    assert.doesNotMatch(today, /Source 1|<details open/);
    const past = render({ data: { ...data, date: '2026-10-27' }, archived: true });
    assert.match(past, /ARCHIVE/);
    assert.match(past, /The day in 60 seconds/);
    assert.match(past, /Topic briefs/);
    assert.match(past, /OasisKV paper/);
    const latest = render({ today: '2026-10-29' });
    assert.match(latest, /LATEST AVAILABLE/);
    const outage = render({ data: { date: '2026-10-27', items } });
    assert.match(outage, /No editorial summary was published/);
    assert.match(outage, /A paper excerpt/);
    assert.doesNotMatch(outage, /in 60 seconds/);
    const empty = render({ data: {} });
    assert.match(empty, /after the collector completes a run/);
    assert.doesNotMatch(empty, /Worth your time|Topic briefs/);
  } finally { await server.close(); }
});
