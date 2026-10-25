import process from 'node:process';

const PROTOCOL_VERSION = '2025-06-18';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ID_PATTERN = /^[a-f0-9]{64}$/;

export function validDate(value) {
  return typeof value === 'string' && DATE_PATTERN.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function positiveLimit(value, fallback, maximum) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw Object.assign(new Error(`limit must be an integer from 1 through ${maximum}`), { status: 400 });
  }
  return value;
}

export function createOrinStore({ sql }) {
  if (typeof sql !== 'function') throw new TypeError('A Neon sql function is required');

  async function listDates(limit = 30) {
    const count = positiveLimit(limit, 30, 90);
    const rows = await sql`SELECT day::text FROM orin_digests ORDER BY day DESC LIMIT ${count}`;
    return rows.map(row => row.day);
  }

  async function getDigest({ date, savedOnly = false } = {}) {
    if (date !== undefined && !validDate(date)) {
      throw Object.assign(new Error('date must be a valid YYYY-MM-DD date'), { status: 400 });
    }
    const days = await sql`SELECT day::text FROM orin_digests ORDER BY day DESC LIMIT 90`;
    const selectedDate = date || days[0]?.day;
    if (!selectedDate) {
      return { date: null, availableDates: [], digest: null, items: [], sourceStatus: [] };
    }
    const [entry] = await sql`SELECT digest, source_status FROM orin_digests WHERE day = ${selectedDate}`;
    if (typeof savedOnly !== 'boolean') {
      throw Object.assign(new Error('savedOnly must be a boolean'), { status: 400 });
    }
    const rows = savedOnly
      ? await sql`
        SELECT item, is_read, saved
        FROM orin_items
        WHERE saved = true
        ORDER BY updated_at DESC
        LIMIT 500
      `
      : await sql`
        SELECT i.item, i.is_read, i.saved
        FROM orin_items AS i
        JOIN orin_digest_items AS d ON d.item_id = i.id
        WHERE d.day = ${selectedDate}
        ORDER BY COALESCE((i.item->'ranking'->>'score')::integer, -1) DESC, i.item->>'source', i.item->>'title'
      `;
    return {
      date: selectedDate,
      availableDates: days.map(row => row.day),
      digest: entry?.digest || null,
      items: rows.map(row => ({ ...row.item, read: row.is_read, saved: row.saved })),
      sourceStatus: entry?.source_status || []
    };
  }

  async function searchItems({ query, savedOnly = false, limit = 25 } = {}) {
    if (typeof query !== 'string' || query.trim().length < 2 || query.length > 200) {
      throw Object.assign(new Error('query must contain 2-200 characters'), { status: 400 });
    }
    if (typeof savedOnly !== 'boolean') {
      throw Object.assign(new Error('savedOnly must be a boolean'), { status: 400 });
    }
    const count = positiveLimit(limit, 25, 100);
    const term = `%${query.trim()}%`;
    const rows = await sql`
      SELECT DISTINCT ON (i.id)
        i.id,
        i.item,
        i.is_read,
        i.saved,
        d.day::text AS day
      FROM orin_items AS i
      JOIN orin_digest_items AS d ON d.item_id = i.id
      WHERE (
        lower(i.item->>'title') LIKE lower(${term})
        OR lower(i.item->>'excerpt') LIKE lower(${term})
        OR lower(i.item->>'author') LIKE lower(${term})
        OR lower(i.item->'topics')::text LIKE lower(${term})
        OR lower(i.item->>'category') LIKE lower(${term})
      )
      AND (${savedOnly}::boolean = false OR i.saved = true)
      ORDER BY i.id, d.day DESC
      LIMIT ${count}
    `;
    return rows.map(row => ({ ...row.item, id: row.id, read: row.is_read, saved: row.saved, day: row.day }));
  }

  async function getItem({ id } = {}) {
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
      throw Object.assign(new Error('id must be a 64-character lowercase hex item ID'), { status: 400 });
    }
    const [row] = await sql`SELECT item, is_read, saved FROM orin_items WHERE id = ${id}`;
    if (!row) {
      throw Object.assign(new Error('ORIN item not found'), { status: 404 });
    }
    return { ...row.item, id, read: row.is_read, saved: row.saved };
  }

  return { listDates, getDigest, searchItems, getItem };
}

