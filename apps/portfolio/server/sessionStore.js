import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';

// Server-side OAuth sessions. The browser only ever receives a random session
// ID; the GitHub access token is encrypted with a server-held key and stored
// outside the browser. Sessions are kept in Postgres when a database URL is
// configured. A process-local store is available for local development and
// tests, but is deliberately unavailable in production.
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const SESSION_ID_BYTES = 32;
const CIPHER = 'aes-256-gcm';
const VERSION = 'v1';
const memorySessions = new Map();
let keyCache = { secret: null, key: null };

const databaseUrl = () => process.env.AUTH_DATABASE_URL || process.env.ORIN_DATABASE_URL || '';

function memoryStoreAllowed() {
  if (process.env.AUTH_SESSION_STORE !== 'memory') return false;
  return process.env.NODE_ENV !== 'production';
}

const secretValue = () => process.env.AUTH_SESSION_SECRET || process.env.GITHUB_CLIENT_SECRET || '';

function encryptionKey() {
  const secret = secretValue();
  if (!secret || secret.length < 16) {
    const error = new Error('Auth session storage is not configured');
    error.status = 503;
    throw error;
  }
  if (keyCache.secret !== secret) {
    keyCache = { secret, key: scryptSync(secret, 'orin-auth-session-v1', 32) };
  }
  return keyCache.key;
}

const hashSessionId = (sessionId) => createHash('sha256').update(sessionId).digest('hex');

const isSessionId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);

function encryptToken(token) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(CIPHER, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url')
  ].join(':');
}

function decryptToken(value) {
  if (typeof value !== 'string') throw new Error('Invalid encrypted session');
  const [version, iv, tag, ciphertext] = value.split(':');
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) throw new Error('Invalid encrypted session');
  const decipher = createDecipheriv(CIPHER, encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

async function neonSql() {
  const url = databaseUrl();
  if (!url) {
    const error = new Error('Auth session storage is not configured');
    error.status = 503;
    throw error;
  }
  const { neon } = await import('@neondatabase/serverless');
  return neon(url);
}

export const sessionTtlSeconds = SESSION_TTL_SECONDS;

export function sessionStorageConfigured() {
  return Boolean((databaseUrl() || memoryStoreAllowed()) && secretValue().length >= 16);
}

export async function createSession({
  token,
  user,
  scope = '',
  maxAgeSeconds = SESSION_TTL_SECONDS
}) {
  if (typeof token !== 'string' || !token) throw new Error('A GitHub access token is required');
  if (!user || typeof user.login !== 'string' || !user.login) throw new Error('A GitHub user is required');
  const secret = secretValue();
  const sessionId = randomBytes(SESSION_ID_BYTES).toString('base64url');
  const id = hashSessionId(sessionId);
  const encrypted = encryptToken(token);
  const ttl = Number.isInteger(maxAgeSeconds) && maxAgeSeconds > 0 ? maxAgeSeconds : SESSION_TTL_SECONDS;
  const expiresAt = new Date(Date.now() + ttl * 1000);

  if (memoryStoreAllowed()) {
    memorySessions.set(id, {
      tokenEncrypted: encrypted,
      user,
      scope,
      expiresAt: expiresAt.getTime()
    });
  } else {
    const sql = await neonSql();
    // Expired sessions are useless; drop them opportunistically on login.
    await sql`DELETE FROM orin_auth_sessions WHERE expires_at < now()`;
    await sql`INSERT INTO orin_auth_sessions (id, token_encrypted, user_login, user_data, scope, expires_at)
      VALUES (${id}, ${encrypted}, ${user.login}, ${JSON.stringify(user)}::jsonb, ${scope}, ${expiresAt.toISOString()})`;
  }

  return { sessionID: sessionId, expiresAt, maxAgeSeconds: ttl };
}

export async function readSession(sessionId) {
  if (!isSessionId(sessionId)) return null;
  const id = hashSessionId(sessionId);

  if (memoryStoreAllowed()) {
    const row = memorySessions.get(id);
    if (!row) return null;
    if (row.expiresAt <= Date.now()) {
      memorySessions.delete(id);
      return null;
    }
    return {
      token: decryptToken(row.tokenEncrypted),
      user: row.user,
      scope: row.scope
    };
  }

  const sql = await neonSql();
  const [row] = await sql`SELECT token_encrypted, user_data, scope, expires_at
    FROM orin_auth_sessions
    WHERE id = ${id} AND expires_at > now()`;
  if (!row) return null;

  try {
    return {
      token: decryptToken(row.token_encrypted),
      user: row.user_data,
      scope: row.scope
    };
  } catch {
    // A rotated or corrupt key makes the session unusable. Remove the row so it
    // cannot block a fresh login.
    await sql`DELETE FROM orin_auth_sessions WHERE id = ${id}`;
    return null;
  }
}

export async function deleteSession(sessionId) {
  if (!isSessionId(sessionId)) return null;
  const id = hashSessionId(sessionId);

  if (memoryStoreAllowed()) {
    const row = memorySessions.get(id);
    memorySessions.delete(id);
    if (!row) return null;
    try { return { token: decryptToken(row.tokenEncrypted), user: row.user, scope: row.scope }; }
    catch { return null; }
  }

  const sql = await neonSql();
  const [row] = await sql`DELETE FROM orin_auth_sessions WHERE id = ${id}
    RETURNING token_encrypted, user_data, scope`;
  if (!row) return null;
  try { return { token: decryptToken(row.token_encrypted), user: row.user_data, scope: row.scope }; }
  catch { return null; }
}

// Test/local helper. Never reachable in production because the memory store
// itself is disabled there.
export function clearMemorySessions() {
  memorySessions.clear();
}
