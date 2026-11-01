import test from 'node:test';
import assert from 'node:assert/strict';
import { createAskHandler } from '../../../api/orin/ask.js';
import {
  ASK_MODEL_DEFAULT, MAX_QUESTION, askCapabilities, buildBoundedContext, buildContext, citationAudit,
  createLibrarySearch, extractCitations, searchTerms, streamGroundedAnswer,
  validateAsk, validateConversationId
} from '../server/orin-ask.js';
import {
  CHUNK_CHARS, chunkHash, chunkId, chunkText, estimateTokens, itemChunkText, noteChunkText
} from '../server/orin-chunk.js';

const conversationId = '4f2b9a5c-0000-4000-8000-abcdefabcdef';
const embedding = () => Array.from({ length: 1536 }, (_, index) => (index % 7) / 10);

test('chunkText keeps short text intact and bounds long text near paragraph and sentence edges', () => {
  assert.deepEqual(chunkText(''), []);
  assert.deepEqual(chunkText('  A short note.\n\n'), ['A short note.']);

  const paragraphs = Array.from({ length: 14 }, (_, index) => `Paragraph ${index}. ${'detail '.repeat(40)}`).join('\n\n');
  const chunks = chunkText(paragraphs, { maxChars: 900, overlap: 120 });
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 900, `chunk length ${chunk.length} exceeded the budget`);
    assert.ok(chunk.length > 0);
  }
  assert.equal(chunks.join(' ').includes('Paragraph 0.'), true);
  assert.equal(chunks.join(' ').includes('Paragraph 13.'), true);
});

test('chunkText makes progress on text without any whitespace', () => {
  const chunks = chunkText('x'.repeat(4000), { maxChars: 1800, overlap: 200 });
  assert.equal(chunks.length, 3);
  assert.equal(chunks.map(chunk => chunk.length).join(','), '1800,1800,800');
  assert.ok(chunks.every(chunk => chunk.length <= 1800));
});

test('chunk helpers are deterministic and estimate tokens conservatively', () => {
  assert.equal(chunkHash('same text'), chunkHash('same text'));
  assert.notEqual(chunkHash('same text'), chunkHash('same text.'));
  assert.equal(chunkId('item', 'abc', 2), 'item:abc:2');
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens(''), 0);
  assert.ok(CHUNK_CHARS >= 1000);
});

test('item and note chunk text place the title ahead of the body once', () => {
  assert.equal(itemChunkText({ title: 'Kernels', excerpt: 'A summary' }), 'Kernels\n\nA summary');
  assert.equal(itemChunkText({ excerpt: 'Body only' }), 'Body only');
  assert.equal(itemChunkText({ title: 'Title only' }), 'Title only');
  assert.equal(itemChunkText({}), '');
  assert.equal(noteChunkText({ title: 'Draft', content: '<p>Body</p>' }), 'Draft\n\n<p>Body</p>');
  assert.equal(noteChunkText({ content: 'Untitled body' }), 'Untitled body');
});

test('ask validation accepts only a bounded library question and a valid conversation id', () => {
  assert.deepEqual(validateAsk({ question: '  What did I save?  ' }), { question: 'What did I save?', mode: 'library', conversationId: null });
  assert.equal(validateAsk({ question: 'Follow up', conversationId }).conversationId, conversationId);
  for (const broken of [
    null, [], {}, { question: '' }, { question: '   ' }, { question: 42 },
    { question: 'x'.repeat(MAX_QUESTION + 1) }, { question: 'bad\u0007question' },
    { question: 'Q', mode: 'web' }, { question: 'Q', conversationId: 'not-a-uuid' }
  ]) assert.throws(() => validateAsk(broken), /Invalid|Ask a question|limited|Web answers/);
  assert.throws(() => validateAsk({ question: 'Q', mode: 'web' }), /Web answers are not enabled/);
  assert.equal(validateConversationId(conversationId), conversationId);
  assert.throws(() => validateConversationId('bad'), /Invalid conversation id/);
});

test('ask capabilities report configuration without leaking the key', () => {
  assert.deepEqual(askCapabilities({}), {
    library: false, model: null, message: 'Ask needs OPENROUTER_API_KEY on the ORIN web service.'
  });
  const ready = askCapabilities({ OPENROUTER_API_KEY: 'secret', ORIN_ASK_MODEL: 'example/model' });
  assert.equal(ready.library, true);
  assert.equal(ready.model, 'example/model');
  assert.equal(JSON.stringify(ready).includes('secret'), false);
  assert.equal(askCapabilities({ OPENROUTER_API_KEY: 'secret' }).model, ASK_MODEL_DEFAULT);
});

