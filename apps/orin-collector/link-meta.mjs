// Link enrichment for archived chat shares. Items imported from messaging apps
// arrive with placeholder labels ("YouTube Video", "Shared Google Link") and no
// excerpt, so the reading archive stores a link with nothing readable in it.
// This module recovers what a page says about itself — title, description,
// author, canonical URL — using only public HTML and YouTube's oEmbed endpoint.
// It never invents a summary: when a page cannot be read the result is marked
// with a lower confidence and the backfill can ask a model to describe the link
// from the evidence that was actually retrievable.
import { plainText } from './core.mjs';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 ORIN-archive/1.0';
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const HTML_TYPES = /^(text\/html|application\/xhtml\+xml)/i;
const TRACKING_PARAM = /^(utm_|si$|feature$|shem$|pp$|ab_channel$|ref$|ref_src$|trk$|trkInfo$|trackingId$|share$|share_via$|share_campaign$)/i;

// Hosts that serve a login wall or bot challenge to any unauthenticated client.
// Fetching them only burns rate limit, so their titles are derived from the URL.
const WALLED_HOSTS = [
  /(^|\.)linkedin\.com$/, /(^|\.)lnkd\.in$/, /(^|\.)x\.com$/, /(^|\.)twitter\.com$/,
  /(^|\.)instagram\.com$/, /(^|\.)facebook\.com$/, /(^|\.)threads\.(com|net)$/, /(^|\.)t\.co$/,
];

const PLACEHOLDER_TITLES = [
  /^youtube\b.*\b(video|short|playlist|watch|live stream|video watch page)\b/i,
  /^you?tube$/i,
  /^(shortened\s+)?linkedin\b.*\b(link|post|redirect|safety|shortened|activity post)\b/i,
  /^linkedin(\s+(shortened|shared)\s+link)?$/i,
  /^instagram\b.*\b(reel|post)\b/i,
  /^(shared|share|google|google shared|shared google)\b.*\b(link|location pin|location link|maps|search app link|search result link|chatgpt conversation)\b/i,
  /^(google|linkedin|youtube|instagram|threads|x|facebook|chatgpt|tiktok)$/i,
  /^https?:\/\//i,
  /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+\/[^\s]*$/i,
];

export function isWalledHost(hostname) {
  return WALLED_HOSTS.some(pattern => pattern.test(hostname));
}

// A placeholder is a label that names the transport ("Google shared link")
// instead of the artifact, or a bare URL/hostname copied from the chat text.
export function isPlaceholderTitle(value, url = '') {
  const title = String(value ?? '').trim();
  if (!title) return true;
  if (PLACEHOLDER_TITLES.some(pattern => pattern.test(title))) return true;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (title === host || title.startsWith(`${host}/`) || title === host.replace(/^www\./, '')) return true;
  } catch { /* non-URL items only match the patterns above */ }
  return false;
}

// Accept only public HTTP(S) URLs with no credentials or explicit port. A link
// from a chat archive is untrusted input; the backfill must not follow it into
// localhost, link-local metadata services, or a private network address.
export function publicHttpUrl(value) {
  let url;
  try { url = value instanceof URL ? new URL(value.href) : new URL(String(value)); }
  catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  if (host.includes(':')) return null;
  url.hash = '';
  return url;
}

export function youTubeId(value) {
  let url;
  try { url = new URL(String(value)); } catch { return null; }
  const host = url.hostname.replace(/^www\./, '');
  const id = host === 'youtu.be'
    ? url.pathname.split('/')[1]
    : ['youtube.com', 'm.youtube.com'].includes(host)
      ? (url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{6,})/)?.[1])
      : null;
  return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
}

