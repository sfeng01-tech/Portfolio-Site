export const demoDates = ['2026-10-25', '2026-10-24'];

const baseItem = (id, date, source, url, title, excerpt, extra = {}) => ({
  id,
  source,
  url,
  title,
  excerpt,
  author: 'ORIN demo',
  publishedAt: `${date}T12:00:00.000Z`,
  collectedAt: `${date}T12:00:00.000Z`,
  read: false,
  saved: false,
  topics: [],
  ...extra
});

const itemsByDate = new Map([
  ['2026-10-25', [
    baseItem('demo-1', '2026-10-25', 'youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Shared video for the ORIN demo', 'A video shared from the Share tab.', { contribution: { kind: 'url', sharedBy: 'you', note: 'Useful for showing shared sources.' } }),
    baseItem('demo-2', '2026-10-25', 'linkedin', 'https://www.linkedin.com/', 'LinkedIn post from the demo digest', 'A professional systems update.', { category: 'Agents', categorySource: 'user' }),
    baseItem('demo-3', '2026-10-25', 'arxiv', 'https://arxiv.org/abs/2601.12345', 'A GPU paper from the demo digest', 'An excerpt about efficient kernels.', { category: 'GPU kernels', categorySource: 'model' })
  ]],
  ['2026-10-24', [
    baseItem('demo-4', '2026-10-24', 'hackernews', 'https://news.ycombinator.com/', 'Hacker News thread from yesterday', 'A systems discussion.')
  ]]
]);

const digestByDate = new Map([
  ['2026-10-25', {
    title: 'The ORIN demo digest',
    summary: 'A local digest used to demonstrate archive, source filtering, and shared contributions.',
    groups: [{ title: 'Demo thread', summary: 'Shared and gathered sources.', urls: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://arxiv.org/abs/2601.12345'] }]
  }],
  ['2026-10-24', {
    title: 'Yesterday’s ORIN demo digest',
    summary: 'An earlier digest for the archive list.',
    groups: [{ title: 'Earlier thread', summary: 'A previous systems thread.', urls: ['https://news.ycombinator.com/'] }]
  }]
]);

export const getDemoDigest = date => {
  const selected = date && itemsByDate.has(date) ? date : demoDates[0];
  return {
    date: selected,
    availableDates: [...demoDates],
    digest: digestByDate.get(selected) || null,
    items: itemsByDate.get(selected).map(item => ({ ...item })),
    sourceStatus: demoDates.includes(selected) ? [{ source: 'youtube', status: 'ok', message: 'Demo source is available.' }] : []
  };
};

export const getDemoCategories = () => [
  { label: 'GPU kernels', items: 1 },
  { label: 'Quantization', items: 0 },
  { label: 'Inference', items: 0 },
  { label: 'Training', items: 0 },
  { label: 'Agents', items: 1 },
  { label: 'AI hardware', items: 0 },
  { label: 'Research', items: 0 }
];

export const addDemoContribution = ({ url, note = '', category = null, date = demoDates[0] }) => {
  const day = itemsByDate.has(date) ? date : demoDates[0];
  const id = `demo-${Math.random().toString(16).slice(2)}`;
  const hostname = new URL(url).hostname.replace(/^www\./, '');
  itemsByDate.get(day).push(baseItem(id, day, 'shared', url, `Shared link from ${hostname}`, note || 'Added from the Share tab for review.', {
    contribution: { kind: 'url', sharedBy: 'you', ...(note ? { note } : {}) },
    ...(category ? { category, categorySource: 'user' } : {})
  }));
  return { id, date: day, url, category, existed: false };
};
