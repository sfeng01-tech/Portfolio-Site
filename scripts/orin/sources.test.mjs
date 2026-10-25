import test from 'node:test';
import assert from 'node:assert/strict';
import { collectFeed, createRedditApi, createThreadsApi, createXApi } from './sources.mjs';

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

test('X API v2 searches at most 50 posts and maps public engagement', async () => {
  const url = 'https://api.x.com/2/tweets/search/recent?query=ROCm&max_results=50&tweet.fields=created_at%2Cpublic_metrics%2Cauthor_id&expansions=author_id&user.fields=username%2Cname';
  const xApi = createXApi({ bearerToken: 'test-token', fetchImpl: async (request, options) => {
    assert.equal(new URL(request).searchParams.get('max_results'), '50');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    return new Response(JSON.stringify({
      data: [{ id: '123', text: 'ROCm kernel update', author_id: 'u1', created_at: '2026-10-25T12:00:00Z', public_metrics: { like_count: 12, retweet_count: 3, reply_count: 2 } }],
      includes: { users: [{ id: 'u1', username: 'gpu_dev', name: 'GPU Dev' }] },
    }));
  } });
  const [item] = await collectFeed({ source: 'twitter', url }, { xApi });
  assert.equal(item.url, 'https://x.com/gpu_dev/status/123');
  assert.deepEqual(item.metrics, { likes: 12, reposts: 3, comments: 2 });
  const tooMany = createXApi({ bearerToken: 'test-token', fetchImpl: async () => { throw new Error('must not fetch'); } });
  await assert.rejects(() => tooMany({ source: 'twitter', url: url.replace('max_results=50', 'max_results=100') }), /daily read cap/);
});

test('Threads keyword search uses the user token and maps public posts', async () => {
  const url = 'https://graph.threads.net/v1.0/keyword_search?q=ROCm&search_type=TOP&search_mode=KEYWORD&fields=id%2Ctext%2Cmedia_type%2Cpermalink%2Ctimestamp%2Cusername&limit=50';
  const threadsApi = createThreadsApi({ accessToken: 'threads-user-token', fetchImpl: async (request, options) => {
    assert.equal(new URL(request).searchParams.get('q'), 'ROCm');
    assert.equal(new URL(request).searchParams.get('limit'), '50');
    assert.equal(options.headers.Authorization, 'Bearer threads-user-token');
    return new Response(JSON.stringify({ data: [{
      id: '123', text: 'ROCm kernel update', username: 'gpu_dev',
      permalink: 'https://www.threads.com/@gpu_dev/post/abc', timestamp: '2026-10-25T12:00:00Z',
    }] }));
  } });
  const [item] = await collectFeed({ source: 'threads', url }, { threadsApi });
  assert.equal(item.source, 'threads');
  assert.equal(item.url, 'https://www.threads.com/@gpu_dev/post/abc');
  assert.equal(item.author, 'gpu_dev');
  const missing = createThreadsApi({ accessToken: '' });
  await assert.rejects(() => missing({ source: 'threads', url }), /THREADS_ACCESS_TOKEN/);
});

test('Hugging Face daily papers keep abstracts, publication dates and observed votes', async () => {
  const [item] = await collectFeed({ source: 'huggingface', url: 'https://huggingface.co/api/daily_papers?limit=50' }, {
    fetchImpl: async (url, options) => {
      assert.equal(options.redirect, 'error');
      return new Response(JSON.stringify([{ paper: { id: '2610.12345', title: 'GPU inference', summary: 'An abstract about inference.', authors: [{ name: 'Researcher' }], publishedAt: '2026-10-23T00:00:00Z', upvotes: 12 }, numComments: 3 }, { paper: { id: '../bad' } }]));
    },
  });
  assert.equal(item.url, 'https://huggingface.co/papers/2610.12345');
  assert.equal(item.excerpt, 'An abstract about inference.');
  assert.equal(item.author, 'Researcher');
  assert.equal(item.publishedAt, '2026-10-23T00:00:00.000Z');
  assert.deepEqual(item.metrics, { likes: 12, comments: 3 });
});

test('alphaXiv maps its live feed schema and leaves missing metrics unknown', async () => {
  const items = await collectFeed({ source: 'alphaxiv', url: 'https://api.alphaxiv.org/papers/v3/feed?sort=Hot&interval=3%20Days&pageNum=0&pageSize=40' }, {
    fetchImpl: async () => new Response(JSON.stringify({ papers: [{ universal_paper_id: '2610.12345', title: 'GPU training', abstract: 'Original abstract.', paper_summary: { summary: 'Generated summary.' }, authors: ['A', 'B'], first_publication_date: '2026-10-23', metrics: { public_total_votes: 0 } }, { universal_paper_id: '2610.54321', title: 'Kernels', abstract: 'Compiler abstract.' }] })),
  });
  assert.equal(items[0].url, 'https://www.alphaxiv.org/abs/2610.12345');
  assert.equal(items[0].excerpt, 'Original abstract.');
  assert.equal(items[0].author, 'A, B');
  assert.deepEqual(items[0].metrics, { likes: 0 });
  assert.equal(items[1].metrics, undefined);
});

test('paper sources reject unexpected endpoints and malformed responses without retries', async () => {
  const unexpected = async () => { throw new Error('must not fetch'); };
  for (const url of ['https://huggingface.co.evil.test/api/daily_papers', 'https://huggingface.co/api/models']) {
    await assert.rejects(() => collectFeed({ source: 'huggingface', url }, { fetchImpl: unexpected }), /allowlist|endpoint/);
  }
  const feed = { source: 'alphaxiv', url: 'https://api.alphaxiv.org/papers/v3/feed' };
  await assert.rejects(() => collectFeed(feed, { fetchImpl: async () => new Response('{}') }), /invalid listing/);
  let calls = 0;
  await assert.rejects(() => collectFeed(feed, { fetchImpl: async () => { calls++; return new Response('', { status: 429 }); } }), /rate limited/);
  assert.equal(calls, 1);
});

test('Substack supports publication feeds and explicit custom domains, rejecting unrelated links', async () => {
  for (const host of ['example.substack.com', 'latent.space', 'magazine.sebastianraschka.com', 'cameronrwolfe.substack.com', 'www.interconnects.ai', 'newsletter.ruder.io', 'thegradientpub.substack.com']) {
    const items = await collectFeed({ source: 'substack', url: `https://${host}/feed` }, { fetchImpl: async () => new Response(`<rss><channel><item><title>GPU systems</title><link>https://${host}/p/gpu</link><description>AI research</description></item><item><title>Wrong host</title><link>https://evil.test/p/gpu</link><description>AI</description></item></channel></rss>`) });
    assert.equal(items.length, 1);
    assert.equal(items[0].source, 'substack');
  }
  await assert.rejects(() => collectFeed({ source: 'substack', url: 'https://substack.com.evil.test/feed' }), /allowlist/);
});
