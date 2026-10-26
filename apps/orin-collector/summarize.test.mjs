import test from 'node:test';
import assert from 'node:assert/strict';
import { reasoningOptions, summarize } from './summarize.mjs';

const jsonResponse = (status, value) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(),
  body: new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)));
      controller.close();
    }
  })
});

const model = (id) => ({ id, pricing: { prompt: '0', completion: '0', request: '0' }, context_length: 200_000 });
const items = [{ source: 'arxiv', url: 'https://arxiv.org/abs/2601.12345', title: 'A GPU paper', excerpt: 'Kernel work', metrics: {} }];
const digest = { title: 'Daily digest', summary: 'Worth reading', groups: [{ title: 'GPU', summary: 'Kernel work', urls: [items[0].url] }] };
const config = { topics: ['GPU'], maxRunUsd: 0.05, model: 'primary/model', summaryFallbackModels: ['fallback/model'] };

test('mandatory reasoning uses the lowest advertised effort without disabling it', () => {
  assert.deepEqual(reasoningOptions({ reasoning: { mandatory: true, supported_efforts: ['max', 'high', 'low'] } }), { exclude: true, effort: 'low' });
  assert.deepEqual(reasoningOptions({ reasoning: { mandatory: true } }), { exclude: true, enabled: true });
  assert.deepEqual(reasoningOptions({ reasoning: { mandatory: false } }), { enabled: false });
  assert.equal(reasoningOptions({}), undefined);
});

test('a failing primary model falls back instead of losing the day', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push(url);
    if (url.endsWith('/models')) return jsonResponse(200, { data: [model('primary/model'), model('fallback/model')] });
    const requested = JSON.parse(options.body).model;
    if (requested === 'primary/model') return jsonResponse(500, { error: 'upstream down' });
    if (requested === 'fallback/model') return jsonResponse(200, { choices: [{ message: { content: JSON.stringify(digest) } }] });
    throw new Error(`unexpected model ${requested}`);
  };

  const result = await summarize(items, config, 'test-key', '2026-10-25', { fetchImpl });
  assert.equal(result.model, 'fallback/model');
  assert.equal(result.itemCount, 1);
  assert.equal(result.title, 'Daily digest');
  assert.equal(calls.filter(url => url.endsWith('/chat/completions')).length, 2);
});

test('a model that is no longer in the catalog is skipped for the fallback', async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith('/models')) return jsonResponse(200, { data: [model('fallback/model')] });
    return jsonResponse(200, { choices: [{ message: { content: JSON.stringify(digest) } }] });
  };
  const result = await summarize(items, config, 'test-key', '2026-10-25', { fetchImpl });
  assert.equal(result.model, 'fallback/model');
});

test('configured fallback models are used instead of the built-in defaults', async () => {
  const fetchImpl = async (url, options = {}) => {
    if (url.endsWith('/models')) return jsonResponse(200, { data: [model('primary/model'), model('chosen/model'), ...['deepseek/deepseek-v4.1-flash-1017', 'google/gemini-2.5-flash-lite'].map(model)] });
    const requested = JSON.parse(options.body).model;
    if (requested === 'primary/model') return jsonResponse(429, { error: 'busy' });
    if (requested === 'chosen/model') return jsonResponse(200, { choices: [{ message: { content: JSON.stringify(digest) } }] });
    throw new Error(`built-in default ${requested} must not be tried`);
  };
  const result = await summarize(items, { ...config, summaryFallbackModels: ['chosen/model'] }, 'test-key', '2026-10-25', { fetchImpl });
  assert.equal(result.model, 'chosen/model');
});

test('an invalid digest from one model rolls over to the next', async () => {
  const fetchImpl = async (url, options = {}) => {
    if (url.endsWith('/models')) return jsonResponse(200, { data: [model('primary/model'), model('fallback/model')] });
    const requested = JSON.parse(options.body).model;
    if (requested === 'primary/model') {
      const invalid = { ...digest, groups: [{ title: 'GPU', summary: 'Kernel work', urls: ['https://evil.test/article'] }] };
      return jsonResponse(200, { choices: [{ message: { content: JSON.stringify(invalid) } }] });
    }
    return jsonResponse(200, { choices: [{ message: { content: JSON.stringify(digest) } }] });
  };
  const result = await summarize(items, config, 'test-key', '2026-10-25', { fetchImpl });
  assert.equal(result.model, 'fallback/model');
});

test('an exhausted fallback chain reports every attempt', async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith('/models')) return jsonResponse(200, { data: [model('primary/model'), model('fallback/model')] });
    return jsonResponse(500, { error: 'down' });
  };
  await assert.rejects(
    summarize(items, config, 'test-key', '2026-10-25', { fetchImpl }),
    error => /Digest unavailable after 2 model attempts/.test(error.message)
      && error.message.includes('primary/model: HTTP 500')
      && error.message.includes('fallback/model: HTTP 500')
  );
});

test('missing credentials and catalog outages fail before any completion call', async () => {
  await assert.rejects(summarize(items, config, '', '2026-10-25', { fetchImpl: async () => { throw new Error('must not fetch'); } }), /OPENROUTER_API_KEY/);
  await assert.rejects(
    summarize(items, config, 'test-key', '2026-10-25', { fetchImpl: async () => jsonResponse(503, {}) }),
    /Unable to check current model availability/
  );
});

test('auth and billing failures stop the fallback chain immediately', async () => {
  let completions = 0;
  const fetchImpl = async (url) => {
    if (url.endsWith('/models')) return jsonResponse(200, { data: [model('primary/model'), model('fallback/model')] });
    completions += 1;
    return jsonResponse(401, { error: 'unauthorized' });
  };
  await assert.rejects(summarize(items, config, 'bad-key', '2026-10-25', { fetchImpl }), /after 1 model attempt \(primary\/model: HTTP 401\)/);
  assert.equal(completions, 1, 'a bad key or empty balance cannot be fixed by another model');
});