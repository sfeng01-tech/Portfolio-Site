import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanUrl, deriveTitle, enrichItem, enrichmentPatch, extractDocumentMeta, fetchDocument,
  isPlaceholderTitle, needsEnrichment, publicHttpUrl, safeText, youTubeId,
} from './link-meta.mjs';

const html = (head, body = '') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

function routedFetch(routes) {
  const calls = [];
  const impl = async (request, options = {}) => {
    const url = String(request);
    calls.push({ url, options });
    const route = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
    if (!route) return new Response('not found', { status: 404 });
    return route[1](url, options);
  };
  impl.calls = calls;
  return impl;
}

test('chats labels that name the transport are placeholders, real notes are not', () => {
  for (const title of ['YouTube Video', 'YouTube video dEZP1qUNTOk', 'YouTube Playlist', 'YouTube Live Stream', 'YouTube Video Watch Page',
    'Google Shared Link', 'Shared Google Link', 'Google Maps Location Pin', 'Shared Search Result Link', 'Google Search App Shared Link',
    'LinkedIn Safety Redirect Link', 'LinkedIn Short Link', 'LinkedIn Feed Activity Post', 'LinkedIn redirect to shared link',
    'Shortened LinkedIn post link', 'Instagram Reel', 'Shared ChatGPT Conversation', 'LinkedIn', 'Threads',
    'www.youtube.com/watch', 'm.youtube.com/playlist', 'www.linkedin.com/safety/go/', 'https://example.com/a']) {
    assert.equal(isPlaceholderTitle(title, 'https://example.com/a'), true, title);
  }
  for (const title of ['How We Leveraged vLLM to Power Our GenAI Applications', 'Data engineering projects', 'Good project', 'LLM roadmap', 'Connect']) {
    assert.equal(isPlaceholderTitle(title, 'https://example.com/a'), false, title);
  }
  assert.equal(isPlaceholderTitle('example.com/page', 'https://example.com/page'), true, 'a bare host/path is not a title');
  assert.equal(isPlaceholderTitle('', ''), true);
});

test('YouTube ids are read from every share shape', () => {
  assert.equal(youTubeId('https://youtu.be/dEZP1qUNTOk?si=abc'), 'dEZP1qUNTOk');
  assert.equal(youTubeId('https://m.youtube.com/watch?v=kPGTx4wcm_w'), 'kPGTx4wcm_w');
  assert.equal(youTubeId('https://youtube.com/shorts/-xCPpEMpVm4?si=vb0'), '-xCPpEMpVm4');
  assert.equal(youTubeId('https://www.youtube.com/live/abcdef12345'), 'abcdef12345');
  assert.equal(youTubeId('https://www.youtube.com/playlist?list=PL123'), null);
});

test('URL-only labels name the artifact instead of the transport', () => {
  assert.equal(deriveTitle('https://www.linkedin.com/in/tomiko-mceathron'), 'Tomiko Mceathron — LinkedIn profile');
  assert.equal(deriveTitle('https://www.linkedin.com/jobs/view/3916954542'), 'LinkedIn job listing 3916954542');
  assert.equal(deriveTitle('https://github.com/huggingface/transformers'), 'huggingface/transformers — GitHub repository');
  assert.equal(deriveTitle('https://arxiv.org/abs/2405.01234v2'), 'arXiv 2405.01234v2');
  assert.equal(deriveTitle('https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fgithub.com%2Fggml-org%2Fllama.cpp'), 'ggml-org/llama.cpp — GitHub repository');
  assert.equal(deriveTitle('https://youtu.be/obBQHsn6UJo'), 'YouTube video obBQHsn6UJo');
  assert.equal(deriveTitle('wa-attachment://2019%20Generative%20Deep%20Learning%20by%20David%20Foster.pdf'), '2019 Generative Deep Learning by David Foster');
  assert.equal(deriveTitle('https://www.google.com/maps/place/37.807482,-122.474722/data=!4m6!3m5'), 'Google Maps location 37.807482, -122.474722');
  assert.equal(cleanUrl('https://www.google.com/maps/place/37.807482,-122.474722/data=!4m6!3m5!1s0!7e2?entry=gps&coh=192189'),
    'https://www.google.com/maps/place/37.807482,-122.474722', 'a resolved Maps place collapses to its coordinates');
  assert.match(deriveTitle('https://example.com'), /^example\.com/);
});