export function cleanUrl(value) {
  const url = publicHttpUrl(value);
  if (!url) return null;
  // A resolved Maps place carries a half-kilobyte of app metadata that means
  // nothing outside the app; the coordinates are the place.
  const place = url.hostname === 'www.google.com' || url.hostname === 'google.com' ? url.pathname.match(/^\/maps\/place\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/) : null;
  if (place) return `https://www.google.com/maps/place/${place[1]},${place[2]}`;
  for (const name of [...url.searchParams.keys()]) if (TRACKING_PARAM.test(name)) url.searchParams.delete(name);
  return url.toString();
}

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function humanizeSlug(value) {
  const text = safeDecode(String(value ?? '')).replace(/\.(html?|php|aspx?|pdf)$/i, '').replace(/[-_+.]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function displayName(slug) {
  return safeDecode(String(slug ?? '')).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, letter => letter.toUpperCase());
}

function truncateWords(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const boundary = cut.lastIndexOf(' ');
  return (boundary > max * 0.6 ? cut.slice(0, boundary) : cut).replace(/[\s,;:.-]+$/, '');
}

function attachmentUrlTitle(value) {
  const raw = String(value ?? '');
  const name = safeDecode(raw.replace(/^[a-z-]+:(\/\/)?/i, '').split(/[\\/]/).pop() || '').replace(/\.(pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|webp|txt|zip|mp4|mp3|m4a|opus)$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return name ? humanizeSlug(name) : 'Chat attachment';
}

// A readable label recovered from the URL alone. This is the floor of the
// enrichment: every item keeps a title that names what it is, even offline.
export function deriveTitle(value) {
  const raw = String(value ?? '');
  let url = publicHttpUrl(raw);
  if (!url) return attachmentUrlTitle(raw);
  const host = url.hostname.replace(/^(www|m|mobile)\./, '');
  const parts = url.pathname.split('/').filter(Boolean).map(safeDecode);
  // LinkedIn wraps outbound links in a redirect page; the real target is the
  // only thing that can name the item.
  const redirectTarget = url.searchParams.get('url');
  if (redirectTarget && host === 'linkedin.com' && /\/(redir|safety)\//.test(url.pathname)) {
    const inner = publicHttpUrl(redirectTarget);
    if (inner) return deriveTitle(inner.href);
  }
  const videoId = youTubeId(url);
  if (videoId) return `YouTube video ${videoId}`;
  if (host === 'youtube.com') {
    if (parts[0] === 'playlist') return `YouTube playlist ${url.searchParams.get('list') || parts[1] || ''}`.trim();
    if (parts[0] === 'channel' || parts[0]?.startsWith('@')) return `YouTube channel ${parts.at(-1)}`;
    if (parts[0] === 'results') return `YouTube search: ${url.searchParams.get('search_query') || ''}`.trim();
  }
  if (host === 'lnkd.in') return `LinkedIn short link ${parts.join('/')}`.trim();
  if (host === 'linkedin.com') {
    const [type, id] = parts;
    if (type === 'in' && id) return `${displayName(id)} — LinkedIn profile`;
    if (type === 'company' && id) return `${displayName(id)} — LinkedIn company page`;
    if (type === 'jobs' && parts[1] === 'view' && parts[2]) return `LinkedIn job listing ${parts[2]}`;
    if (type === 'posts' && id) return `${displayName(id).slice(0, 60)} — LinkedIn post`;
    if (type === 'pulse' && id) return `${humanizeSlug(id)} (LinkedIn article)`;
    if (type === 'feed' && parts[1] === 'update') return `LinkedIn post ${String(parts.at(-1)).replace(/[^0-9]/g, '')}`;
    if (type === 'events' && id) return `${humanizeSlug(id)} (LinkedIn event)`;
    return `LinkedIn ${type || 'page'}${id ? ` ${id}` : ''}`.trim();
  }
  if (['x.com', 'twitter.com'].includes(host)) {
    const [user, kind, id] = parts;
    if (kind === 'status' && id) return `@${user} on X (post ${id})`;
    return user ? `@${user} on X` : 'X post';
  }
  if (['instagram.com', 'facebook.com', 'threads.com', 'threads.net'].includes(host)) {
    const label = host.split('.')[0];
    // These permalinks end in a readable slug when the post has text.
    const slug = parts.find(part => part.length > 24 && part.includes('-'));
    if (slug) return `${truncateWords(humanizeSlug(slug), 90)} (${label})`;
    return `${humanizeSlug(parts[0] || label)} (${label})`;
  }
  if (host === 'github.com') {
    if (parts.length >= 2) return `${parts[0]}/${parts[1]} — GitHub repository`;
    if (parts[0]) return `${displayName(parts[0])} on GitHub`;
    return 'GitHub';
  }
  if (host === 'gist.github.com') return `GitHub gist ${parts.slice(0, 2).join('/')}`.trim();
  if (host === 'arxiv.org' && parts[0] === 'abs' && parts[1]) return `arXiv ${parts[1]}`;
  if (host === 'huggingface.co') return `Hugging Face ${parts.slice(0, 2).join('/') || 'page'}`;
  if (host === 'docs.google.com') {
    const kind = parts[0] === 'spreadsheets' ? 'spreadsheet' : parts[0] === 'presentation' ? 'presentation' : 'document';
    return `Google ${kind} ${parts.at(-1)?.slice(0, 24) || ''}`.trim();
  }
  if (host === 'drive.google.com') return `Google Drive file ${parts[2] || parts.at(-1) || ''}`.trim();
  if (host === 'search.app') return `Google shared link (search.app/${parts[0] || ''})`.replace('/)', ')');
  if (host === 'maps.app.goo.gl' || host === 'goo.gl') return `Google Maps or short link (${host}/${parts[0] || ''})`.replace('/)', ')');
  if (host === 'maps.google.com') {
    const query = url.searchParams.get('q') || url.searchParams.get('query');
    return query ? `Google Maps: ${humanizeSlug(query)}` : `Google Maps location ${parts.at(-1) || ''}`.trim();
  }
  if (host === 'google.com') {
    if (parts[0] === 'search') return `Google search: ${url.searchParams.get('q') || ''}`.trim();
    if (parts[0] === 'maps') {
      const place = url.pathname.match(/\/maps\/place\/([^/]+)/)?.[1];
      const coords = url.pathname.match(/\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
      if (place && !place.startsWith('@') && !/^-?\d/.test(place)) return `Google Maps: ${humanizeSlug(place)}`;
      if (coords) return `Google Maps location ${coords[1]}, ${coords[2]}`;
      return 'Google Maps location';
    }
    return `Google ${parts[0] || 'page'}${parts[1] ? ` ${parts[1]}` : ''}`;
  }
  if (host === 'medium.com' || host.endsWith('.medium.com') || host === 'towardsdatascience.com' || host.endsWith('.substack.com')) {
    const slug = parts.at(-1)?.replace(/-[0-9a-f]{8,}$/i, '');
    return slug ? humanizeSlug(slug) : humanizeSlug(host);
  }
  if (host === 'reddit.com') {
    if (parts[0] === 'r' && parts[1]) return `r/${parts[1]}${parts[2] === 'comments' ? ' discussion' : ''}`;
    return 'Reddit discussion';
  }
  // The most descriptive path segment is usually the longest one; trailing ids
  // and pagination numbers carry no meaning.
  const slug = [...parts.filter(part => !/^(index|home|en|en-us)$/i.test(part))].sort((a, b) => b.length - a.length)[0];
  if (slug && !/^\d+$/.test(slug) && /[a-z]{3}/i.test(slug)) return `${truncateWords(humanizeSlug(slug), 80)} (${host})`;
  return `${host}${url.pathname === '/' ? '' : ` ${url.pathname}`}`.trim();
}

function readBounded(response, maxBytes) {
  if (!response.body) return Promise.resolve('');
  const reader = response.body.getReader();
  const chunks = []; let length = 0;
  return (async () => {
    try {
      while (length < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); length += value.length;
      }
    } catch { /* A truncated body still carries the document head. */ }
    finally { await reader.cancel().catch(() => {}); }
    return Buffer.concat(chunks).subarray(0, maxBytes).toString('utf8');
  })();
}

// Follow redirects by hand so every hop is checked: chat share links hide their
// destination behind several shorteners, and some of them hop to a private host.
export async function fetchDocument(value, { fetchImpl = fetch, maxHops = 6, maxBytes = 1_200_000, timeoutMs = 15_000, accept = 'text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5' } = {}) {
  let current = publicHttpUrl(value);
  if (!current) throw new Error('unsupported-url');
  const hops = [];
  for (let hop = 0; hop <= maxHops; hop++) {
    const response = await fetchImpl(current.href, {
      redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': USER_AGENT, Accept: accept, 'Accept-Language': 'en-US,en;q=0.8' },
    });
    if (REDIRECT_STATUS.has(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => {});
      if (!location) throw new Error('redirect-without-location');
      const next = publicHttpUrl(new URL(location, current));
      if (!next) throw new Error('redirect-to-unsupported-url');
      hops.push(current.href); current = next;
      continue;
    }
    const contentType = response.headers.get('content-type') || '';
    const readable = !contentType || HTML_TYPES.test(contentType) || /json/i.test(contentType);
    const body = readable ? await readBounded(response, maxBytes) : '';
    return { finalUrl: current.href, status: response.status, contentType, body, redirected: hops.length > 0, hops };
  }
  throw new Error('too-many-redirects');
}

function getAttribute(tag, name) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));
  return match ? (match[2] ?? match[3] ?? match[4] ?? '') : '';
}

