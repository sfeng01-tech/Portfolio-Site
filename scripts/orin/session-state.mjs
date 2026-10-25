import { gzipSync, gunzipSync } from 'node:zlib';

export const MAX_DECODED_BYTES = 2_000_000;
// Below GitHub's 48 KiB secret limit, leaving a little operational headroom.
export const MAX_SECRET_BYTES = 48_000;
const SOURCE_DOMAINS = {
  twitter: ['x.com', 'twitter.com'],
  linkedin: ['linkedin.com'],
  reddit: ['reddit.com'],
};
const invalid = () => new Error('Invalid ORIN browser session state');

function belongsToSource(source, domain) {
  if (typeof domain !== 'string') return false;
  const host = domain.replace(/^\./, '').toLowerCase();
  // Cookie domains cannot contain paths, credentials, ports, or whitespace.
  if (!/^[a-z0-9.-]+$/.test(host) || host.startsWith('.') || host.endsWith('.')) return false;
  return SOURCE_DOMAINS[source].some(root => host === root || host.endsWith(`.${root}`));
}

/** Keep only credentials scoped to this source; never include third-party IdP state. */
export function filterBrowserState(source, state) {
  try {
    if (!Object.hasOwn(SOURCE_DOMAINS, source) || !state || typeof state !== 'object' || Array.isArray(state)
      || !Array.isArray(state.cookies) || !Array.isArray(state.origins)) throw invalid();
    const cookies = state.cookies.filter(cookie => cookie && typeof cookie === 'object' && belongsToSource(source, cookie.domain))
      .map(cookie => ({ ...cookie }));
    const origins = state.origins.filter(origin => {
      if (!origin || typeof origin !== 'object' || typeof origin.origin !== 'string' || !Array.isArray(origin.localStorage)) return false;
      try {
        const url = new URL(origin.origin);
        return url.protocol === 'https:' && !url.username && !url.password && !url.port
          && url.origin === origin.origin && belongsToSource(source, url.hostname);
      } catch { return false; }
    }).map(origin => ({ ...origin, localStorage: origin.localStorage.map(entry => ({ ...entry })) }));
    return { cookies, origins };
  } catch { throw invalid(); }
}

function filterStates(states) {
  if (!states || typeof states !== 'object' || Array.isArray(states)) throw invalid();
  const result = {};
  for (const [source, state] of Object.entries(states)) {
    if (!Object.hasOwn(SOURCE_DOMAINS, source)) throw invalid();
    result[source] = filterBrowserState(source, state);
  }
  return result;
}

/** Encode a source->Playwright state object, removing unrelated cookies first. */
export function encodeBrowserStates(states, { compress = true } = {}) {
  try {
    const json = JSON.stringify(filterStates(states));
    if (Buffer.byteLength(json) > MAX_DECODED_BYTES) throw invalid();
    const compressed = compress ? `gzip:${gzipSync(Buffer.from(json)).toString('base64')}` : null;
    const value = compressed && Buffer.byteLength(compressed) < Buffer.byteLength(json) ? compressed : json;
    if (Buffer.byteLength(value) > MAX_SECRET_BYTES) throw new Error();
    return value;
  } catch { throw invalid(); }
}

/** Decode raw JSON or gzip:base64 without ever echoing credential-bearing input. */
export function decodeBrowserStates(value) {
  try {
    if (typeof value !== 'string' || !value.length || Buffer.byteLength(value) > MAX_DECODED_BYTES) throw invalid();
    let json = value;
    if (value.startsWith('gzip:')) {
      const base64 = value.slice(5);
      if (!base64.length || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw invalid();
      const compressed = Buffer.from(base64, 'base64');
      json = gunzipSync(compressed, { maxOutputLength: MAX_DECODED_BYTES }).toString('utf8');
    }
    if (Buffer.byteLength(json) > MAX_DECODED_BYTES) throw invalid();
    return filterStates(JSON.parse(json));
  } catch { throw invalid(); }
}
