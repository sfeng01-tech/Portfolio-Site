import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearMemorySessions,
  createSession,
  deleteSession,
  readSession,
  sessionStorageConfigured,
  sessionTtlSeconds
} from '../server/sessionStore.js';
import { OWNER_LOGIN } from './session-helper.js';
import logout from '../../../api/auth/logout.js';
import callback from '../../../api/auth/callback.js';

const response = () => ({
  headers: {},
  statusCode: 200,
  setHeader(key, value) { this.headers[key] = value; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  end() { this.ended = true; return this; }
});

test('sessions round-trip an encrypted GitHub token through the opaque id', async () => {
  clearMemorySessions();
  const { sessionID, expiresAt, maxAgeSeconds } = await createSession({
    token: 'gho_plain_token',
    user: { login: OWNER_LOGIN, name: 'Owner' },
    scope: 'repo'
  });
  assert.equal(maxAgeSeconds, sessionTtlSeconds);
  assert.match(sessionID, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(sessionID, 'gho_plain_token');
  assert.ok(expiresAt.getTime() > Date.now());

  const session = await readSession(sessionID);
  assert.equal(session.token, 'gho_plain_token');
  assert.equal(session.user.login, OWNER_LOGIN);
  assert.equal(session.scope, 'repo');
});

test('unknown, malformed and deleted session ids never authenticate', async () => {
  clearMemorySessions();
  const { sessionID } = await createSession({ token: 'gho_token', user: { login: OWNER_LOGIN }, scope: 'repo' });
  assert.equal(await readSession('not-a-session'), null);
  assert.equal(await readSession(42), null);
  assert.equal(await readSession('a'.repeat(43)), null);

  const removed = await deleteSession(sessionID);
  assert.equal(removed.token, 'gho_token');
  assert.equal(await readSession(sessionID), null);
  assert.equal(await deleteSession(sessionID), null);
});

test('expired sessions are rejected and removed', async () => {
  clearMemorySessions();
  const { sessionID } = await createSession({
    token: 'gho_short',
    user: { login: OWNER_LOGIN },
    scope: 'read:user',
    maxAgeSeconds: 1
  });
  assert.ok(await readSession(sessionID));
  await new Promise(resolve => setTimeout(resolve, 1_100));
  assert.equal(await readSession(sessionID), null, 'expired sessions must not be resurrected');
});

test('sessions require both a database and a secret, and the memory store is dev-only', async () => {
  const original = {
    nodeEnv: process.env.NODE_ENV,
    store: process.env.AUTH_SESSION_STORE,
    secret: process.env.AUTH_SESSION_SECRET,
    clientSecret: process.env.GITHUB_CLIENT_SECRET
  };
  try {
    delete process.env.AUTH_SESSION_SECRET;
    delete process.env.GITHUB_CLIENT_SECRET;
    delete process.env.AUTH_SESSION_STORE;
    assert.equal(sessionStorageConfigured(), false, 'no secret means no usable sessions');

    process.env.AUTH_SESSION_SECRET = 'a'.repeat(32);
    process.env.AUTH_SESSION_STORE = 'memory';
    process.env.NODE_ENV = 'test';
    assert.equal(sessionStorageConfigured(), true);

    process.env.NODE_ENV = 'production';
    assert.equal(sessionStorageConfigured(), false, 'the process-local store must stay inert in production');
    await assert.rejects(
      createSession({ token: 'gho_token', user: { login: OWNER_LOGIN }, scope: 'repo' }),
      error => error.status === 503 && /not configured/.test(error.message)
    );
  } finally {
    if (original.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original.nodeEnv;
    if (original.store === undefined) delete process.env.AUTH_SESSION_STORE; else process.env.AUTH_SESSION_STORE = original.store;
    if (original.secret === undefined) delete process.env.AUTH_SESSION_SECRET; else process.env.AUTH_SESSION_SECRET = original.secret;
    if (original.clientSecret === undefined) delete process.env.GITHUB_CLIENT_SECRET; else process.env.GITHUB_CLIENT_SECRET = original.clientSecret;
  }
});

test('logout deletes the session, revokes the token and clears both cookies', async () => {
  clearMemorySessions();
  const original = { fetch: global.fetch, id: process.env.GITHUB_CLIENT_ID, secret: process.env.GITHUB_CLIENT_SECRET };
  const calls = [];
  process.env.GITHUB_CLIENT_ID = 'client-id';
  process.env.GITHUB_CLIENT_SECRET = 'client-secret';
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200 };
  };

  const { sessionID } = await createSession({ token: 'gho_revoke_me', user: { login: OWNER_LOGIN }, scope: 'repo' });
  try {
    const res = response();
    await logout({
      method: 'POST',
      headers: { host: 'portfolio.example', 'x-forwarded-proto': 'https', origin: 'https://portfolio.example', cookie: `portfolio_session=${sessionID}` }
    }, res);

    assert.equal(res.statusCode, 204);
    const cookies = res.headers['Set-Cookie'].join('\n');
    assert.match(cookies, /portfolio_session=;.*Max-Age=0/);
    assert.match(cookies, /portfolio_github_token=;.*Max-Age=0/);
    assert.equal(await readSession(sessionID), null);

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/applications\/client-id\/token$/);
    assert.equal(calls[0].options.method, 'DELETE');
    assert.equal(JSON.parse(calls[0].options.body).access_token, 'gho_revoke_me');
  } finally {
    global.fetch = original.fetch;
    if (original.id === undefined) delete process.env.GITHUB_CLIENT_ID; else process.env.GITHUB_CLIENT_ID = original.id;
    if (original.secret === undefined) delete process.env.GITHUB_CLIENT_SECRET; else process.env.GITHUB_CLIENT_SECRET = original.secret;
  }
});

