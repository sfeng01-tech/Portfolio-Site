import { randomBytes } from 'node:crypto';
import {
  STATE_COOKIE,
  getOrigin,
  serializeCookie
} from '../../server/githubAuth.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: 'GitHub OAuth is not configured' });
  }

  const state = randomBytes(32).toString('base64url');
  const destination = req.query?.returnTo === '/orin' ? '/orin' : '/admin';
  const parameters = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${getOrigin(req)}/api/auth/callback`,
    scope: destination === '/orin' ? 'read:user' : process.env.GITHUB_OAUTH_SCOPE || 'repo',
    state
  });

  res.setHeader('Set-Cookie', [serializeCookie(req, STATE_COOKIE, state, {
    maxAge: 10 * 60,
    path: '/api/auth/callback'
  }), serializeCookie(req, 'portfolio_oauth_destination', destination, {
    maxAge: 10 * 60,
    path: '/api/auth/callback'
  })]);
  res.statusCode = 302;
  res.setHeader('Location', `https://github.com/login/oauth/authorize?${parameters}`);
  return res.end();
}
