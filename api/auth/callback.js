import { timingSafeEqual } from 'node:crypto';
import {
  STATE_COOKIE,
  TOKEN_COOKIE,
  SESSION_COOKIE,
  isPortalAllowedUser,
  isOrinAllowedUser,
  getOrigin,
  githubFetch,
  parseCookies,
  serializeCookie
} from '../../apps/portfolio/server/githubAuth.js';
import { createSession } from '../../apps/portfolio/server/sessionStore.js';

const statesMatch = (actual, expected) => {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
};

const destinationFor = (cookies) => cookies.portfolio_oauth_destination === '/orin' ? '/orin' : '/admin';

const redirectWithError = (res, error, destination) => {
  res.statusCode = 302;
  const path = destination === '/orin' ? '/orin' : '/admin/login';
  res.setHeader('Location', `${path}?error=${encodeURIComponent(error)}`);
  res.end();
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cookies = parseCookies(req);
  const destination = destinationFor(cookies);
  const { code, state, error: oauthError } = req.query;
  if (typeof oauthError === 'string') return redirectWithError(res, oauthError, destination);
  if (typeof code !== 'string') return redirectWithError(res, 'missing_code', destination);

  const expectedState = cookies[STATE_COOKIE];
  if (!statesMatch(state, expectedState)) {
    return redirectWithError(res, 'invalid_state', destination);
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return redirectWithError(res, 'server_configuration', destination);
  }

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${getOrigin(req)}/api/auth/callback`
      })
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || tokenData.error || !tokenData.access_token) {
      return redirectWithError(res, tokenData.error || 'token_exchange_failed', destination);
    }

    const userResponse = await githubFetch('/user', tokenData.access_token);
    if (!userResponse.ok) return redirectWithError(res, 'user_lookup_failed', destination);

    const user = await userResponse.json();
    const authorized = destination === '/orin'
      ? isOrinAllowedUser(user.login)
      : isPortalAllowedUser(user.login);
    if (!authorized) {
      return redirectWithError(res, 'not_repository_owner', destination);
    }

    const requestedScope = destination === '/orin' ? 'read:user' : process.env.GITHUB_OAUTH_SCOPE || 'repo';
    let session;
    try {
      session = await createSession({
        token: tokenData.access_token,
        user: {
          login: user.login,
          name: user.name,
          avatar_url: user.avatar_url,
          html_url: user.html_url
        },
        scope: tokenData.scope || requestedScope
      });
    } catch {
      return redirectWithError(res, 'session_storage', destination);
    }

    res.setHeader('Set-Cookie', [
      serializeCookie(req, SESSION_COOKIE, session.sessionID, {
        maxAge: session.maxAgeSeconds,
        path: '/api'
      }),
      // Remove any legacy browser-held token cookie during the transition.
      serializeCookie(req, TOKEN_COOKIE, '', {
        maxAge: 0,
        path: '/api'
      }),
      serializeCookie(req, STATE_COOKIE, '', {
        maxAge: 0,
        path: '/api/auth/callback'
      }),
      serializeCookie(req, 'portfolio_oauth_destination', '', {
        maxAge: 0,
        path: '/api/auth/callback'
      })
    ]);
    res.statusCode = 302;
    res.setHeader('Location', destination);
    return res.end();
  } catch {
    return redirectWithError(res, 'internal_error', destination);
  }
}
