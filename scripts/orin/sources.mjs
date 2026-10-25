import { XMLParser } from 'fast-xml-parser';
import { allowedSourceUrl, normalizeItem, plainText } from './core.mjs';

export async function boundedText(response, maxBytes = 3_000_000) {
  if (!response.body) throw new Error('Empty response body');
  const reader = response.body.getReader();
  const chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxBytes) throw new Error('Source response too large');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks).toString('utf8');
}

export function parseFeed(xml, source, now = new Date()) {
  // Do not expand XML entities/DTDs from third party feeds.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Feed includes unsupported XML declarations');
  const parser = new XMLParser({ ignoreAttributes: false, processEntities: false, isArray: name => ['item', 'entry', 'link'].includes(name) });
  const parsed = parser.parse(xml);
  const entries = parsed.rss?.channel?.item || parsed.feed?.entry || [];
  return entries.slice(0, 200).flatMap(entry => {
    try {
      const links = Array.isArray(entry.link) ? entry.link : [entry.link];
      const article = links.find(link => typeof link === 'string' || link?.['@_rel'] === 'alternate' || !link?.['@_rel']);
      let url = typeof article === 'string' ? article : article?.['@_href'];
      let description = plainText(entry.description || entry.summary || entry.content || entry.title);
      if (source === 'hackernews') {
        // HN RSS has a publisher link and a separate discussion permalink.
        const match = String(entry.description || '').match(/https:\/\/news\.ycombinator\.com\/item\?id=\d+/);
        url = entry.comments || match?.[0] || url;
        description = `${plainText(entry.title)}. ${description} (HN title only; read the linked discussion for details.)`;
      }
      return [normalizeItem({ url, title: entry.title, excerpt: description, author: entry.author?.name || entry['dc:creator'] || entry.author, publishedAt: entry.pubDate || entry.published || entry.updated }, source, now)];
    } catch { return []; }
  });
}

