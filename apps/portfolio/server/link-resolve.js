// Share-time link metadata, Show HN style: when any source is added, read what
// the page says about itself and prefill title/excerpt — the owner's own text
// always wins if they typed one. Resolution is a chain so each URL pays for at
// most one network round trip: YouTube and GitHub have dedicated APIs, every
// other link is read as HTML (robots-agnostic OG / <title> / JSON-LD) with the
// collector's bounded reader. Login-walled hosts are skipped entirely because
// an unauthenticated fetch only burns time.
import { fetchDocument, extractDocumentMeta, publicHttpUrl, isWalledHost, isPlaceholderTitle } from '../../../apps/orin-collector/link-meta.mjs';
import { githubMetadata, githubRepo } from './github.js';
import { youtubeId, youtubeMetadata } from './youtube.js';

export async function resolveShareLink(value, { fetcher = fetch, timeoutMs = 4000, maxBytes = 500_000, token } = {}) {
  if (youtubeId(value)) {
    const meta = await youtubeMetadata(value).catch(() => null);
    return meta ? { ...meta, via: 'youtube' } : null;
  }
  if (githubRepo(value)) {
    const meta = await githubMetadata(value, { fetcher, token });
    return meta ? { ...meta, via: 'github' } : null;
  }
  const target = publicHttpUrl(value);
  if (!target || isWalledHost(target.hostname)) return null;
  try {
    const document = await fetchDocument(target, { fetchImpl: fetcher, timeoutMs, maxBytes });
    const meta = extractDocumentMeta(document.body || '', document.finalUrl || target.href);
    if (!meta.title && !meta.excerpt && !meta.author) return null;
    return {
      ...(meta.title ? { title: meta.title, titleSource: 'page' } : {}),
      ...(meta.excerpt ? { excerpt: meta.excerpt } : {}),
      ...(meta.author ? { author: meta.author } : {}),
      ...(meta.publishedAt ? { publishedAt: meta.publishedAt } : {}),
      via: 'page',
    };
  } catch { return null; }
}

// Lazy repair backfill, last in the chain: legacy items shared before this
// feature ran get their "Shared link from hostname" placeholder replaced a few
// rows per ORIN visit, always behind YouTube's and GitHub's dedicated repair
// passes. Guarded like repairYoutubeTitles: a concurrent owner edit (a changed
// title) or existing metadata makes the write a no-op, and titleCheckedAt
// spaces reattempts across visits. Walled hosts never resolve; they just get
// re-stamped later, keeping this a cheap background pass.
export async function repairLinkTitles(rows, sql, options = {}) {
  const candidates = rows
    .filter(({ item }) => !item.deleted && !item.titleSource
      && publicHttpUrl(item.url) && !isWalledHost(new URL(item.url).hostname)
      && !youtubeId(item.url) && !githubRepo(item.url)
      // Only transport labels ("Shared link from hostname", bare hosts, bare
      // URLs) go back to the page; an owner-typed title is never overwritten.
      && isPlaceholderTitle(item.title, item.url))
    .sort((a, b) => (a.item.titleCheckedAt || '').localeCompare(b.item.titleCheckedAt || ''))
    .slice(0, 8);
  await Promise.all(candidates.map(async row => {
    const resolved = await resolveShareLink(row.item.url, options);
    const metadata = { titleCheckedAt: new Date().toISOString(), ...(resolved || {}) };
    const patch = JSON.stringify(metadata);
    const [updated] = await sql`UPDATE orin_items SET item = item || ${patch}::jsonb
      WHERE id = ${row.id ?? row.item.id} AND item->>'title' = ${row.item.title} AND NOT (item ? 'titleSource') RETURNING item, is_read, saved`;
    if (updated) {
      row.item = updated.item;
      row.read = row.is_read = updated.is_read;
      row.saved = updated.saved;
    }
  }));
  return rows;
}
