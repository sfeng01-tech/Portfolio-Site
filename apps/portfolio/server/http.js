import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import login from '../../../api/auth/login.js';
import callback from '../../../api/auth/callback.js';
import logout from '../../../api/auth/logout.js';
import session from '../../../api/auth/session.js';
import portfolio from '../../../api/portfolio.js';
import digest from '../../../api/orin/digest.js';
import items from '../../../api/orin/items.js';
import ingest from '../../../api/orin/ingest.js';
import preferences from '../../../api/orin/preferences.js';
import contributions from '../../../api/orin/contributions.js';
import categories from '../../../api/orin/categories.js';

const handlers = new Map([
  ['/api/auth/login', login], ['/api/auth/callback', callback],
  ['/api/auth/logout', logout], ['/api/auth/session', session],
  ['/api/portfolio', portfolio], ['/api/orin/digest', digest],
  ['/api/orin/preferences', preferences], ['/api/orin/items', items], ['/api/orin/ingest', ingest],
  ['/api/orin/contributions', contributions], ['/api/orin/categories', categories]
]);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}
async function readBody(req, maxBytes) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) { const error = new Error('Request body too large'); error.status = 413; throw error; }
    chunks.push(chunk);
  }
  if (!size) return undefined;
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) { const error = new Error('JSON content type required'); error.status = 415; throw error; }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { const error = new Error('Invalid JSON body'); error.status = 400; throw error; }
}

export function createAppServer({ distDir = fileURLToPath(new URL('../dist/', import.meta.url)), maxBodyBytes = 2_000_000 } = {}) {
  const root = path.resolve(distDir);
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'private, no-store');
        if (pathname === '/api/health') {
          if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return json(res, 405, { error: 'Method not allowed' }); }
          return json(res, 200, { ok: true });
        }
        const handler = handlers.get(pathname);
        if (!handler) return json(res, 404, { error: 'API route not found' });
        // Preserve repeated query keys as arrays, as the Vercel handlers expect.
        req.query = Object.fromEntries([...url.searchParams.keys()].map(key => {
          const values = url.searchParams.getAll(key);
          return [key, values.length > 1 ? values : values[0]];
        }));
        req.body = await readBody(req, maxBodyBytes);
        res.status = code => { res.statusCode = code; return res; };
        res.json = body => { json(res, res.statusCode, body); return res; };
        await handler(req, res);
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return json(res, 405, { error: 'Method not allowed' }); }
      // Reject hidden paths and traversal before joining anything to the static root.
      const parts = pathname.split('/');
      if (pathname.includes('\\') || pathname.includes('\0') || parts.some(part => part === '..' || part.startsWith('.'))) return json(res, 404, { error: 'Not found' });
      let filename = path.resolve(root, `.${pathname}`);
      if (filename !== root && !filename.startsWith(`${root}${path.sep}`)) return json(res, 404, { error: 'Not found' });
      let info;
      try { info = await stat(filename); } catch { /* SPA route fallback below */ }
      if (!info?.isFile()) {
        if (path.extname(pathname)) return json(res, 404, { error: 'Not found' });
        filename = path.join(root, 'index.html');
      }
      const canonicalRoot = await realpath(root);
      const canonicalFile = await realpath(filename);
      if (!canonicalFile.startsWith(`${canonicalRoot}${path.sep}`)) return json(res, 404, { error: 'Not found' });
      const data = await readFile(canonicalFile);
      const extension = path.extname(filename).toLowerCase();
      res.setHeader('Content-Type', MIME[extension] || 'application/octet-stream');
      res.setHeader('Cache-Control', extension === '.html' ? 'no-cache' : pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
      res.setHeader('Content-Length', data.length);
      res.statusCode = 200;
      return res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (res.headersSent || res.destroyed) { res.destroy(); return; }
      return json(res, error.status || (error instanceof URIError ? 400 : 503), { error: error.status ? error.message : error instanceof URIError ? 'Invalid URL' : 'Service unavailable' });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const server = createAppServer();
  server.listen(port, '0.0.0.0', () => console.log(`Portfolio server listening on port ${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
}