export function createRedditApi({ clientId = process.env.REDDIT_CLIENT_ID, clientSecret = process.env.REDDIT_CLIENT_SECRET, username = process.env.REDDIT_USERNAME, fetchImpl = fetch } = {}) {
  let token;
  let tokenExpiresAt = 0;
  const userAgent = username && /^[A-Za-z0-9_-]{1,20}$/.test(username) ? `script:orin-daily-digest:v1.0 (by /u/${username})` : '';
  async function getAccessToken() {
    if (!clientId || !clientSecret || !userAgent) throw new Error('Reddit OAuth is not configured; set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, and a valid REDDIT_USERNAME');
    if (token && Date.now() < tokenExpiresAt - 60_000) return token;
    const response = await fetchImpl('https://www.reddit.com/api/v1/access_token', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': userAgent,
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    });
    if (!response.ok) throw new Error(response.status === 429 ? 'Reddit OAuth rate limited; waiting until next scheduled run' : `Reddit OAuth token request returned HTTP ${response.status}`);
    const body = JSON.parse(await boundedText(response, 100_000));
    if (typeof body.access_token !== 'string' || !Number.isFinite(body.expires_in)) throw new Error('Reddit OAuth returned an invalid token response');
    token = body.access_token;
    tokenExpiresAt = Date.now() + body.expires_in * 1000;
    return token;
  }
  return async function collectReddit(feed) {
    if (feed.source !== 'reddit' || !allowedSourceUrl('reddit', feed.url)) throw new Error('Reddit API URL is outside the configured source allowlist');
    const url = new URL(feed.url);
    if (url.hostname !== 'oauth.reddit.com' || !/^\/r\/[A-Za-z0-9_]+\/(top|hot|new|rising)$/.test(url.pathname)) throw new Error('Reddit sources must use an allowlisted OAuth listing URL');
    const response = await fetchImpl(url, {
      redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${await getAccessToken()}`, 'User-Agent': userAgent, Accept: 'application/json' },
    });
    if (response.status === 429) {
      const wait = response.headers.get('retry-after');
      throw new Error(`Reddit rate limited this source${wait && /^\d+$/.test(wait) ? `; Retry-After ${wait}s` : ''}; waiting until next scheduled run`);
    }
    if (!response.ok) throw new Error(`Reddit listing returned HTTP ${response.status}`);
    const payload = JSON.parse(await boundedText(response));
    const rows = payload?.data?.children;
    if (!Array.isArray(rows)) throw new Error('Reddit API returned an invalid listing');
    return rows.slice(0, 100).flatMap(({ data }) => {
      try {
        if (!data || typeof data.permalink !== 'string' || !data.permalink.startsWith('/r/')) return [];
        const created = Number(data.created_utc);
        const score = Number(data.score);
        const comments = Number(data.num_comments);
        return [normalizeItem({
          url: new URL(data.permalink, 'https://www.reddit.com').href,
          title: data.title,
          excerpt: data.selftext || data.title,
          author: data.author,
          publishedAt: Number.isFinite(created) ? new Date(created * 1000).toISOString() : undefined,
          metrics: { ...(Number.isFinite(score) ? { score } : {}), ...(Number.isFinite(comments) ? { comments } : {}) },
        }, 'reddit')];
      } catch { return []; }
    });
  };
}

export function createXApi({ bearerToken = process.env.X_API_BEARER_TOKEN, fetchImpl = fetch } = {}) {
  return async function collectX(feed) {
    if (feed.source !== 'twitter' || !allowedSourceUrl('twitter', feed.url)) throw new Error('X API URL is outside the configured source allowlist');
    const url = new URL(feed.url);
    if (url.hostname !== 'api.x.com' || url.pathname !== '/2/tweets/search/recent' || !url.searchParams.has('query')) throw new Error('X source must use the v2 recent search endpoint');
    if (!bearerToken) throw new Error('X API is not configured; set the X_API_BEARER_TOKEN Actions secret');
    const requested = Number(url.searchParams.get('max_results') || 10);
    if (!Number.isInteger(requested) || requested < 10 || requested > 50) throw new Error('X API daily read cap must be 10–50 posts per request');
    const response = await fetchImpl(url, {
      redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${bearerToken}`, 'User-Agent': 'ORIN-personal-digest/1.0', Accept: 'application/json' },
    });
    if (response.status === 429) {
      const reset = response.headers.get('x-rate-limit-reset');
      throw new Error(`X API rate or usage limit reached${reset && /^\d+$/.test(reset) ? `; reset epoch ${reset}` : ''}; waiting until next scheduled run`);
    }
    if (!response.ok) throw new Error(`X API returned HTTP ${response.status}; verify app access to recent search`);
    const payload = JSON.parse(await boundedText(response));
    const users = new Map((payload.includes?.users || []).map(user => [user.id, user]));
    return (payload.data || []).slice(0, requested).flatMap(post => {
      try {
        if (!post?.id || !post.text || !post.author_id) return [];
        const user = users.get(post.author_id);
        const metrics = post.public_metrics || {};
        return [normalizeItem({
          url: `https://x.com/${encodeURIComponent(user?.username || post.author_id)}/status/${encodeURIComponent(post.id)}`,
          title: post.text.slice(0, 160), excerpt: post.text,
          author: user?.name || (user?.username ? `@${user.username}` : undefined), publishedAt: post.created_at,
          metrics: {
            ...(Number.isFinite(metrics.like_count) ? { likes: metrics.like_count } : {}),
            ...(Number.isFinite(metrics.retweet_count) ? { reposts: metrics.retweet_count } : {}),
            ...(Number.isFinite(metrics.reply_count) ? { comments: metrics.reply_count } : {}),
          },
        }, 'twitter')];
      } catch { return []; }
    });
  };
}

export async function collectFeed(feed, { redditApi, xApi } = {}) {
  if (feed.source === 'twitter') {
    if (!xApi) throw new Error('X API is not configured; browser collection is disabled for the daily cap');
    return xApi(feed);
  }
  if (feed.source === 'reddit') {
    if (!redditApi) throw new Error('Reddit OAuth is not configured; public RSS collection is disabled');
    return redditApi(feed);
  }
  if (!['arxiv', 'hackernews', 'google_news', 'reddit', 'rss'].includes(feed.source) || !allowedSourceUrl(feed.source, feed.url)) throw new Error('Feed URL is outside the configured source allowlist');
  const response = await fetch(feed.url, { redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'ORIN-personal-digest/1.0', Accept: 'application/rss+xml, application/atom+xml, application/xml' } });
  if (!response.ok) throw new Error(response.status === 429 ? 'Source rate limited; waiting until next scheduled run' : `Feed returned HTTP ${response.status}`);
  return parseFeed(await boundedText(response), feed.source);
}