function metaTags(html) {
  const values = new Map();
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = (getAttribute(tag, 'property') || getAttribute(tag, 'name') || getAttribute(tag, 'itemprop')).toLowerCase();
    const content = plainText(getAttribute(tag, 'content'));
    if (key && content && !values.has(key)) values.set(key, content);
  }
  return values;
}

function jsonLdObjects(html) {
  const objects = [];
  for (const match of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length) {
        const row = queue.shift();
        if (!row || typeof row !== 'object') continue;
        if (Array.isArray(row['@graph'])) queue.push(...row['@graph']);
        objects.push(row);
      }
    } catch { /* Malformed structured data is not worth failing a page over. */ }
  }
  return objects;
}

function siteSuffix(title, site, host) {
  let text = plainText(title);
  const names = [site, host, host?.replace(/^www\./, ''), humanizeSlug(host?.split('.')[0])].filter(Boolean);
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`\\s*[|·—–-]\\s*${escaped}$`, 'i'), '');
  }
  text = text.replace(/^GitHub\s*[-–—|]\s*/i, '').replace(/\s*·\s*GitHub$/i, '');
  // Sites without og:site_name still append their brand ("A KV cache you can
  // fork | Simmis"). Drop a trailing segment that matches the hostname.
  const compact = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const signature = compact(host);
  const segments = text.split(/\s*[|·—–]\s*|\s+-\s+/);
  const matchesHost = segment => {
    const compacted = compact(segment);
    return compacted.length >= 4 && signature && (compacted === signature || signature.includes(compacted));
  };
  if (segments.length > 1 && matchesHost(segments.at(-1))) text = segments.slice(0, -1).join(' ');
  // "Notion | Where teams and agents work together" puts the brand first.
  else if (segments.length > 1 && matchesHost(segments[0])) text = segments.slice(1).join(' ');
  return text.replace(/\s+/g, ' ').trim();
}

