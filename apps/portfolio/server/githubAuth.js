import { readSession } from './sessionStore.js';

export const REPOSITORY = {
  owner: process.env.GITHUB_REPOSITORY_OWNER || 'sfeng01-tech',
  name: process.env.GITHUB_REPOSITORY_NAME || 'Portfolio-Site',
  branch: process.env.GITHUB_REPOSITORY_BRANCH || 'main',
  dataFile: 'apps/portfolio/src/data/portfolioData.js'
};

const normalizeLogin = (login) => typeof login === 'string' ? login.trim().toLowerCase() : '';

// Local testing only: when the operator sets ORIN_LOCAL_AUTH_BYPASS=1 in a
// non-production environment, sessions report a synthetic user and the GitHub
// verification call never runs. Two gates keep this inert in deployments: the
// flag itself, and NODE_ENV — Vercel and Render both set NODE_ENV=production.
export const localAuthBypassEnabled = () =>
  process.env.ORIN_LOCAL_AUTH_BYPASS === '1' && process.env.NODE_ENV !== 'production';

export const LOCAL_BYPASS_USER = Object.freeze({
  login: 'local-dev',
  name: 'Local Testing',
  avatar_url: '',
  html_url: ''
});

const localBypassAuth = () => ({ token: null, user: LOCAL_BYPASS_USER });
const portalAllowedUsers = new Set([
  REPOSITORY.owner,
  ...(process.env.PORTAL_GITHUB_ALLOWED_USERS || '').split(',')
].map(normalizeLogin).filter(Boolean));
const orinAllowedUsers = new Set([
  REPOSITORY.owner,
  ...(process.env.ORIN_GITHUB_ALLOWED_USERS || '').split(',')
].map(normalizeLogin).filter(Boolean));
export const isPortalAllowedUser = (login) => portalAllowedUsers.has(normalizeLogin(login));
export const isOrinAllowedUser = (login) => orinAllowedUsers.has(normalizeLogin(login));

export const TOKEN_COOKIE = 'portfolio_github_token';
export const SESSION_COOKIE = 'portfolio_session';
export const STATE_COOKIE = 'portfolio_oauth_state';

export const parseCookies = (req) => Object.fromEntries(
  (req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf('=');
      if (separator < 0) return [part, ''];
      return [
        decodeURIComponent(part.slice(0, separator)),
        decodeURIComponent(part.slice(separator + 1))
      ];
    })
);

const usesHttps = (req) => {
  const forwardedProtocol = req.headers['x-forwarded-proto'];
  return forwardedProtocol === 'https' || process.env.APP_ORIGIN?.startsWith('https://');
};

export const serializeCookie = (req, name, value, {
  maxAge,
  path = '/api',
  httpOnly = true
} = {}) => {
  const attributes = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    `Path=${path}`,
    'SameSite=Lax'
  ];

  if (httpOnly) attributes.push('HttpOnly');
  if (usesHttps(req)) attributes.push('Secure');
  if (typeof maxAge === 'number') attributes.push(`Max-Age=${maxAge}`);

  return attributes.join('; ');
};

export const getOrigin = (req) => {
  if (process.env.APP_ORIGIN) return process.env.APP_ORIGIN.replace(/\/$/, '');
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  return `${protocol}://${req.headers.host}`;
};

export const requireSameOrigin = (req) => {
  const origin = req.headers.origin;
  if (origin && origin !== getOrigin(req)) {
    const error = new Error('Cross-origin request rejected');
    error.status = 403;
    throw error;
  }
};

export const githubFetch = (path, token, options = {}) => fetch(
  `https://api.github.com${path}`,
  {
    redirect: 'error',
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers
    },
    signal: options.signal || AbortSignal.timeout(5_000)
  }
);

const readRequestSession = async (req) => {
  if (localAuthBypassEnabled()) return { ...localBypassAuth(), scope: 'repo', bypass: true };
  const sessionId = parseCookies(req)[SESSION_COOKIE];
  if (!sessionId) return null;
  return readSession(sessionId);
};

const hasRepositoryScope = (scope) => {
  const scopes = String(scope || '').split(/[\s,]+/).filter(Boolean);
  return scopes.includes('repo') || scopes.includes('public_repo');
};

export const getAuthorizedUser = async (req) => {
  const auth = await readRequestSession(req);
  if (!auth) return null;
  // The local bypass identity is deliberately outside the deployment allowlists.
  if (!auth.bypass && !isPortalAllowedUser(auth.user.login)) return null;
  // Admin edits require repository write access. An ORIN-only identity session
  // (read:user) must not inherit the portfolio write surface.
  if (!hasRepositoryScope(auth.scope)) return null;
  return { token: auth.token, user: auth.user };
};

export const getAuthorizedOrinUser = async (req) => {
  const auth = await readRequestSession(req);
  if (!auth) return null;
  if (!auth.bypass && !isOrinAllowedUser(auth.user.login)) return null;
  return { token: auth.token, user: auth.user };
};

export async function revokeGitHubToken(token) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!token || !clientId || !clientSecret) return false;

  try {
    const response = await fetch(
      `https://api.github.com/applications/${encodeURIComponent(clientId)}/token`,
      {
        method: 'DELETE',
        redirect: 'error',
        signal: AbortSignal.timeout(5_000),
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify({ access_token: token })
      }
    );
    // 404 means GitHub already considers the token gone.
    return response.ok || response.status === 404;
  } catch {
    // Logout must still clear the local session if GitHub is unreachable.
    return false;
  }
}


export const publicUser = (user) => ({
  login: user.login,
  name: user.name,
  avatar_url: user.avatar_url,
  html_url: user.html_url
});
