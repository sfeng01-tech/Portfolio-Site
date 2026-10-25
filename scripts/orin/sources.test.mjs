import test from 'node:test';
import assert from 'node:assert/strict';
import { collectFeed, createRedditApi } from './sources.mjs';

const feed = { source: 'reddit', url: 'https://oauth.reddit.com/r/LocalLLaMA/top?t=day&limit=50' };

test('Reddit collector uses one application-only token and parses API listings', async () => {
  const calls = [];
  const redditApi = createRedditApi({
    clientId: 'client-id', clientSecret: 'client-secret', username: 'orin_reader',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).includes('/api/v1/access_token')) return new Response(JSON.stringify({ access_token: 'short-lived-token', expires_in: 3600 }), { status: 200 });
      return new Response(JSON.stringify({ data: { children: [{ data: {
        permalink: '/r/LocalLLaMA/comments/abc/gpu_kernels/', title: 'GPU kernel breakthrough',
        selftext: 'A useful ROCm inference discussion.', author: 'researcher', created_utc: 1792933200,
        score: 42, num_comments: 8,
      } }] } }), { status: 200 });
    },
  });
  const items = await collectFeed(feed, { redditApi });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://www.reddit.com/api/v1/access_token');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer short-lived-token');
  assert.match(calls[1].options.headers['User-Agent'], /^script:orin-daily-digest:v1\.0 \(by \/u\/orin_reader\)$/);
  assert.equal(items[0].url, 'https://www.reddit.com/r/LocalLLaMA/comments/abc/gpu_kernels/');
  assert.deepEqual(items[0].metrics, { score: 42, comments: 8 });
  await redditApi(feed);
  assert.equal(calls.length, 3, 'the OAuth token is reused across subreddit requests');
});

test('Reddit OAuth refuses missing credentials and non-API hosts', async () => {
  const missing = createRedditApi({ clientId: '', clientSecret: '', username: '' });
  await assert.rejects(() => missing(feed), /Reddit OAuth is not configured/);
  const api = createRedditApi({ clientId: 'id', clientSecret: 'secret', username: 'reader', fetchImpl: async () => new Response('{}') });
  await assert.rejects(() => api({ ...feed, url: 'https://www.reddit.com/r/LocalLLaMA/top?t=day' }), /OAuth listing URL/);
});

test('Reddit 429 is surfaced without retrying the source', async () => {
  let calls = 0;
  const api = createRedditApi({
    clientId: 'id', clientSecret: 'secret', username: 'reader',
    fetchImpl: async url => {
      calls++;
      if (String(url).includes('access_token')) return new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }));
      return new Response('rate limited', { status: 429, headers: { 'Retry-After': '60' } });
    },
  });
  await assert.rejects(() => api(feed), /Retry-After 60s/);
  assert.equal(calls, 2);
});