// CMS plugins leak their own metadata into descriptions ("- Focus keyphrase: …",
// "Read more…"). None of it describes the artifact.
function cleanDescription(value) {
  return plainText(value)
    .replace(/\s*[-–—|]?\s*(focus keyphrase|keyphrase|meta description|seo title)\s*:.*$/i, '')
    .replace(/\s*(read more|continue reading|click here to read more)\.?$/i, '')
    .replace(/\s+/g, ' ').trim();
}

// Bot walls, consent gates and bare site names produce a title with no
// information in it. Treat those as unreadable so the URL-derived label and the
// model fallback can take over instead of storing "Threads" as a video title.
const UNUSABLE_TITLES = /^(just a moment|access denied|attention required|are you a robot|log ?in|sign ?in|linkedin|threads|instagram|facebook|google|youtube|x|403 forbidden|404 not found|page not found)\.{0,3}$/i;

function isUnusableTitle(title, site, host) {
  const text = String(title || '').trim().toLowerCase();
  if (!text || UNUSABLE_TITLES.test(text)) return true;
  if (text.length < 4 && !/\s/.test(text)) return true;
  const names = [site, host, host?.replace(/^www\./, ''), humanizeSlug(host?.split('.')[0])].filter(Boolean).map(value => value.toLowerCase());
  return names.includes(text);
}

