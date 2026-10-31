import test from 'node:test';
import assert from 'node:assert/strict';
import { createLimiter, enrichWithBrowserFallback, isJsOnlyShareLink } from './browser-resolve.mjs';

const html = head => `<!doctype html><html><head>${head}</head><body></body></html>`;

test('only Google app-shell share links need a browser', () => {
  for (const url of ['https://search.app/1KaiG', 'https://maps.app.goo.gl/np9gBqJykMpSZNm67?g_st=aw', 'https://goo.gl/abc', 'https://www.goo.gl/abc']) {
    assert.equal(isJsOnlyShareLink(url), true, url);
  }
  for (const url of ['https://share.google/abc', 'https://youtu.be/dEZP1qUNTOk', 'wa-attachment://a.pdf', 'not a url']) {
    assert.equal(isJsOnlyShareLink(url), false, url);
  }
});

test('a browser-resolved share link keeps its identity and gains a real title', async () => {
  const fetchImpl = async request => {
    assert.equal(String(request), 'https://www.dailydoseofds.com/llmops-crash-course-part-6/');
    return new Response(html('<meta property="og:title" content="Context Engineering: Prompt Management"><meta property="og:description" content="Part six of the LLMOps crash course.">'), { status: 200, headers: { 'content-type': 'text/html' } });
  };
  const resolver = { resolve: async url => ({ finalUrl: 'https://www.dailydoseofds.com/llmops-crash-course-part-6/?utm_source=search.app', title: 'ignored' }) };
  const item = { url: 'https://search.app/1KaiG', title: 'Google Search App Link', excerpt: '', author: 'WhatsApp · Sf' };
  const result = await enrichWithBrowserFallback(item, { resolver, fetchImpl });
  assert.equal(result.title, 'Context Engineering: Prompt Management');
  assert.equal(result.excerpt, 'Part six of the LLMOps crash course.');
  assert.equal(result.resolvedUrl, 'https://www.dailydoseofds.com/llmops-crash-course-part-6/');
  assert.equal(result.enrichment.via, 'page');
  assert.equal(result.enrichment.browserResolved, true);
  assert.equal(item.url, 'https://search.app/1KaiG', 'the stored URL is never rewritten');
});

test('a browser that cannot resolve falls back to the plain HTTP pass', async () => {
  const resolver = { resolve: async () => { throw new Error('browser unavailable'); } };
  const fetchImpl = async () => new Response(html('<title>Search</title>'), { status: 200, headers: { 'content-type': 'text/html' } });
  const result = await enrichWithBrowserFallback({ url: 'https://search.app/abc', title: 'Shared Search App Link', excerpt: '' }, { resolver, fetchImpl });
  assert.equal(result.title, 'Google shared link (search.app/abc)');
  assert.equal(result.enrichment.via, 'fallback');
  assert.equal(result.enrichment.browserResolved, undefined);

  const noResolver = await enrichWithBrowserFallback({ url: 'https://search.app/abc', title: 'Shared Search App Link', excerpt: '' }, {});
  assert.equal(noResolver.enrichment.via, 'fallback', 'no resolver means the ordinary path');
});

test('the browser limiter never exceeds its concurrency', async () => {
  const limit = createLimiter(2);
  let active = 0, peak = 0;
  await Promise.all(Array.from({ length: 6 }, () => limit(async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 10));
    active--;
  })));
  assert.equal(peak, 2);
});
