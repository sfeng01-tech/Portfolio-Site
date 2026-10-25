import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAppServer } from '../server/http.js';

test('Node adapter serves SPA, private APIs and bounded JSON without leaking files', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'orin-http-'));
  await writeFile(path.join(directory, 'index.html'), '<!doctype html><title>ORIN test</title>');
  await writeFile(path.join(directory, 'style.css'), 'body {color: red}');
  await writeFile(path.join(directory, '.env'), 'SECRET=hidden');
  const server = createAppServer({ distDir: directory, maxBodyBytes: 100 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const spa = await fetch(`${base}/orin`);
    assert.equal(spa.status, 200);
    assert.match(spa.headers.get('content-type'), /text\/html/);
    assert.match(await spa.text(), /ORIN test/);
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });
    const session = await fetch(`${base}/api/auth/session`);
    assert.equal(session.status, 401);
    assert.match(session.headers.get('content-type'), /application\/json/);
    assert.match(session.headers.get('cache-control'), /no-store/);
    const digest = await fetch(`${base}/api/orin/digest`);
    assert.equal(digest.status, 401);
    const contribution = await fetch(`${base}/api/orin/contributions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(contribution.status, 401);
    const unknown = await fetch(`${base}/api/nonexistent`);
    assert.equal(unknown.status, 404);
    assert.deepEqual(await unknown.json(), { error: 'API route not found' });
    for (const filename of ['/.env', '/%2eenv', '/assets/missing.js', '/%2e%2e%2fpackage.json']) {
      assert.equal((await fetch(`${base}${filename}`)).status, 404);
    }
    const badBody = await fetch(`${base}/api/orin/items`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{bad' });
    assert.equal(badBody.status, 400);
    const oversized = await fetch(`${base}/api/orin/ingest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: 'x'.repeat(200) }) });
    assert.equal(oversized.status, 413);
    const css = await fetch(`${base}/style.css`, { method: 'HEAD' });
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type'), /text\/css/);
    assert.equal(await css.text(), '');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