export function extractDocumentMeta(html, finalUrl) {
  if (!html) return {};
  const metas = metaTags(html);
  const structured = jsonLdObjects(html);
  let host = '';
  try { host = new URL(finalUrl).hostname; } catch { /* derive from nothing */ }
  const site = metas.get('og:site_name') || metas.get('application-name') || host;
  const rawTitle = metas.get('og:title') || metas.get('twitter:title') || plainText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  const structuredTitle = structured.map(row => row.headline || row.name).find(value => typeof value === 'string' && value.trim());
  const candidate = siteSuffix(rawTitle || structuredTitle || '', site, host).slice(0, 300);
  const title = isUnusableTitle(candidate, site, host) ? '' : candidate;
  const description = [
    metas.get('og:description'), metas.get('twitter:description'), metas.get('description'),
    structured.map(row => row.description).find(value => typeof value === 'string' && value.trim()),
  ].find(value => typeof value === 'string' && value.trim().length > 12) || '';
  const author = [metas.get('author'), metas.get('article:author'), metas.get('og:article:author'), ...structured.map(row => row.author?.name || (typeof row.author === 'string' ? row.author : null))]
    .find(value => typeof value === 'string' && value.trim() && !/^https?:/i.test(value)) || '';
  const published = [metas.get('article:published_time'), metas.get('date'), ...structured.map(row => row.datePublished)].find(value => typeof value === 'string' && Number.isFinite(Date.parse(value))) || '';
  return {
    ...(title ? { title } : {}),
    ...(description ? { excerpt: cleanDescription(description).slice(0, 800) } : {}),
    ...(author ? { author: plainText(author).slice(0, 200) } : {}),
    ...(published ? { publishedAt: new Date(published).toISOString() } : {}),
    ...(site && site !== host ? { site: plainText(site).slice(0, 120) } : {}),
  };
}

