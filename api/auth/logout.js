import {
  TOKEN_COOKIE,
  requireSameOrigin,
  serializeCookie
} from '../../apps/portfolio/server/githubAuth.js';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    requireSameOrigin(req);
    res.setHeader('Set-Cookie', serializeCookie(req, TOKEN_COOKIE, '', {
      maxAge: 0,
      path: '/api'
    }));
    return res.status(204).end();
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
}
