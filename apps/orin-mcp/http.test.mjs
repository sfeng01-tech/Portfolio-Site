import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcpHttpApp } from './http.mjs';
import { createOrinStore } from './server.mjs';

const token = 'a'.repeat(40);
const store = createOrinStore({ sql: () => [] });

function request({ method = 'POST', url = '/mcp', headers = {}, body }) {
  return {
    method,
    url,
    headers,
    [Symbol.asyncIterator]() {
      const bytes = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
      let index = 0;
      return {
        async next() { return index < bytes.length ? { done: false, value: bytes[index++] } : { done: true }; }
      };
    }
  };
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    ended: false,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    end(body = '') { this.ended = true; this.body = body; return this; }
  };
}

test('HTTP health is public while MCP requests require authentication', async () => {
  const app = createMcpHttpApp({ store, token });
  const health = response();
  await app(request({ method: 'GET', url: '/health' }), health);
  assert.equal(health.statusCode, 200);
  assert.deepEqual(JSON.parse(health.body), { ok: true });

  const unauthenticated = response();
  await app(request({ headers: {} }), unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);
});

test('HTTP transport initializes a session and forwards JSON-RPC tool calls', async () => {
  const app = createMcpHttpApp({ store, token });
  const initialize = response();
  await app(request({
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: { jsonrpc: '2.0', id: 1, method: 'initialize' }
  }), initialize);
  assert.equal(initialize.statusCode, 200);
  const sessionId = initialize.headers['mcp-session-id'];
  assert.match(sessionId, /^[0-9a-f-]{36}$/);

  const listed = response();
  await app(request({
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'mcp-session-id': sessionId
    },
    body: { jsonrpc: '2.0', id: 2, method: 'tools/list' }
  }), listed);
  assert.equal(listed.statusCode, 200);
  assert.equal(JSON.parse(listed.body).result.tools.length, 4);
});

test('HTTP transport rejects unknown sessions and terminates sessions', async () => {
  const app = createMcpHttpApp({ store, token });
  const unknown = response();
  await app(request({
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'mcp-session-id': 'not-a-session'
    },
    body: { jsonrpc: '2.0', id: 3, method: 'tools/list' }
  }), unknown);
  assert.equal(unknown.statusCode, 400);

  const initialize = response();
  await app(request({
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: { jsonrpc: '2.0', id: 4, method: 'initialize' }
  }), initialize);
  const sessionId = initialize.headers['mcp-session-id'];
  const deleted = response();
  await app(request({
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}`, 'mcp-session-id': sessionId }
  }), deleted);
  assert.equal(deleted.statusCode, 204);

  const afterDelete = response();
  await app(request({
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'mcp-session-id': sessionId
    },
    body: { jsonrpc: '2.0', id: 5, method: 'tools/list' }
  }), afterDelete);
  assert.equal(afterDelete.statusCode, 400);
});
