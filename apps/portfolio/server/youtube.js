// Only video IDs go to the fixed YouTube endpoint; never fetch a supplied host.
export function youtubeId(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.replace(/^www\./, '');
    const parts = url.pathname.split('/').filter(Boolean);
    const id = host === 'youtu.be' ? parts[0]
      : ['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)
        ? (url.pathname === '/watch' ? url.searchParams.get('v') : ['shorts', 'live', 'embed'].includes(parts[0]) ? parts[1] : null)
        : null;
    return /^[a-zA-Z0-9_-]{11}$/.test(id || '') ? id : null;
  } catch { return null; }
}

export async function youtubeMetadata(value, fetcher = fetch) {
  const id = youtubeId(value);
  if (!id) return null;
  try {
    const endpoint = new URL('https://www.youtube.com/oembed');
    endpoint.searchParams.set('url', `https://www.youtube.com/watch?v=${id}`);
    endpoint.searchParams.set('format', 'json');
    const response = await fetcher(endpoint, { signal: AbortSignal.timeout(4000), redirect: 'error', headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const data = await response.json();
    const clean = (text, max) => typeof text === 'string' ? text.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '';
    const title = clean(data.title, 500);
    return title ? { title, author: clean(data.author_name, 200), titleSource: 'youtube' } : null;
  } catch { return null; }
}

// Repair legacy placeholder captions a few at a time. A conditional update
// ensures a concurrent owner edit always wins over fetched metadata.
export async function repairYoutubeTitles(rows, sql, fetcher = fetch) {
  const candidates = rows.filter(({ item }) => !item.deleted && !item.titleSource && /^Shared link from (?:www\.)?(?:youtube\.com|m\.youtube\.com|music\.youtube\.com|youtu\.be)$/.test(item.title)).sort((a, b) => (a.item.titleCheckedAt || '').localeCompare(b.item.titleCheckedAt || '')).slice(0, 12);
  await Promise.all(candidates.map(async row => {
    const metadata = { ...(await youtubeMetadata(row.item.url, fetcher) || {}), titleCheckedAt: new Date().toISOString() };
    const [updated] = await sql`UPDATE orin_items SET item = item || ${JSON.stringify(metadata)}::jsonb WHERE id = ${row.id ?? row.item.id} AND item->>'title' = ${row.item.title} AND NOT (item ? 'titleSource') RETURNING item`;
    if (updated) row.item = updated.item;
  }));
  return rows;
}