test('only public HTTP endpoints are fetched', async () => {
  assert.equal(publicHttpUrl('https://example.com/a').href, 'https://example.com/a');
  for (const rejected of ['http://localhost/a', 'https://127.0.0.1/a', 'https://169.254.169.254/latest/meta-data', 'https://user:pw@example.com/a', 'https://example.com:8443/a', 'file:///tmp/a.pdf', 'wa-attachment://a.pdf', 'https://printer.local/a']) {
    assert.equal(publicHttpUrl(rejected), null, rejected);
  }
  await assert.rejects(() => fetchDocument('file:///etc/passwd'), /unsupported-url/);
});

test('redirects are followed by hand and cannot hop onto a private host', async () => {
  const fetchImpl = routedFetch({
    'https://share.google/abc': () => new Response(null, { status: 302, headers: { location: 'https://youtu.be/dEZP1qUNTOk?si=xyz' } }),
    'https://youtu.be/': () => new Response(html('<title>Beam on GPUs</title>'), { status: 200, headers: { 'content-type': 'text/html' } }),
  });
  const doc = await fetchDocument('https://share.google/abc', { fetchImpl });
  assert.equal(doc.finalUrl, 'https://youtu.be/dEZP1qUNTOk?si=xyz');
  assert.equal(doc.redirected, true);
  assert.match(doc.body, /Beam on GPUs/);
  assert.equal(cleanUrl(doc.finalUrl), 'https://youtu.be/dEZP1qUNTOk');

  const hostile = routedFetch({ 'https://share.google/evil': () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } }) });
  await assert.rejects(() => fetchDocument('https://share.google/evil', { fetchImpl: hostile }), /redirect-to-unsupported-url/);
});

test('page metadata prefers the social title, strips site suffixes and SEO junk', () => {
  const page = html(`<meta property="og:title" content="A KV cache you can fork | Simmis"><meta property="og:description" content="How a KV cache gets identity and copy-on-write forks.">
    <meta property="og:site_name" content="Simmis"><meta name="author" content="Simmis"><title>A KV cache you can fork | Simmis</title>`);
  const meta = extractDocumentMeta(page, 'https://simm.is/blog/a-kv-cache-you-can-fork/');
  assert.equal(meta.title, 'A KV cache you can fork');
  assert.equal(meta.excerpt, 'How a KV cache gets identity and copy-on-write forks.');
  assert.equal(meta.author, 'Simmis');

  const github = extractDocumentMeta(html('<title>GitHub - huggingface/transformers: model definitions · GitHub</title>'), 'https://github.com/huggingface/transformers');
  assert.equal(github.title, 'huggingface/transformers: model definitions');

  const jsonLd = extractDocumentMeta(html('<script type="application/ld+json">{"@graph":[{"headline":"Threads of a kernel","description":"A deep dive into warp scheduling.","datePublished":"2026-10-01T10:00:00Z"}]}</script>'), 'https://example.com/post');
  assert.equal(jsonLd.title, 'Threads of a kernel');
  assert.equal(jsonLd.publishedAt, '2026-10-01T10:00:00.000Z');

  const seo = extractDocumentMeta(html('<meta property="og:title" content="DLRMv4 Training Benchmark"><meta name="description" content="MLPerf Training introduces DLRMv4. - Focus keyphrase: DLRMv4 MLPerf">'), 'https://mlcommons.org/2026/10/dlrmv4-training/');
  assert.equal(seo.title, 'DLRMv4 Training Benchmark');
  assert.equal(seo.excerpt, 'MLPerf Training introduces DLRMv4.');

  assert.deepEqual(extractDocumentMeta(html('<title>Threads</title>', '<a href="/login">Log in</a>'), 'https://www.threads.net/@someone/post'), {});
  assert.deepEqual(extractDocumentMeta(html('<title>Just a moment...</title>'), 'https://example.com/a'), {});
});

test('a YouTube watch page yields the real title, channel and description', async () => {
  const fetchImpl = routedFetch({
    'https://www.youtube.com/watch?v=dEZP1qUNTOk': () => new Response(html(`<script>var ytInitialPlayerResponse = {"videoDetails":{"title":"GPU Programming | Threads, Warps, HBM","shortDescription":"Why memory is usually the bottleneck.\\n\\nChapters follow.","ownerChannelName":"Vizuara","publishDate":"2026-09-30T10:00:00-07:00"}};</script>`), { status: 200, headers: { 'content-type': 'text/html' } }),
  });
  const result = await enrichItem({ url: 'https://m.youtube.com/watch?v=dEZP1qUNTOk', title: 'YouTube Video dEZP1qUNTOk', excerpt: '' }, { fetchImpl });
  assert.equal(result.title, 'GPU Programming | Threads, Warps, HBM');
  assert.equal(result.author, 'Vizuara');
  assert.match(result.excerpt, /^Why memory is usually the bottleneck\./);
  assert.equal(result.resolvedUrl, 'https://www.youtube.com/watch?v=dEZP1qUNTOk');
  assert.equal(result.enrichment.via, 'youtube');
  assert.equal(result.enrichment.confidence, 'high');
});

