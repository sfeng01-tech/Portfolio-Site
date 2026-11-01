import { orinSql, privateResponse, requireOrinOwner, sendError } from '../../apps/portfolio/server/orin.js';
import {
  MAX_SOURCES, askCapabilities, buildBoundedContext, citationAudit, createLibrarySearch,
  streamGroundedAnswer, validateAsk, validateConversationId
} from '../../apps/portfolio/server/orin-ask.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

function sse(res, event) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function publicSource(source, index) {
  return {
    ref: index + 1,
    kind: source.kind,
    sourceId: source.sourceId,
    title: source.title || '',
    url: source.url || null,
    origin: source.origin || null,
    category: source.category || null,
    snippet: String(source.text || '').slice(0, 700)
  };
}

async function startTurn(sql, input) {
  let conversationId = input.conversationId;
  if (conversationId) {
    const [existing] = await sql`SELECT id FROM orin_conversations WHERE id = ${conversationId}`;
    if (!existing) conversationId = null;
  }
  if (!conversationId) {
    const [created] = await sql`INSERT INTO orin_conversations (title, mode)
      VALUES (${input.question.slice(0, 120)}, ${input.mode}) RETURNING id`;
    conversationId = created.id;
  } else {
    await sql`UPDATE orin_conversations SET updated_at = now() WHERE id = ${conversationId}`;
  }
  await sql`INSERT INTO orin_messages (conversation_id, role, content)
    VALUES (${conversationId}, 'user', ${input.question})`;
  return conversationId;
}

async function finishTurn(sql, { conversationId, answer, sources, audit, model, effort, usage, latencyMs }) {
  const [message] = await sql`INSERT INTO orin_messages
    (conversation_id, role, content, citations, model, reasoning_effort, prompt_tokens, completion_tokens, latency_ms)
    VALUES (${conversationId}, 'assistant', ${answer}, ${JSON.stringify(audit.cited)}::jsonb,
      ${model}, ${effort ?? null}, ${usage?.prompt_tokens ?? null}, ${usage?.completion_tokens ?? null}, ${latencyMs})
    RETURNING id`;
  if (sources.length) {
    const payload = JSON.stringify(sources.map((source, index) => ({
      ref: index + 1,
      kind: source.kind,
      source_id: source.sourceId,
      url: source.url || null,
      title: source.title || '',
      snippet: String(source.text || '').slice(0, 700),
      score: Number.isFinite(Number(source.score)) ? Number(source.score) : null
    })));
    await sql`INSERT INTO orin_message_sources (message_id, ref, kind, source_id, url, title, snippet, score)
      SELECT ${message.id}::uuid, entry.ref, entry.kind, entry.source_id, entry.url, entry.title, entry.snippet, entry.score
      FROM jsonb_to_recordset(${payload}::jsonb)
        AS entry(ref integer, kind text, source_id text, url text, title text, snippet text, score real)`;
  }
  await sql`UPDATE orin_conversations SET updated_at = now() WHERE id = ${conversationId}`;
  return message.id;
}