export async function createDefaultOrinStore() {
  const databaseUrl = process.env.ORIN_MCP_DATABASE_URL || process.env.ORIN_DATABASE_URL;
  if (!databaseUrl) {
    throw Object.assign(new Error('ORIN_MCP_DATABASE_URL or ORIN_DATABASE_URL is not configured'), { status: 503 });
  }
  const { neon } = await import('@neondatabase/serverless');
  return createOrinStore({ sql: neon(databaseUrl) });
}

export const MCP_TOOLS = [
  {
    name: 'orin_get_digest',
    description: 'Read the latest ORIN daily digest, or a digest for a specific date, with provenance-rich items and source status.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Optional YYYY-MM-DD digest date.' },
        savedOnly: { type: 'boolean', default: false, description: 'Return bookmarked items across dates instead of one daily digest.' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'orin_list_dates',
    description: 'List the most recent ORIN digest dates.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 90, description: 'Number of dates to return.' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'orin_search_items',
    description: 'Search ORIN items by title, excerpt, author, topics, or category. Can search only saved items.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 2, maxLength: 200 },
        savedOnly: { type: 'boolean', default: false },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 }
      },
      required: ['query'],
      additionalProperties: false
    }
  },
  {
    name: 'orin_get_item',
    description: 'Read one full ORIN item by its canonical 64-character ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', pattern: '^[a-f0-9]{64}$' }
      },
      required: ['id'],
      additionalProperties: false
    }
  }
];

const TOOL_HANDLERS = {
  'orin_get_digest': (store, args = {}) => store.getDigest(args),
  'orin_list_dates': (store, args = {}) => store.listDates(args.limit),
  'orin_search_items': (store, args = {}) => store.searchItems(args),
  'orin_get_item': (store, args = {}) => store.getItem(args)
};

export function createMcpServer(store) {
  let initialized = false;
  const handle = async request => {
    const response = await handleJsonRpc(request, store, { get initialized() { return initialized; }, set initialized(value) { initialized = value; } });
    return response;
  };
  return { handle };
}

function jsonResponse(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function errorResponse(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

export async function handleJsonRpc(request, store, state = { initialized: true }) {
  if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
    return errorResponse(request?.id, -32600, 'Invalid Request');
  }
  if (request.method === 'initialize') {
    state.initialized = true;
    return jsonResponse(request.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: '@portfolio/orin-mcp', version: '1.0.0' }
    });
  }
  if (request.method === 'notifications/initialized') return null;
  if (request.method === 'ping') return jsonResponse(request.id, {});
  if (request.method === 'tools/list') return jsonResponse(request.id, { tools: MCP_TOOLS });
  if (request.method === 'tools/call') {
    if (!state.initialized) return errorResponse(request.id, -32600, 'Server must be initialized before calling tools');
    const name = request.params?.name;
    const handler = TOOL_HANDLERS[name];
    if (!handler) return errorResponse(request.id, -32602, `Unknown tool: ${name}`);
    try {
      const result = await handler(store, request.params?.arguments || {});
      return jsonResponse(request.id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result
      });
    } catch (error) {
      const status = Number(error.status);
      if (status === 400 || status === 404 || status === 503) {
        return jsonResponse(request.id, {
          isError: true,
          content: [{ type: 'text', text: error.message }]
        });
      }
      return errorResponse(request.id, -32603, 'Internal error');
    }
  }
  return errorResponse(request.id, -32601, 'Method not found');
}

export async function startStdioServer({ store = createDefaultOrinStore(), input = process.stdin, output = process.stdout } = {}) {
  let buffer = '';
  const orinStore = await store;
  const server = createMcpServer(orinStore);
  input.setEncoding?.('utf8');
  input.on('data', chunk => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let request;
      try { request = JSON.parse(line); } catch { output.write(`${JSON.stringify(errorResponse(null, -32700, 'Parse error'))}\n`); continue; }
      server.handle(request).then(response => {
        if (response) output.write(`${JSON.stringify(response)}\n`);
      }).catch(() => output.write(`${JSON.stringify(errorResponse(request.id, -32603, 'Internal error'))}\n`));
    }
  });
  return input;
}

if (process.argv[1] && process.argv[1].endsWith('server.mjs')) {
  startStdioServer().catch(error => {
    console.error(`ORIN MCP server: ${error.message}`);
    process.exitCode = 1;
  });
}
