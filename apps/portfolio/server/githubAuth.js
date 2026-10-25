export const REPOSITORY = {
  owner: process.env.GITHUB_REPOSITORY_OWNER || 'sfeng01-tech',
  name: process.env.GITHUB_REPOSITORY_NAME || 'Portfolio-Site',
  branch: process.env.GITHUB_REPOSITORY_BRANCH || 'main',
  dataFile: 'apps/portfolio/src/data/portfolioData.js'
};

const normalizeLogin = (login) => typeof login === 'string' ? login.trim().toLowerCase() : '';
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
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers
    }
  }
);

export const getAuthorizedUser = async (req) => {
  const token = parseCookies(req)[TOKEN_COOKIE];
  if (!token) return null;

  const response = await githubFetch('/user', token);
  if (!response.ok) return null;

  const user = await response.json();
  if (!isPortalAllowedUser(user.login)) return null;

  return { token, user };
};

export const getAuthorizedOrinUser = async (req) => {
  const token = parseCookies(req)[TOKEN_COOKIE];
  if (!token) return null;

  const response = await githubFetch('/user', token);
  if (!response.ok) return null;

  const user = await response.json();
  if (!isOrinAllowedUser(user.login)) return null;

  return { token, user };
};

export const publicUser = (user) => ({
  login: user.login,
  name: user.name,
  avatar_url: user.avatar_url,
  html_url: user.html_url
});
