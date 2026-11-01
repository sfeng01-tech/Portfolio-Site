// GitHub repositories get real metadata the same way YouTube shares do: a repo
// URL resolves through the fixed api.github.com endpoint, never a supplied
// host. Unauthenticated requests suffice for personal volumes; a GITHUB_TOKEN
// (optional) raises the rate limit for backfills.
export function githubRepo(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (url.hostname.replace(/^www\./, '') !== 'github.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2 || parts[0].match(/^(?:logout|login|signup|dashboard|features|pricing|settings|topics|collections|explore|trending)$|^orgs$|^organizations$/i)) return null;
    const [owner, repo] = parts;
    if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.\-]+$/.test(repo)) return null;
    return `${owner}/${repo}`;
  } catch { return null; }
}

export async function githubMetadata(value, { fetcher = fetch, token = process.env.GITHUB_TOKEN } = {}) {
  const slug = githubRepo(value);
  if (!slug) return null;
  const clean = (text, max) => typeof text === 'string' ? text.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '';
  try {
    const endpoint = new URL(`https://api.github.com/repos/${slug}`);
    const response = await fetcher(endpoint, {
      signal: AbortSignal.timeout(4000), redirect: 'error',
      headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (response.status === 404 || response.status === 301) return null; // private or renamed-away repo
    if (!response.ok) return null;
    const data = await response.json();
    const title = typeof data.name === 'string' ? clean(data.name, 500) : '';
    if (!title) return null;
    return {
      title: title.slice(0, 1).toUpperCase() + title.slice(1),
      excerpt: clean(data.description, 1200) || undefined,
      author: clean(data.owner?.login || data.organization?.login || data.full_name?.split('/')[0], 200) || undefined,
      titleSource: 'github',
    };
  } catch { return null; }
}

// Backfill repos shared before this metadata pass existed. A conditional save
// guards against overwriting owner edits or fresher metadata forever.
export async function repairGithubTitles(rows, sql, options = {}) {
  const candidates = rows
    .filter(({ item }) => !item.deleted && !item.titleSource
      && new URL(item.url).hostname.replace(/^www\./, '') === 'github.com'
      && (item.category === 'Reference Projects' || /^Shared link from github\.com$/.test(item.title)))
    .sort((a, b) => (a.item.titleCheckedAt || '').localeCompare(b.item.titleCheckedAt || ''))
    .slice(0, 8);
  await Promise.all(candidates.map(async row => {
    const metadata = { ...(await githubMetadata(row.item.url, options) || {}), titleCheckedAt: new Date().toISOString() };
    if (!metadata.title && !metadata.excerpt) return;
    const [updated] = await sql`UPDATE orin_items SET item = item || ${JSON.stringify(metadata)}::jsonb
      WHERE id = ${row.id ?? row.item.id} AND item->>'title' = ${row.item.title} AND NOT (item ? 'titleSource') RETURNING item`;
    if (updated) row.item = updated.item;
  }));
  return rows;
}
