// Tests exercise the real server session path, so configure the process-local
// store before any handler reads a cookie. Production never reaches this file
// and the memory store refuses to run there.
process.env.AUTH_SESSION_STORE = 'memory';
process.env.AUTH_SESSION_SECRET ||= 'test-auth-session-secret-that-is-long-enough';

import { createSession } from '../server/sessionStore.js';

export const OWNER_LOGIN = process.env.GITHUB_REPOSITORY_OWNER || 'sfeng01-tech';

export async function sessionCookie({ login = OWNER_LOGIN, scope = 'repo' } = {}) {
  const { sessionID } = await createSession({
    token: 'test-github-token',
    user: { login, name: 'Test Owner', avatar_url: '', html_url: '' },
    scope
  });
  return `portfolio_session=${sessionID}`;
}

export async function ownerHeaders(extra = {}) {
  return {
    host: 'portfolio.example',
    'x-forwarded-proto': 'https',
    origin: process.env.APP_ORIGIN?.replace(/\/$/, '') || 'https://portfolio.example',
    'content-type': 'application/json',
    cookie: await sessionCookie(),
    ...extra
  };
}
