import {
  REPOSITORY,
  getAuthorizedUser,
  githubFetch,
  requireSameOrigin
} from '../server/githubAuth.js';

const contentPath = `/repos/${REPOSITORY.owner}/${REPOSITORY.name}/contents/${REPOSITORY.dataFile}`;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    const auth = await getAuthorizedUser(req);
    if (!auth) return res.status(401).json({ error: 'Not authenticated' });

    if (req.method === 'GET') {
      const response = await githubFetch(
        `${contentPath}?ref=${encodeURIComponent(REPOSITORY.branch)}`,
        auth.token
      );
      const payload = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({ error: payload.message || 'Unable to read portfolio data' });
      }

      return res.status(200).json({
        content: payload.content,
        sha: payload.sha
      });
    }

    if (req.method === 'PUT') {
      requireSameOrigin(req);
      const { content, sha, message } = req.body || {};

      if (
        typeof content !== 'string'
        || content.length === 0
        || content.length > 10_000_000
        || typeof sha !== 'string'
        || !/^[a-f0-9]{40,64}$/i.test(sha)
        || typeof message !== 'string'
        || message.length < 1
        || message.length > 200
      ) {
        return res.status(400).json({ error: 'Invalid portfolio update payload' });
      }

      const response = await githubFetch(contentPath, auth.token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          content,
          sha,
          branch: REPOSITORY.branch
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        const conflict = response.status === 409 || payload.message?.includes('does not match');
        return res.status(response.status).json({
          error: conflict
            ? 'The portfolio changed since it was loaded. Refresh and try again.'
            : payload.message || 'Unable to update portfolio data'
        });
      }

      return res.status(200).json({
        sha: payload.content.sha,
        commitUrl: payload.commit.html_url
      });
    }

    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(error.status || 502).json({ error: error.message || 'GitHub request failed' });
  }
}