// YouTube exposes the title, channel, publish date and description inside the
// watch page's player response. oEmbed is the fallback: title and channel only.
export async function youTubeMeta(videoId, { fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const page = await fetchDocument(watchUrl, { fetchImpl, timeoutMs, maxBytes: 2_500_000 });
    const html = page.body || '';
    const jsonString = key => {
      const match = html.match(new RegExp(`"${key}":"((?:[^"\\\\]|\\\\.)*)"`));
      if (!match) return '';
      try { return JSON.parse(`"${match[1]}"`); } catch { return ''; }
    };
    const title = jsonString('title');
    const description = jsonString('shortDescription');
    const channel = jsonString('ownerChannelName');
    const publishedAt = jsonString('publishDate');
    if (title) return {
      finalUrl: watchUrl, title: plainText(title).slice(0, 300),
      excerpt: cleanVideoDescription(description),
      ...(channel ? { author: plainText(channel).slice(0, 200) } : {}),
      ...(Number.isFinite(Date.parse(publishedAt)) ? { publishedAt: new Date(publishedAt).toISOString() } : {}),
      site: 'YouTube', via: 'youtube',
    };
  } catch { /* Fall back to the smaller oEmbed payload. */ }
  const response = await fetchImpl(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`, {
    redirect: 'error', signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`YouTube oEmbed returned HTTP ${response.status}`);
  const payload = JSON.parse(await readBounded(response, 200_000));
  if (typeof payload.title !== 'string' || !payload.title.trim()) throw new Error('YouTube oEmbed returned no title');
  return {
    finalUrl: watchUrl, title: plainText(payload.title).slice(0, 300),
    ...(payload.author_name ? { author: plainText(payload.author_name).slice(0, 200) } : {}),
    site: 'YouTube', via: 'youtube',
  };
}

const PLATFORM_NAMES = { 'linkedin.com': 'LinkedIn', 'lnkd.in': 'LinkedIn', 'x.com': 'X', 'twitter.com': 'X', 'instagram.com': 'Instagram', 'facebook.com': 'Facebook', 'threads.com': 'Threads', 'threads.net': 'Threads', 't.co': 'X' };

// Video descriptions open with sponsor links, course promos and timestamps.
// The archive wants the description of the video, not the sales pitch.
function cleanVideoDescription(value) {
  const lines = [];
  for (const raw of String(value || '').split('\n')) {
    const line = raw.trim();
    // Everything after a chapter list header describes the timeline, not the video.
    if (/^(timestamps?|chapters?|show ?notes|table of contents)$/i.test(line)) break;
    if (!line || /^(https?:\/\/|www\.)/i.test(line) || /[\w.+-]+@[\w.-]+\.\w{2,}/.test(line)) continue;
    // A short line ending in a colon introduces a list of links or credits.
    if (line.length <= 40 && line.endsWith(':')) continue;
    if (/^[\d:.\s–-]{3,}$/.test(line) || /^\d{1,2}:\d{2}(:\d{2})?\s*\S/.test(line)) continue;
    if (/(subscribe|patreon|sponsor|discord|instagram|twitter|facebook|linkedin|tiktok|skool\.com|bit\.ly|use code|coupon)/i.test(line)) continue;
    lines.push(line);
  }
  let text = plainText(lines.join(' '));
  // A description written as one paragraph still hides its promos in sentences.
  const promo = /(subscribe|patreon|sponsor|discord|skool\.com|bit\.ly|use code|coupon|free course|my course|newsletter)/i;
  const sentences = text.split(/(?<=[.!?])\s+/).filter(sentence => !/https?:\/\/|www\./i.test(sentence) && !promo.test(sentence));
  if (sentences.length) text = sentences.join(' ');
  if (text.length <= 500) return text;
  const cut = text.slice(0, 500);
  const lastSentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return (lastSentence > 120 ? cut.slice(0, lastSentence + 1) : cut).trim();
}

function fallbackExcerpt(url, reason) {
  const title = deriveTitle(url);
  let host = '';
  try { host = new URL(url).hostname.replace(/^(www|m|mobile)\./, ''); } catch { /* attachment or malformed link */ }
  const platform = PLATFORM_NAMES[host];
  const why = platform ? `${platform} serves an unauthenticated visitor a sign-in wall` : reason === 'timeout' ? 'the request timed out' : 'the page returned nothing readable';
  return `${title}. Shared from ${host || 'a chat attachment'}; ${why}, so the archived entry keeps the link without a page summary.`;
}

// Enrich one archived item. Returns only improved fields plus an `enrichment`
// stamp; the caller decides whether the result is worth writing back.
export async function enrichItem(item, options = {}) {
  const result = await resolveItem(item, options);
  // Page text occasionally arrives with unpaired UTF-16 surrogates (truncated
  // emoji in a video description). PostgreSQL rejects those as JSONB, and one
  // bad byte must never abort a whole write batch.
  return {
    ...result,
    title: safeText(result.title, 500),
    ...(result.excerpt ? { excerpt: safeText(result.excerpt, 12000) } : {}),
    ...(result.author ? { author: safeText(result.author, 200) } : {}),
  };
}

export function safeText(value, max = 12_000) {
  return String(value ?? '')
    .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '')
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

async function resolveItem(item, { fetchImpl = fetch, timeoutMs = 15_000, maxBytes = 1_200_000 } = {}) {
  const url = String(item?.url ?? '');
  const at = new Date().toISOString();
  if (!publicHttpUrl(url)) {
    const title = deriveTitle(url);
    return { title, excerpt: `${title}. A file shared in chat; the original stays with the sender, so there is no public page to read.`, enrichment: { at, via: 'attachment', confidence: 'medium' } };
  }
  let host = '';
  try { host = new URL(url).hostname; } catch { /* unreachable after the check above */ }
  const videoResult = meta => ({
    title: meta.title,
    ...(meta.excerpt ? { excerpt: meta.excerpt } : { excerpt: `${meta.title}${meta.author ? ` by ${meta.author}` : ''}. A YouTube video shared in chat; YouTube exposes no description for it.` }),
    ...(meta.author ? { author: meta.author } : {}),
    ...(meta.publishedAt ? { publishedAt: meta.publishedAt } : {}),
    resolvedUrl: meta.finalUrl,
    enrichment: { at, via: 'youtube', confidence: meta.excerpt ? 'high' : 'medium', ...(meta.excerpt ? {} : { note: 'YouTube returned no description' }) },
  });
  const videoId = youTubeId(url);
  if (videoId) {
    try { return videoResult(await youTubeMeta(videoId, { fetchImpl, timeoutMs })); }
    catch {
      const title = `YouTube video ${videoId}`;
      return { title, excerpt: `${title}. YouTube did not return this video's title during the archive rebuild; the link is kept exactly as it was shared.`, enrichment: { at, via: 'fallback', confidence: 'low', note: 'youtube-unavailable' } };
    }
  }
  if (isWalledHost(host)) {
    return { title: deriveTitle(url), excerpt: fallbackExcerpt(url, 'sign-in required'), enrichment: { at, via: 'host', confidence: 'medium', note: 'walled-host' } };
  }
  try {
    const doc = await fetchDocument(url, { fetchImpl, timeoutMs, maxBytes });
    if (doc.status >= 400) throw new Error(`HTTP ${doc.status}`);
    const resolvedUrl = cleanUrl(doc.finalUrl);
    const finalHost = new URL(doc.finalUrl).hostname;
    // Share links often land on a video. Re-read it as a video so the archive
    // keeps the full description instead of the truncated meta tag.
    const finalVideoId = youTubeId(doc.finalUrl);
    if (finalVideoId && finalVideoId !== videoId) {
      try { return { ...videoResult(await youTubeMeta(finalVideoId, { fetchImpl, timeoutMs })), ...(resolvedUrl && resolvedUrl !== url ? { resolvedUrl } : {}) }; }
      catch { /* Fall through to whatever the landing page itself declares. */ }
    }
    // Shorteners happily land on a login wall; the resolved URL still names the
    // artifact better than the shortener ever could.
    if (isWalledHost(finalHost)) {
      return {
        title: deriveTitle(doc.finalUrl),
        excerpt: fallbackExcerpt(doc.finalUrl, 'sign-in required'),
        ...(resolvedUrl && resolvedUrl !== url ? { resolvedUrl } : {}),
        enrichment: { at, via: 'host', confidence: 'medium', note: 'walled-host' },
      };
    }
    const meta = extractDocumentMeta(doc.body, doc.finalUrl);
    if (meta.title) {
      const excerpt = meta.excerpt || `${meta.title}${meta.site ? ` on ${meta.site}` : ''}. ${finalHost} returned no page description, so the entry keeps only the recovered title.`;
      return {
        title: meta.title, excerpt,
        ...(meta.author ? { author: meta.author } : {}),
        ...(meta.publishedAt ? { publishedAt: meta.publishedAt } : {}),
        ...(resolvedUrl && resolvedUrl !== url ? { resolvedUrl } : {}),
        enrichment: { at, via: 'page', confidence: meta.excerpt ? 'high' : 'medium', ...(meta.excerpt ? {} : { note: 'no page description' }) },
      };
    }
    throw new Error('no metadata');
  } catch (error) {
    if (error.name === 'TimeoutError') {
      return {
        title: deriveTitle(url),
        excerpt: fallbackExcerpt(url, 'timeout'),
        enrichment: { at, via: 'fallback', confidence: 'low', note: 'timeout' },
      };
    }
    return {
      title: deriveTitle(url),
      excerpt: fallbackExcerpt(url),
      enrichment: { at, via: 'fallback', confidence: 'low', note: String(error.message || 'unreadable').slice(0, 120) },
    };
  }
}

