import process from 'node:process';

function validateEndpoint(endpoint) {
  const url = new URL(endpoint);
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
      || url.username || url.password || url.pathname !== '/mcp') {
    throw new Error('ORIN_MCP_URL must be an HTTPS URL ending in /mcp (HTTP is allowed only on localhost)');
  }
}

export function createRemoteMcpClient({ endpoint = process.env.ORIN_MCP_URL, token = process.env.ORIN_MCP_TOKEN, fetchImpl = global.fetch } = {}) {
  validateEndpoint(endpoint);
  if (!token || token.length < 32) throw new Error('ORIN_MCP_TOKEN must contain at least 32 characters');
  let sessionId;

  return async function forwardRequest(request) {
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream'
    };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      redirect: 'error'
    });
    const newSessionId = response.headers.get('mcp-session-id');
    if (newSessionId) sessionId = newSessionId;
    if (response.status === 202) return null;
    if (!response.ok) throw new Error(`ORIN MCP HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('application/json')) throw new Error('ORIN MCP returned an unsupported content type');
    return response.json();
  };
}

export async function startRemoteMcpClient({ input = process.stdin, output = process.stdout, client = createRemoteMcpClient() } = {}) {
  let buffer = '';
  input.setEncoding?.('utf8');
  input.on('data', chunk => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let request;
      try {
        request = JSON.parse(line);
      } catch {
        output.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
        continue;
      }
      client(request).then(response => {
        if (response) output.write(`${JSON.stringify(response)}\n`);
      }).catch(error => {
        output.write(`${JSON.stringify({ jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32603, message: error.message } })}\n`);
      });
    }
  });
  return input;
}

if (process.argv[1] && process.argv[1].endsWith('client.mjs')) {
  startRemoteMcpClient().catch(error => {
    console.error(`ORIN MCP client: ${error.message}`);
    process.exitCode = 1;
  });
}
