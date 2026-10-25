import http from 'node:http';
import process from 'node:process';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createDefaultOrinStore, handleJsonRpc } from './server.mjs';

const MAX_BODY_BYTES = 1_000_000;

function sendJson(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Authorization');
  res.end(JSON.stringify(body));
}

function requireBearerToken(req, expected) {
  if (!expected || expected.length < 32) {
    const error = new Error('ORIN MCP authentication is not configured');
    error.status = 503;
    throw error;
  }
  const actual = Buffer.from(req.headers.authorization || '');
  const expectedBuffer = Buffer.from(`Bearer ${expected}`);
  if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer)) {
    const error = new Error('Not authenticated');
    error.status = 401;
    throw error;
  }
}

async function readJsonRequest(req, maxBytes) {
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
    const error = new Error('JSON content type required');
    error.status = 415;
    throw error;
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error('Request body too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Invalid JSON body');
    error.status = 400;
    throw error;
  }
}

export function createMcpHttpApp({ store, token = process.env.ORIN_MCP_TOKEN, maxBodyBytes = MAX_BODY_BYTES } = {}) {
  const sessions = new Map();

  return async function handleRequest(req, res) {
    const url = new URL(req.url || '/', 'http://localhost');
    try {
      if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/api/health')) {
        return sendJson(res, 200, { ok: true }, { 'Cache-Control': 'no-store' });
      }
      if (url.pathname !== '/mcp') return sendJson(res, 404, { error: 'Not found' });
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.setHeader('Allow', 'POST, DELETE');
        res.setHeader('Cache-Control', 'private, no-store');
        return res.end();
      }
      requireBearerToken(req, token);
      if (req.method === 'DELETE') {
        const sessionId = req.headers['mcp-session-id'];
        if (typeof sessionId !== 'string' || !sessions.delete(sessionId)) {
          return sendJson(res, 400, { error: 'Unknown MCP session' });
        }
        res.statusCode = 204;
        res.setHeader('Cache-Control', 'private, no-store');
        return res.end();
      }
      if (req.method === 'GET') {
        res.setHeader('Allow', 'POST, DELETE');
        return sendJson(res, 405, { error: 'Server-initiated streams are not supported' });
      }
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, DELETE');
        return sendJson(res, 405, { error: 'Method not allowed' });
      }

      const request = await readJsonRequest(req, maxBodyBytes);
      let state;
      let sessionId = req.headers['mcp-session-id'];
      let newSession = false;
      if (request?.method === 'initialize') {
        sessionId = randomUUID();
        state = { initialized: false };
        sessions.set(sessionId, state);
        newSession = true;
      } else {
        if (typeof sessionId !== 'string') {
          return sendJson(res, 400, { error: 'MCP session header required' });
        }
        state = sessions.get(sessionId);
        if (!state) return sendJson(res, 400, { error: 'Unknown MCP session' });
      }

      const response = await handleJsonRpc(request, store, state);
      if (!response) {
        res.statusCode = 202;
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('Vary', 'Authorization');
        if (newSession) res.setHeader('Mcp-Session-Id', sessionId);
        return res.end();
      }
      const headers = newSession ? { 'Mcp-Session-Id': sessionId } : {};
      return sendJson(res, 200, response, headers);
    } catch (error) {
      return sendJson(res, error.status || 503, { error: error.status ? error.message : 'ORIN MCP service unavailable' });
    }
  };
}

export function startMcpHttpServer({ store = createDefaultOrinStore(), token = process.env.ORIN_MCP_TOKEN, maxBodyBytes } = {}) {
  const app = createMcpHttpApp({ store, token, maxBodyBytes });
  const server = http.createServer(app);
  const port = Number(process.env.PORT || 10000);
  server.listen(port, '0.0.0.0', () => console.log(`ORIN MCP HTTP server listening on port ${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
  return server;
}

if (process.argv[1] && process.argv[1].endsWith('http.mjs')) {
  startMcpHttpServer().catch(error => {
    console.error(`ORIN MCP HTTP server: ${error.message}`);
    process.exitCode = 1;
  });
}
