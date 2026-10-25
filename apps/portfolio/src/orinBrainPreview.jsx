// Auth-free fixture page for local visual review; Vite does not include it in the production build.
import React from 'react';
import { createRoot } from 'react-dom/client';
import OrinBrain from './components/orin/OrinBrain';
import './index.css';
import './pages/orin.css';

const params = new URLSearchParams(location.search);
const requestedCount = Number(params.get('n'));
const count = Number.isFinite(requestedCount) && requestedCount > 0 ? Math.min(60, Math.floor(requestedCount)) : 34;
if (params.get('theme') === 'dark') document.documentElement.dataset.theme = 'dark';
document.title = 'ORIN brain — local fixture preview';

const SOURCES = ['arxiv', 'twitter', 'reddit', 'hackernews', 'huggingface', 'alphaxiv', 'substack', 'rss', 'google_news', 'linkedin'];
const TRACKS = [['GPU kernels'], ['ROCm kernels'], ['Inference', 'Inference optimization'], ['Quantization'], ['Agents'], ['AI hardware'], ['Research'], ['Training'], []];
const SOURCE_TOPICS = [[0, 1, 2], [3, 4, 7], [0, 1, 3], [2, 4, 5], [0, 1], [2, 6], [3, 7], [6, 8], [4, 5], [5, 6]];
const trackFor = (index) => {
  const pool = SOURCE_TOPICS[index % SOURCES.length];
  return TRACKS[pool[Math.floor(index / SOURCES.length) % pool.length]];
};
const TITLES = {
  'GPU kernels': ['Fused attention kernels for long-context inference', 'Triton block scheduling for fused MoE routing', 'AMD wavefront occupancy in attention kernels', 'Kernel scheduling for heterogeneous clusters'],
  'ROCm kernels': ['ROCm 6.2 throughput notes for CDNA', 'HIP graph launch overhead, measured', 'ROCm kernel occupancy after the compiler update', 'A practical guide to HIP kernel fusion'],
  Inference: ['Paged attention under real serving load', 'Speculative decoding for latency budgets', 'Continuous batching at the edge', 'Inference observability beyond tokens per second'],
  Quantization: ['INT4 KV-cache quality tradeoffs', 'AWQ versus GPTQ for small-batch serving', 'Post-training quantization quality tradeoffs', 'What low-bit serving costs at long context'],
  Agents: ['Agents that search GPU kernel spaces', 'Reliable tool use with verifier loops', 'Multi-agent planning without the choreography', 'Evaluating agents on stateful tasks'],
  'AI hardware': ['Roadmap notes from the latest AI hardware keynote', 'HBM supply and inference economics', 'Chiplet interconnects for accelerator systems', 'Where inference hardware is heading'],
  Research: ['A survey of efficient attention variants', 'What scaling studies say about data quality', 'Research notes on reliable machine learning systems', 'The systems ideas behind better foundation models'],
  Training: ['Training stability for mixture-of-experts at scale', 'Gradient clipping for long training runs', 'Distributed checkpointing without the stalls', 'MoE routing stability in practice'],
  Unfiled: ['A field guide to accelerator telemetry', 'Notes from a systems reading group', 'The week in computing infrastructure', 'An untagged but useful engineering read'],
};
const titleFor = (index) => {
  const topic = trackFor(index)[0] || 'Unfiled';
  return TITLES[topic][Math.floor(index / SOURCES.length) % TITLES[topic].length];
};

const items = Array.from({ length: count }, (_, index) => ({
  id: String(index).padStart(64, '0'),
  source: SOURCES[index % SOURCES.length],
  url: `https://example.test/item/${index}`,
  title: titleFor(index),
  excerpt: '',
  collectedAt: '2026-10-25T14:17:00.000Z',
  read: index % 3 === 0,
  saved: index % 7 === 0,
  feedback: index % 11 === 0 ? 1 : index % 13 === 0 ? -1 : 0,
  topics: trackFor(index),
  ranking: {
    score: Math.max(1, 95 - index * 2),
    tracks: trackFor(index).length ? trackFor(index) : ['Research'],
    discovery: index % 5 === 0,
    reason: '',
  },
}));
const urlsFor = (topics) => items.filter((item) => item.topics.some((topic) => topics.includes(topic))).slice(0, 3).map((item) => item.url);
const groups = [
  { title: 'Kernel fusion across vendors', summary: '', urls: urlsFor(['GPU kernels', 'ROCm kernels']) },
  { title: 'Serving and quantization', summary: '', urls: urlsFor(['Inference', 'Quantization']) },
  { title: 'Hardware roadmap', summary: '', urls: urlsFor(['AI hardware']) },
];

createRoot(document.getElementById('brain-preview')).render(
  <div className="orin-shell">
    <main className="orin-main">
      <p style={{ font: '9px monospace', letterSpacing: '1.2px', color: 'var(--muted)', paddingTop: 28 }}>
        LOCAL PREVIEW · FIXTURE DIGEST ({count} ITEMS) — NOT LIVE DATA · ?view=board · ?theme=dark · ?n=12
      </p>
      <OrinBrain items={items} groups={groups} date="2026-10-25" initialView={params.get('view') === 'board' ? 'flow' : 'brain'}/>
    </main>
  </div>,
);
