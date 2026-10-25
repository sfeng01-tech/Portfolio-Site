import test from 'node:test';
import assert from 'node:assert/strict';
import login from '../../../api/auth/login.js';
import sessionHandler from '../../../api/auth/session.js';
import { getAuthorizedOrinUser, localAuthBypassEnabled } from '../server/githubAuth.js';

function response() {
  return { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end() {}, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
}

const originalEnv = { NODE_ENV: process.env.NODE_ENV, bypass: process.env.ORIN_LOCAL_AUTH_BYPASS };
const setEnv = (nodeEnv, bypass) => {
  if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv;
  if (bypass === undefined) delete process.env.ORIN_LOCAL_AUTH_BYPASS; else process.env.ORIN_LOCAL_AUTH_BYPASS = bypass;
};

test('ORIN OAuth destination is allowlisted and stored in an HttpOnly callback cookie', () => {
  const previous = process.env.GITHUB_CLIENT_ID;
  process.env.GITHUB_CLIENT_ID = 'test-client';
  try {
    for (const [returnTo, expected] of [['/orin', '%2Forin'], ['https://attacker.invalid', '%2Fadmin'], ['//attacker.invalid', '%2Fadmin'], [undefined, '%2Fadmin']]) {
      const res = response();
      login({ method: 'GET', query: { returnTo }, headers: { host: 'example.com', 'x-forwarded-proto': 'https' } }, res);
      assert.equal(res.statusCode, 302);
      assert.equal(new URL(res.headers.Location).hostname, 'github.com');
      if (returnTo === '/orin') assert.equal(new URL(res.headers.Location).searchParams.get('scope'), 'read:user');
      assert.ok(res.headers['Set-Cookie'].some(cookie => cookie.startsWith(`portfolio_oauth_destination=${expected};`) && cookie.includes('HttpOnly') && cookie.includes('Secure') && cookie.includes('Path=/api/auth/callback')));
    }
  } finally {
    if (previous === undefined) delete process.env.GITHUB_CLIENT_ID;
    else process.env.GITHUB_CLIENT_ID = previous;
  }
});

test('local auth bypass needs the flag in a non-production environment', () => {
  try {
    setEnv(undefined, '1');
    assert.equal(localAuthBypassEnabled(), true);
    setEnv('production', '1');
    assert.equal(localAuthBypassEnabled(), false);
    setEnv(undefined, undefined);
    assert.equal(localAuthBypassEnabled(), false);
    setEnv('test', '0');
    assert.equal(localAuthBypassEnabled(), false);
  } finally { setEnv(originalEnv.NODE_ENV, originalEnv.bypass); }
});

test('bypass reports a session without contacting GitHub, and stays inert otherwise', async () => {
  const failingFetch = async () => { throw new Error('GitHub must not be contacted'); };
  const originalFetch = global.fetch;
  try {
    setEnv(undefined, '1');
    global.fetch = failingFetch;
    const auth = await getAuthorizedOrinUser({ headers: {} });
    assert.equal(auth.user.login, 'local-dev');
    const res = response();
    await sessionHandler({ method: 'GET', headers: {}, query: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.login, 'local-dev');
    global.fetch = originalFetch;
    setEnv(undefined, undefined);
    const noSession = response();
    await sessionHandler({ method: 'GET', headers: {}, query: {} }, noSession);
    assert.equal(noSession.statusCode, 401);
  } finally {
    global.fetch = originalFetch;
    setEnv(originalEnv.NODE_ENV, originalEnv.bypass);
  }
});
