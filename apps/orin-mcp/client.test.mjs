import test from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteMcpClient } from './client.mjs';

const token = 'b'.repeat(40);

function fakeFetch() {
  const calls = [];
  const fetchImpl = async (endpoint, options) => {
    calls.push({ endpoint, options });
    const request = JSON.parse(options.body);
    const isInitialize = request.method === 'initialize';
    const headers = new Map([
      ['content-type', 'application/json'],
      ...(isInitialize ? [['mcp-session-id', 'session-id']] : [])
    ]);
    if (request.method === 'notifications/initialized') {
      return {
        status: 202,
        ok: true,
        headers: { get: key => headers.get(key) },
        json: async () => { throw new Error('Unexpected body'); }
      };
    }
    return {
      status: 200,
      ok: true,
      headers: { get: key => headers.get(key) },
      json: async () => ({
        jsonrpc: '2.0',
        id: request.id,
        result: { received: request.method }
      })
    };
  };
  return { calls, fetchImpl };
}

test('remote client stores the MCP session and forwards every request', async () => {
  const { calls, fetchImpl } = fakeFetch();
  const client = createRemoteMcpClient({
    endpoint: 'https://orin-mcp.example.com/mcp',
    token,
    fetchImpl
  });

  const initialized = await client({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  assert.deepEqual(initialized.result, { received: 'initialize' });
  assert.equal(calls[0].options.headers['Mcp-Session-Id'], undefined);

  const listed = await client({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(listed.result, { received: 'tools/list' });
  assert.equal(calls[1].options.headers['Mcp-Session-Id'], 'session-id');

  const notification = await client({ jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal(notification, null);
});

test('remote client rejects unsafe endpoints and short tokens', async () => {
  assert.throws(() => createRemoteMcpClient({ endpoint: 'http://orin.example.com/mcp', token }), /HTTPS URL/);
  assert.throws(() => createRemoteMcpClient({ endpoint: 'https://orin.example.com/api', token }), /\/mcp/);
  assert.throws(() => createRemoteMcpClient({ endpoint: 'https://orin.example.com/mcp', token: 'short' }), /32 characters/);
});