test('search terms drop stop words, keep technical tokens, and cap the query', () => {
  assert.equal(searchTerms('What did I save about AI agents and kernels?'), 'save OR ai OR agents OR kernels');
  assert.equal(searchTerms('gpu-kernels and text-embedding'), 'gpu OR kernels OR text OR embedding');
  assert.equal(searchTerms('the and for with'), '');
  assert.equal(searchTerms(''), '');
  const many = searchTerms(Array.from({ length: 30 }, (_, index) => `token${index}`).join(' '));
  assert.equal(many.split(' OR ').length, 16);
});

test('citations are extracted, deduplicated, and audited against the retrieved set', () => {
  assert.deepEqual(extractCitations('One [1], two [3], again [1], out of range [42].', 3), [1, 3]);
  assert.deepEqual(extractCitations('One [1], two [3], again [1], out of range [42].'), [1, 3, 42]);
  assert.deepEqual(extractCitations('None here.'), []);
  assert.deepEqual(citationAudit('One [1], two [3], bad [12].', 3), { cited: [1, 3], invalid: [12] });
  assert.deepEqual(citationAudit('No citations.', 4), { cited: [], invalid: [] });
});

test('buildContext numbers every source and labels notes distinctly', () => {
  const context = buildContext([
    { kind: 'item', title: 'Saved paper', origin: 'arxiv', text: 'Evidence A' },
    { kind: 'note', title: 'My note', text: 'Evidence B' }
  ]);
  assert.match(context, /^\[1\] Saved paper \(arxiv\)\nEvidence A/);
  assert.match(context, /\[2\] My note \(your note\)\nEvidence B/);
  assert.equal(buildContext([]), '');
});

test('buildBoundedContext keeps whole sources and drops the tail that would overflow', () => {
  const sources = Array.from({ length: 4 }, (_, index) => ({ kind: 'item', title: `Source ${index}`, text: 'x'.repeat(2400) }));
  const bounded = buildBoundedContext(sources, 6000);
  assert.equal(bounded.sources.length, 2);
  assert.ok(bounded.context.length <= 6000);
  assert.match(bounded.context, /\[1\] Source 0/);
  assert.match(bounded.context, /\[2\] Source 1/);
  assert.equal(bounded.context.includes('Source 2'), false);
  assert.equal(buildBoundedContext([]).sources.length, 0);
});

test('library search falls back to items and notes before the chunk migration exists', async () => {
  const calls = [];
  const sql = async (strings) => {
    const query = strings.join(' ');
    calls.push(query);
    if (query.includes("to_regclass('public.orin_chunks')")) return [{ present: false }];
    return [{ kind: 'item', sourceId: 'item-1', title: 'Agents', text: 'Agent systems', url: 'https://example.org/a', origin: 'arxiv', category: 'AI', score: 0.4 }];
  };
  const search = createLibrarySearch(sql, { env: {} });
  const result = await search('What about agents?');
  assert.equal(result.method, 'fallback');
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].sourceId, 'item-1');
  assert.match(calls[1], /orin_items/);
  assert.match(calls[1], /orin_notes/);
  assert.deepEqual(await search('the and for'), { sources: [], method: 'empty', reason: 'empty_query' });
});

test('library search uses chunk-level lexical ranking when the index exists', async () => {
  const calls = [];
  const sql = async (strings) => {
    const query = strings.join(' ');
    calls.push(query);
    if (query.includes("to_regclass('public.orin_chunks')")) return [{ present: true }];
    if (query.includes('EXISTS')) return [{ present: false }];
    return [{ id: 'item:1:0', kind: 'item', sourceId: '1', title: 'Indexed', text: 'Passage', score: 0.8 }];
  };
  const result = await createLibrarySearch(sql, { env: {} })('indexed passages');
  assert.equal(result.method, 'lexical');
  assert.equal(result.sources[0].id, 'item:1:0');
  assert.ok(calls.some(query => query.includes('to_tsvector')));
});