const CHAT_AUTHOR = /^WhatsApp\b/i;

// An archived item is worth repairing when its label names the transport rather
// than the artifact, or when it has no body at all.
export function needsEnrichment(item) {
  return !String(item?.excerpt ?? '').trim() || isPlaceholderTitle(item?.title, item?.url);
}

// Build the write-back patch. Stored titles and descriptions are never replaced
// unless they were missing or placeholders (or the caller explicitly refreshes),
// so an owner's edits and earlier good metadata survive every run.
export function enrichmentPatch(item, result, { refresh = false } = {}) {
  const currentTitle = String(item?.title ?? '').trim();
  const currentExcerpt = String(item?.excerpt ?? '').trim();
  const enrichment = { ...result.enrichment };
  if (currentTitle && currentTitle !== result.title) enrichment.originalTitle = safeText(currentTitle, 300);
  const patch = { enrichment };
  if (result.title && result.title !== currentTitle && (refresh || !currentTitle || isPlaceholderTitle(currentTitle, item?.url))) patch.title = safeText(result.title, 500);
  if (result.excerpt && result.excerpt !== currentExcerpt && (refresh || !currentExcerpt)) patch.excerpt = safeText(result.excerpt, 12000);
  if (result.author) {
    const currentAuthor = String(item?.author ?? '').trim();
    if (!currentAuthor) patch.author = safeText(result.author, 200);
    else if (CHAT_AUTHOR.test(currentAuthor) && currentAuthor !== result.author) {
      // Keep the chat provenance instead of dropping it: the page author is what
      // a reader recognizes, the shared-by label is how the item arrived.
      patch.author = safeText(result.author, 200);
      patch.sharedBy = safeText(currentAuthor, 200);
    }
  }
  if (result.publishedAt && !item?.publishedAt && Number.isFinite(Date.parse(result.publishedAt))) patch.publishedAt = new Date(result.publishedAt).toISOString();
  if (result.resolvedUrl && result.resolvedUrl !== item?.url && publicHttpUrl(result.resolvedUrl)) patch.resolvedUrl = result.resolvedUrl;
  return patch;
}
