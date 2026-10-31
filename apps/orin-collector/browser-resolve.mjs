// Google's share links (search.app, maps.app.goo.gl, goo.gl) no longer answer
// with a redirect: they serve an app shell that computes the destination in
// JavaScript, so no amount of HTML parsing can name the link. A headless browser
// is the only way to see where they point, and it is worth the cost for exactly
// those hosts — every other link is read over plain HTTP.
import { cleanUrl, enrichItem } from './link-meta.mjs';

export const JS_ONLY_HOSTS = /^(search\.app|maps\.app\.goo\.gl|goo\.gl|link\.app)$/i;

export function isJsOnlyShareLink(value) {
  try { return JS_ONLY_HOSTS.test(new URL(String(value)).hostname.replace(/^www\./, '')); }
  catch { return false; }
}

// Bounded concurrency for browser work: each resolution opens a real page, and a
// chat archive can hold hundreds of these links.
export function createLimiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    const { task, resolve, reject } = queue.shift();
    task().then(resolve, reject).finally(() => { active--; next(); });
  };
  return task => new Promise((resolve, reject) => { queue.push({ task, resolve, reject }); next(); });
}

export async function createBrowserResolver({ headless = true, timeoutMs = 25_000, settleMs = 2_500, concurrency = 3 } = {}) {
  const limit = createLimiter(concurrency);
  let browser;
  return {
    async resolve(url) {
      return limit(async () => {
        const { chromium } = await import('playwright');
        browser ||= await chromium.launch({ headless });
        const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
        try {
          const page = await context.newPage();
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
          await page.waitForTimeout(settleMs);
          return { finalUrl: page.url(), title: (await page.title()).trim() };
        } finally { await context.close(); }
      });
    },
    async close() {
      if (!browser) return;
      const instance = browser;
      browser = null;
      await instance.close();
    },
  };
}

// Resolve a JS-only share link in the browser, then read the destination it
// landed on with the normal HTTP pass. The original URL stays the item's
// identity; only `resolvedUrl` records where it actually goes.
export async function enrichWithBrowserFallback(item, { resolver, fetchImpl, timeoutMs } = {}) {
  if (!resolver || !isJsOnlyShareLink(item?.url)) return enrichItem(item, { fetchImpl, timeoutMs });
  let landing;
  try { landing = await resolver.resolve(item.url); }
  catch { return enrichItem(item, { fetchImpl, timeoutMs }); }
  const finalUrl = cleanUrl(landing?.finalUrl);
  if (!finalUrl || finalUrl === item.url) return enrichItem(item, { fetchImpl, timeoutMs });
  const inner = await enrichItem({ ...item, url: finalUrl }, { fetchImpl, timeoutMs });
  return {
    ...inner,
    resolvedUrl: finalUrl,
    enrichment: { ...inner.enrichment, browserResolved: true },
  };
}