test('library search fuses semantic and lexical ranks when embeddings are available', async () => {
  let fetched = 0;
  const fetchImpl = async () => {
    fetched += 1;
    return { ok: true, json: async () => ({ data: [{ index: 0, embedding: embedding() }] }) };
  };
  const sql = async (strings) => {
    const query = strings.join(' ');
    if (query.includes("to_regclass('public.orin_chunks')")) return [{ present: true }];
    if (query.includes('EXISTS')) return [{ present: true }];
    return [{ id: 'item:1:0', kind: 'item', sourceId: '1', title: 'Semantic', text: 'Passage', score: 0.9 }];
  };
  const result = await createLibrarySearch(sql, { env: { OPENROUTER_API_KEY: 'key' }, fetchImpl })('meaning');
  assert.equal(fetched, 1);
  assert.equal(result.method, 'hybrid');
  assert.equal(result.sources[0].title, 'Semantic');
});

test('library search falls back when the chunk query fails mid-migration', async () => {
  const sql = async (strings) => {
    const query = strings.join(' ');
    if (query.includes("to_regclass('public.orin_chunks')")) return [{ present: true }];
    if (query.includes('EXISTS')) return [{ present: false }];
    if (query.includes('FROM orin_chunks')) throw new Error('column "embedding" does not exist');
    return [{ kind: 'note', sourceId: 'n1', title: 'Fallback note', text: 'Note body', score: 0.2 }];
  };
  const result = await createLibrarySearch(sql, { env: {} })('note body');
  assert.equal(result.method, 'fallback');
  assert.equal(result.sources[0].kind, 'note');
});