test('a login wall is named from the URL instead of guessed at', async () => {
  const fetchImpl = routedFetch({});
  const result = await enrichItem({ url: 'https://www.linkedin.com/in/tomiko-mceathron', title: 'Person', excerpt: '' }, { fetchImpl });
  assert.equal(result.title, 'Tomiko Mceathron — LinkedIn profile');
  assert.equal(result.enrichment.via, 'host');
  assert.match(result.excerpt, /sign-in wall/);
  assert.equal(fetchImpl.calls.length, 0, 'walled hosts are never fetched');
});

test('unreadable pages keep the link and record why', async () => {
  const fetchImpl = routedFetch({ 'https://example.com/down': () => new Response('nope', { status: 503 }) });
  const result = await enrichItem({ url: 'https://example.com/down', title: 'Shared Google Link', excerpt: '' }, { fetchImpl });
  assert.equal(result.title, 'Down (example.com)');
  assert.equal(result.enrichment.via, 'fallback');
  assert.equal(result.enrichment.confidence, 'low');
  assert.match(result.excerpt, /returns nothing readable|keeps the link/);
  assert.equal(result.excerpt.length > 40, true);
});

test('truncated page text cannot smuggle unpaired surrogates into the archive', async () => {
  assert.equal(safeText('cut \ud83d emoji'), 'cut emoji');
  assert.equal(safeText('pair \ud83d\ude00 stays'), 'pair \ud83d\ude00 stays');
  assert.equal(safeText('nul\u0000byte'), 'nulbyte');
  assert.equal(safeText('abcdef', 3), 'abc');
  // A video description cut mid-emoji arrives as a JSON escape, and JSON.parse
  // turns it into an unpaired surrogate that JSONB refuses to store.
  const fetchImpl = routedFetch({
    'https://www.youtube.com/watch?v=dEZP1qUNTOk': () => new Response(html('<script>{"videoDetails":{"title":"Half an emoji \\ud83d","shortDescription":"Truncated description \\ud83d here.","ownerChannelName":"Vizuara"}}</script>'), { status: 200, headers: { 'content-type': 'text/html' } }),
  });
  const result = await enrichItem({ url: 'https://www.youtube.com/watch?v=dEZP1qUNTOk', title: 'YouTube Video', excerpt: '' }, { fetchImpl });
  assert.equal(result.title, 'Half an emoji');
  assert.equal(result.excerpt, 'Truncated description here.');
  assert.doesNotMatch(JSON.stringify(result), /\\ud[89a-f][0-9a-f]{2}/i);
});

test('write-back patches only replace placeholders and keep the owner label', () => {
  const item = { url: 'https://youtu.be/dEZP1qUNTOk', title: 'YouTube Video dEZP1qUNTOk', excerpt: '', author: 'WhatsApp · Sf', category: 'Research', categorySource: 'model' };
  const result = { title: 'Beam on GPUs', excerpt: 'A talk about serverless GPUs.', author: 'NeuralNine', enrichment: { at: '2026-10-25T00:00:00.000Z', via: 'youtube', confidence: 'high' } };
  const patch = enrichmentPatch(item, result);
  assert.equal(patch.title, 'Beam on GPUs');
  assert.equal(patch.excerpt, 'A talk about serverless GPUs.');
  assert.equal(patch.author, 'NeuralNine');
  assert.equal(patch.sharedBy, 'WhatsApp · Sf');
  assert.equal(patch.enrichment.originalTitle, 'YouTube Video dEZP1qUNTOk');
  assert.equal(patch.category, undefined, 'categories are never touched');
  assert.equal(needsEnrichment(item), true);

  const curated = { url: 'https://example.com/a', title: 'A learned note I wrote myself', excerpt: 'Why this mattered.', author: 'Me' };
  const kept = enrichmentPatch(curated, { ...result, title: 'Page Title', excerpt: 'Page text.' });
  assert.equal(kept.title, undefined);
  assert.equal(kept.excerpt, undefined);
  assert.equal(kept.author, undefined);
  assert.equal(needsEnrichment(curated), false);

  const refreshed = enrichmentPatch(curated, { ...result, title: 'Page Title', excerpt: 'Page text.' }, { refresh: true });
  assert.equal(refreshed.title, 'Page Title');
  assert.equal(refreshed.enrichment.originalTitle, 'A learned note I wrote myself');
});
