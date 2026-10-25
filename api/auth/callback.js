import { timingSafeEqual } from 'node:crypto';
import {
  STATE_COOKIE,
  TOKEN_COOKIE,
  REPOSITORY,
  getOrigin,
  githubFetch,
  parseCookies,
  serializeCookie
} from '../../server/githubAuth.js';

const redirectWithError = (res, error) => {
  res.statusCode = 302;
  res.setHeader('Location', `/admin/login?error=${encodeURIComponent(error)}`);
  res.end();
};

const statesMatch = (actual, expected) => {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state, error: oauthError } = req.query;
  if (typeof oauthError === 'string') return redirectWithError(res, oauthError);
  if (typeof code !== 'string') return redirectWithError(res, 'missing_code');

  const expectedState = parseCookies(req)[STATE_COOKIE];
  const destination = parseCookies(req).portfolio_oauth_destination === '/orin' ? '/orin' : '/admin';
  if (!statesMatch(state, expectedState)) {
    return redirectWithError(res, 'invalid_state');
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return redirectWithError(res, 'server_configuration');
  }

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
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
      return redirectWithError(res, tokenData.error || 'token_exchange_failed');
    }

    const userResponse = await githubFetch('/user', tokenData.access_token);
    if (!userResponse.ok) return redirectWithError(res, 'user_lookup_failed');

    const user = await userResponse.json();
    if (user.login?.toLowerCase() !== REPOSITORY.owner.toLowerCase()) {
      return redirectWithError(res, 'not_repository_owner');
    }

    res.setHeader('Set-Cookie', [
      serializeCookie(req, TOKEN_COOKIE, tokenData.access_token, {
        maxAge: 8 * 60 * 60,
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
    return redirectWithError(res, 'internal_error');
  }
}