test('streamGroundedAnswer forwards deltas, usage, and the model', async () => {
  const frames = [
    'data: {"choices":[{"delta":{"content":"Agents "}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"matter [1]."}}]}\n\n',
    'data: {"usage":{"prompt_tokens":12,"completion_tokens":4},"choices":[]}\n\n',
    'data: [DONE]\n\n'
  ].join('');
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return new Response(frames, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  };
  const events = [];
  for await (const event of streamGroundedAnswer({
    question: 'Do agents matter?',
    sources: [{ kind: 'item', title: 'Agents', text: 'Yes.' }],
    env: { OPENROUTER_API_KEY: 'key', ORIN_ASK_MODEL: 'example/model' },
    fetchImpl
  })) events.push(event);

  assert.equal(request.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(JSON.parse(request.options.body).model, 'example/model');
  assert.deepEqual(events.filter(event => event.type === 'delta').map(event => event.text), ['Agents ', 'matter [1].']);
  assert.deepEqual(events.at(-1), { type: 'end', usage: { prompt_tokens: 12, completion_tokens: 4 }, model: 'example/model' });
});

test('streamGroundedAnswer refuses to call a provider without a key', async () => {
  await assert.rejects(async () => {
    for await (const event of streamGroundedAnswer({ question: 'Q', sources: [], env: {}, fetchImpl: async () => { throw new Error('should not fetch'); } })) void event;
  }, /OPENROUTER_API_KEY/);
});

// Handler contract tests replace storage, auth, search, and the provider so the
// SSE framing and persistence decisions can be checked without a database.
const askResponse = () => ({
  headers: {}, statusCode: 200, output: '', headersSent: false, writableEnded: false, destroyed: false,
  setHeader(key, value) { this.headers[key] = value; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; this.writableEnded = true; return this; },
  write(chunk) { this.output += chunk; return true; },
  flushHeaders() { this.headersSent = true; },
  end() { this.writableEnded = true; return this; },
  on() {}, off() {}
});

const parseEvents = output => output.split('\n\n').filter(Boolean)
  .map(frame => JSON.parse(frame.replace(/^data:\s*/, '')));

function askFixture({ search, streamAnswer, capabilities, sql, authorize } = {}) {
  const calls = [];
  const database = sql || (async (strings, ...values) => {
    const query = strings.join(' ');
    calls.push({ query, values });
    if (query.includes('INSERT INTO orin_conversations')) return [{ id: conversationId }];
    if (query.includes('INSERT INTO orin_messages') && query.includes('RETURNING id')) return [{ id: 'message-1' }];
    if (query.includes('SELECT id FROM orin_conversations')) return [{ id: conversationId }];
    if (query.includes('to_regclass')) return [{ present: true }];
    if (query.includes('DELETE FROM orin_conversations')) return [{ id: conversationId }];
    return [];
  });
  const handler = createAskHandler({
    getSql: async () => database,
    authorize: authorize || (async () => {}),
    getCapabilities: capabilities || (() => ({ library: true, model: 'example/model', message: '' })),
    makeSearch: () => search || (async () => ({
      method: 'lexical',
      sources: [{ kind: 'item', sourceId: 'item-1', title: 'Agents', text: 'Evidence about agents.', url: 'https://example.org/a', origin: 'arxiv', score: 0.5 }]
    })),
    streamAnswer: streamAnswer || (async function* () {
      yield { type: 'delta', text: 'Agents matter [1].' };
      yield { type: 'end', usage: { prompt_tokens: 8, completion_tokens: 3 }, model: 'example/model' };
    })
  });
  return { handler, calls };
}

test('ask handler streams sources, deltas, and a persisted done event', async () => {
  const { handler, calls } = askFixture();
  const res = askResponse();
  await handler({ method: 'POST', body: { question: 'What about agents?' }, query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'text/event-stream; charset=utf-8');
  const events = parseEvents(res.output);
  assert.deepEqual(events.map(event => event.type), ['sources', 'delta', 'done']);
  assert.equal(events[0].sources[0].title, 'Agents');
  assert.equal(events[0].persisted, true);
  assert.equal(events[1].text, 'Agents matter [1].');
  assert.equal(events[2].messageId, 'message-1');
  assert.deepEqual(events[2].citations, [1]);
  assert.deepEqual(events[2].invalidCitations, []);
  assert.ok(calls.some(call => call.query.includes('INSERT INTO orin_message_sources')));
});

test('ask handler rejects web mode and missing provider configuration as JSON', async () => {
  const web = askResponse();
  await askFixture().handler({ method: 'POST', body: { question: 'Q', mode: 'web' }, query: {} }, web);
  assert.equal(web.statusCode, 400);
  assert.match(web.body.error, /Web answers are not enabled/);
  assert.equal(web.output, '');

  const unconfigured = askResponse();
  await askFixture({ capabilities: () => ({ library: false, model: null, message: 'Ask needs OPENROUTER_API_KEY on the ORIN web service.' }) })
    .handler({ method: 'POST', body: { question: 'Q' }, query: {} }, unconfigured);
  assert.equal(unconfigured.statusCode, 503);
  assert.match(unconfigured.body.error, /OPENROUTER_API_KEY/);
});

test('ask handler reports a missing migration without blocking answers', async () => {
  const res = askResponse();
  const sql = async (strings) => {
    if (strings.join(' ').includes('to_regclass')) return [{ present: false }];
    throw new Error('persistence unavailable');
  };
  await askFixture({ sql }).handler({ method: 'GET', query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { conversations: [], migrationRequired: true });

  const post = askResponse();
  await askFixture({ sql }).handler({ method: 'POST', body: { question: 'What about agents?' }, query: {} }, post);
  const events = parseEvents(post.output);
  assert.equal(events[0].persisted, false);
  assert.equal(events.at(-1).persisted, false);
  assert.equal(events.at(-1).messageId, null);
});

test('ask handler sends an SSE error when library search fails', async () => {
  const res = askResponse();
  let streamed = false;
  await askFixture({
    search: async () => { throw new Error('database down'); },
    streamAnswer: async function* () { streamed = true; yield { type: 'end' }; }
  }).handler({ method: 'POST', body: { question: 'Q' }, query: {} }, res);

  const events = parseEvents(res.output);
  assert.deepEqual(events.map(event => event.type), ['error']);
  assert.match(events[0].message, /could not be searched/);
  assert.equal(streamed, false);
});

test('ask handler answers honestly and skips the provider when nothing matches', async () => {
  const res = askResponse();
  let streamed = false;
  await askFixture({
    search: async () => ({ method: 'empty', sources: [] }),
    streamAnswer: async function* () { streamed = true; yield { type: 'end' }; }
  }).handler({ method: 'POST', body: { question: 'Unfindable topic' }, query: {} }, res);

  const events = parseEvents(res.output);
  assert.deepEqual(events.map(event => event.type), ['sources', 'delta', 'done']);
  assert.equal(events[0].sources.length, 0);
  assert.match(events[1].text, /does not contain a relevant source/);
  assert.equal(events[2].citations.length, 0);
  assert.equal(streamed, false);
});

test('ask handler deletes a conversation only after a write-authorized check', async () => {
  let write = null;
  const res = askResponse();
  await askFixture({ authorize: async (_req, isWrite) => { write = isWrite; } })
    .handler({ method: 'DELETE', query: { conversationId }, body: undefined }, res);
  assert.equal(write, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { deleted: conversationId });
});
