import test from 'node:test';
import assert from 'node:assert/strict';
import login from '../api/auth/login.js';

function response() {
  return { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end() {}, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
}

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