test('logout still clears the browser cookie when storage or GitHub is unavailable', async () => {  const original = { fetch: global.fetch, id: process.env.GITHUB_CLIENT_ID };
  delete process.env.GITHUB_CLIENT_ID;
  global.fetch = async () => { throw new Error('GitHub unreachable'); };
  try {
    const res = response();
    await logout({
      method: 'POST',
      headers: { host: 'portfolio.example', 'x-forwarded-proto': 'https', origin: 'https://portfolio.example', cookie: 'portfolio_session=not-a-real-session' }
    }, res);
    assert.equal(res.statusCode, 204);
    assert.match(res.headers['Set-Cookie'].join('\n'), /portfolio_session=;.*Max-Age=0/);
  } finally {
    global.fetch = original.fetch;
    if (original.id === undefined) delete process.env.GITHUB_CLIENT_ID; else process.env.GITHUB_CLIENT_ID = original.id;
  }
});

test('the OAuth callback stores a server session and drops the legacy token cookie', async () => {
  clearMemorySessions();
  const original = { fetch: global.fetch, id: process.env.GITHUB_CLIENT_ID, secret: process.env.GITHUB_CLIENT_SECRET };
  process.env.GITHUB_CLIENT_ID = 'client-id';
  process.env.GITHUB_CLIENT_SECRET = 'client-secret';
  global.fetch = async (url) => {
    if (url === 'https://github.com/login/oauth/access_token') {
      return { ok: true, status: 200, json: async () => ({ access_token: 'gho_callback_token', scope: 'read:user' }) };
    }
    if (url.startsWith('https://api.github.com/user')) {
      return { ok: true, status: 200, json: async () => ({ login: OWNER_LOGIN, name: 'Owner', avatar_url: '', html_url: '' }) };
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const res = response();
    await callback({
      method: 'GET',
      headers: {
        host: 'portfolio.example',
        'x-forwarded-proto': 'https',
        cookie: 'portfolio_oauth_state=state-123; portfolio_oauth_destination=%2Forin'
      },
      query: { code: 'code-123', state: 'state-123' }
    }, res);

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.Location, '/orin');
    const cookies = res.headers['Set-Cookie'];
    assert.ok(cookies.some(cookie => cookie.startsWith('portfolio_session=') && cookie.includes('HttpOnly') && cookie.includes('SameSite=Lax')));
    assert.ok(cookies.some(cookie => cookie.startsWith('portfolio_github_token=;') && cookie.includes('Max-Age=0')), 'legacy browser token cookie must be removed');
    assert.ok(!cookies.some(cookie => cookie.includes('gho_callback_token')), 'the GitHub token never reaches the browser');

    const sessionID = decodeURIComponent(cookies.find(cookie => cookie.startsWith('portfolio_session=')).split(';')[0].split('=')[1]);
    const session = await readSession(sessionID);
    assert.equal(session.token, 'gho_callback_token');
    assert.equal(session.user.login, OWNER_LOGIN);
    assert.equal(session.scope, 'read:user');
  } finally {
    global.fetch = original.fetch;
    if (original.id === undefined) delete process.env.GITHUB_CLIENT_ID; else process.env.GITHUB_CLIENT_ID = original.id;
    if (original.secret === undefined) delete process.env.GITHUB_CLIENT_SECRET; else process.env.GITHUB_CLIENT_SECRET = original.secret;
  }
});