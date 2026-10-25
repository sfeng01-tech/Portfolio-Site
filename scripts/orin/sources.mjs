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

export async function collectFeed(feed) {
  if (!['arxiv', 'hackernews', 'reddit', 'rss'].includes(feed.source) || !allowedSourceUrl(feed.source, feed.url)) throw new Error('Feed URL is outside the configured source allowlist');
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
