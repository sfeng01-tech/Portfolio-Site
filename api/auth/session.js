import {
  getAuthorizedUser,
  getAuthorizedOrinUser,
  publicUser
} from '../../apps/portfolio/server/githubAuth.js';
import { ORIN_DEMO_MODE, demoOrinUser } from '../../apps/portfolio/server/orin.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (ORIN_DEMO_MODE()) return res.status(200).json({ user: publicUser(demoOrinUser().user) });
    const auth = req.query?.destination === '/orin'
      ? await getAuthorizedOrinUser(req)
      : await getAuthorizedUser(req);
    if (!auth) return res.status(401).json({ error: 'Not authenticated' });
    return res.status(200).json({ user: publicUser(auth.user) });
  } catch {
    return res.status(502).json({ error: 'Unable to verify GitHub session' });
  }
}
