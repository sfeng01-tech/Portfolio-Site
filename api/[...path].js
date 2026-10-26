// Catch-all for unknown /api/* routes on Vercel. Known API files take routing
// precedence; this prevents unmatched API paths from falling through the SPA
// rewrite and returning HTML with a 200 status.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(404).json({ error: 'API route not found' });
}