// Dependency injection mirrors the Research handler, so storage, auth, search,
// and the answer provider can be replaced in contract tests.
export function createAskHandler({
  getSql = orinSql,
  authorize = requireOrinOwner,
  getCapabilities = askCapabilities,
  makeSearch = createLibrarySearch,
  streamAnswer = streamGroundedAnswer
} = {}) {
  return async function handler(req, res) {
    privateResponse(res);
    if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST, DELETE');
      return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
      await authorize(req, req.method !== 'GET');
      const sql = await getSql();
      const capabilities = getCapabilities();

      if (req.method === 'GET') {
        const [state] = await sql`SELECT to_regclass('public.orin_conversations') IS NOT NULL AS present`;
        if (!state?.present) return res.status(200).json({ conversations: [], migrationRequired: true, capabilities });
        if (req.query?.conversationId) {
          const id = validateConversationId(req.query.conversationId);
          const [conversation] = await sql`SELECT id, title, mode, created_at AS "createdAt", updated_at AS "updatedAt"
            FROM orin_conversations WHERE id = ${id}`;
          if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
          const messages = await sql`SELECT id, role, content, citations, model, reasoning_effort AS "reasoningEffort", created_at AS "createdAt"
            FROM orin_messages WHERE conversation_id = ${id} ORDER BY created_at, id`;
          const ids = messages.map(message => message.id);
          const sources = ids.length
            ? await sql`SELECT ms.message_id AS "messageId", ms.ref, ms.kind, ms.source_id AS "sourceId",
                ms.url, ms.title, ms.snippet, ms.score,
                i.item->>'source' AS origin, i.item->>'category' AS category
              FROM orin_message_sources ms
              LEFT JOIN orin_items i ON ms.kind = 'item' AND i.id = ms.source_id
              WHERE ms.message_id = ANY(${ids}::uuid[]) ORDER BY ms.ref`
            : [];
          const byMessage = new Map();
          for (const source of sources) {
            if (!byMessage.has(source.messageId)) byMessage.set(source.messageId, []);
            byMessage.get(source.messageId).push(source);
          }
          return res.status(200).json({
            conversation,
            messages: messages.map(message => ({ ...message, sources: byMessage.get(message.id) || [] })),
            capabilities
          });
        }
        const conversations = await sql`SELECT c.id, c.title, c.mode, c.updated_at AS "updatedAt",
            (SELECT count(*)::int FROM orin_messages m WHERE m.conversation_id = c.id) AS "messageCount"
          FROM orin_conversations c ORDER BY c.updated_at DESC LIMIT 30`;
        return res.status(200).json({ conversations, capabilities });
      }

      if (req.method === 'DELETE') {
        const id = validateConversationId(req.query?.conversationId);
        const [removed] = await sql`DELETE FROM orin_conversations WHERE id = ${id} RETURNING id`;
        if (!removed) return res.status(404).json({ error: 'Conversation not found' });
        return res.status(200).json({ deleted: removed.id });
      }

      const input = validateAsk(req.body);
      if (!capabilities.library) throw fail(capabilities.message, 503);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'private, no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      const started = Date.now();
      let conversationId = null;
      let persisted = true;
      try {
        conversationId = await startTurn(sql, input);
      } catch {
        // The migration may not be applied yet. Answering still works; history does not.
        persisted = false;
      }

      const search = makeSearch(sql);
      let found;
      try {
        found = await search(input.question, { limit: MAX_SOURCES, ...(input.sourceIds ? { sourceIds: input.sourceIds } : {}) });
      } catch (error) {
        sse(res, { type: 'error', message: error.status ? error.message : 'Your library could not be searched. Check the ORIN database.' });
        return res.end();
      }
      const sources = buildBoundedContext(found.sources.slice(0, MAX_SOURCES)).sources;
      sse(res, {
        type: 'sources',
        conversationId,
        persisted,
        method: found.method,
        model: input.model,
        effort: input.effort,
        sources: sources.map(publicSource)
      });

      const model = input.model;
      let answer = '';
      let usage = null;
      let audit = { cited: [], invalid: [] };

      if (!sources.length) {
        answer = 'Your library does not contain a relevant source for that question yet. Save a source, or try different words. I only answer from what you have saved.';
        sse(res, { type: 'delta', text: answer });
      } else {
        const controller = new AbortController();
        // `res` close means the browser went away. `req` close also fires after a
        // normal request body is consumed, which would cancel a healthy stream.
        const abort = () => { if (!res.writableEnded) controller.abort(); };
        res.on('close', abort);
        try {
          for await (const event of streamAnswer({ question: input.question, sources, model, effort: input.effort, signal: controller.signal })) {
            if (event.type === 'delta') {
              answer += event.text;
              sse(res, { type: 'delta', text: event.text });
            } else if (event.type === 'end') {
              usage = event.usage;
            }
          }
        } catch (error) {
          if (!res.writableEnded && !res.destroyed) {
            sse(res, { type: 'error', message: error.status ? error.message : 'The answer provider failed. Check the ORIN model configuration.' });
            res.end();
          }
          return undefined;
        } finally {
          res.off('close', abort);
        }
        if (controller.signal.aborted) return undefined;
        audit = citationAudit(answer, sources.length);
      }

      let messageId = null;
      if (persisted && conversationId) {
        try {
          messageId = await finishTurn(sql, {
            conversationId, answer, sources, audit, model, effort: input.effort, usage, latencyMs: Date.now() - started
          });
        } catch {
          persisted = false;
        }
      }

      sse(res, {
        type: 'done',
        conversationId,
        messageId,
        persisted,
        method: found.method,
        model,
        effort: input.effort,
        citations: audit.cited,
        invalidCitations: audit.invalid,
        usage,
        latencyMs: Date.now() - started
      });
      return res.end();
    } catch (error) {
      if (res.headersSent) {
        if (!res.writableEnded) {
          sse(res, { type: 'error', message: error.status ? error.message : 'Ask failed.' });
          res.end();
        }
        return undefined;
      }
      return sendError(res, error);
    }
  };
}

export default createAskHandler();