export async function detectBlock(page, response) {
  if ([401, 403, 429].includes(response?.status())) return 'Source requires login, denied access, or rate limited this run';
  if (/\/(login|i\/flow\/login|authwall|checkpoint|challenge|uas\/login)(\/|\?|$)/i.test(new URL(page.url()).pathname)) return 'Sign in or complete account verification manually';
  if (await page.locator('input[type="password"], iframe[src*="captcha"], [data-testid="captcha"]').count()) return 'Login or verification required';
  const body = (await page.locator('body').innerText()).slice(0, 20000);
  if (/rate limit exceeded|too many requests|you.ve been blocked|verify you are human|unusual activity|temporarily restricted/i.test(body)) return 'Source blocked or rate limited; no retries this run';
  return null;
}

export async function collectSocial(sourceConfig, profileDir, { headless = true, storageState } = {}) {
  if (!['twitter', 'linkedin', 'reddit'].includes(sourceConfig.source) || !sourceConfig.urls?.length || sourceConfig.urls.length > 3 || sourceConfig.urls.some(url => !allowedSourceUrl(sourceConfig.source, url))) throw new Error('Social collection needs 1–3 allowlisted source URLs');
  const { chromium } = await import('playwright');
  let browser;
  const context = storageState
    ? await (browser = await chromium.launch({ headless })).newContext({ storageState, viewport: { width: 1280, height: 1000 } })
    : await chromium.launchPersistentContext(profileDir, { headless, viewport: { width: 1280, height: 1000 } });
  const items = [];
  try {
    const page = context.pages()[0] || await context.newPage();
    page.setDefaultTimeout(15_000);
    for (const url of sourceConfig.urls) {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForTimeout(2500);
      const blocked = await detectBlock(page, response);
      if (blocked) return { items, status: 'blocked', message: blocked };
      const selector = sourceConfig.source === 'twitter' ? 'article[data-testid="tweet"]' : sourceConfig.source === 'linkedin' ? 'div.feed-shared-update-v2' : 'shreddit-post';
      for (let scroll = 0; scroll < 3; scroll++) {
        const rows = await page.locator(selector).evaluateAll((nodes, source) => nodes.slice(0, 40).map(node => {
          const content = node.innerText || node.textContent || '';
          if (source === 'twitter') {
            const text = node.querySelector('[data-testid="tweetText"]')?.innerText || '';
            const time = node.querySelector('time');
            const permalink = time?.closest('a')?.href;
            return { url: permalink, title: text.slice(0, 160), excerpt: text, author: node.querySelector('[data-testid="User-Name"]')?.innerText, publishedAt: time?.dateTime };
          }
          if (source === 'linkedin') {
            const urn = node.getAttribute('data-urn') || '';
            const link = [...node.querySelectorAll('a[href]')].find(a => /\/feed\/update\/|\/posts\//.test(a.href));
            const text = node.querySelector('.update-components-text')?.innerText || content;
            return { url: link?.href || (urn.startsWith('urn:li:activity:') ? `https://www.linkedin.com/feed/update/${urn}/` : null), title: text.slice(0, 160), excerpt: text, author: node.querySelector('.update-components-actor__name')?.innerText };
          }
          const permalink = node.getAttribute('permalink');
          const score = Number(node.getAttribute('score'));
          const comments = Number(node.getAttribute('comment-count'));
          return { url: permalink ? new URL(permalink, 'https://www.reddit.com').href : null, title: node.getAttribute('post-title'), excerpt: content, author: node.getAttribute('author'), publishedAt: node.getAttribute('created-timestamp'), metrics: { ...(node.hasAttribute('score') && Number.isFinite(score) ? { score } : {}), ...(node.hasAttribute('comment-count') && Number.isFinite(comments) ? { comments } : {}) } };
        }), sourceConfig.source);
        for (const row of rows) {
          try { items.push(normalizeItem(row, sourceConfig.source)); } catch { /* Missing/changed markup is not a valid item. */ }
        }
        if (scroll < 2) { await page.mouse.wheel(0, 850); await page.waitForTimeout(2500); }
        const interrupted = await detectBlock(page, response);
        if (interrupted) return { items, status: 'blocked', message: interrupted };
      }
      await page.waitForTimeout(5000);
    }
    return { items, status: items.length ? 'ok' : 'error', message: items.length ? 'Visible posts collected; metrics unavailable unless explicitly present' : 'No posts found; session or site markup may need attention' };
  } finally { await context.close(); if (browser) await browser.close(); }
}
