import {
  SESSION_COOKIE,
  TOKEN_COOKIE,
  parseCookies,
  requireSameOrigin,
  revokeGitHubToken,
  serializeCookie
} from '../../apps/portfolio/server/githubAuth.js';
import { deleteSession } from '../../apps/portfolio/server/sessionStore.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    requireSameOrigin(req);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }

  // The browser session is cleared even if storage or GitHub is unavailable.
  // Revocation is best-effort but is attempted before the token is discarded.
  try {
    const sessionId = parseCookies(req)[SESSION_COOKIE];
    if (sessionId) {
      const session = await deleteSession(sessionId);
      if (session?.token) await revokeGitHubToken(session.token);
    }
  } catch {
    // A failed session cleanup must not keep the browser signed in.
  }

  res.setHeader('Set-Cookie', [
    serializeCookie(req, SESSION_COOKIE, '', { maxAge: 0, path: '/api' }),
    serializeCookie(req, TOKEN_COOKIE, '', { maxAge: 0, path: '/api' })
  ]);
  return res.status(204).end();
}
