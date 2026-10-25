import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { filterBrowserState, encodeBrowserStates, decodeBrowserStates, MAX_DECODED_BYTES } from './session-state.mjs';

const cookie = (domain, value = 'PRIVATE_TEST_VALUE') => ({ name: 'auth_token', value, domain, path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'None' });
const origin = value => ({ origin: value, localStorage: [{ name: 'token', value: 'PRIVATE_TEST_VALUE' }] });

test('filter source domains and discard third-party identity provider sessions', () => {
  const original = { cookies: [cookie('.x.com'), cookie('api.twitter.com'), cookie('.google.com'), cookie('.linkedin.com')], origins: [origin('https://x.com'), origin('https://accounts.google.com'), origin('https://twitter.com')] };
  const result = filterBrowserState('twitter', original);
  assert.deepEqual(result.cookies, original.cookies.slice(0, 2));
  assert.deepEqual(result.origins, [original.origins[0], original.origins[2]]);
  assert.deepEqual(Object.keys(result.cookies[0]), Object.keys(original.cookies[0]));
  assert.notEqual(result.cookies[0], original.cookies[0]);
  assert.equal(original.cookies.length, 4);
});

test('lookalike domains, malformed origins and foreign platform cookies are rejected', () => {
  const domains = ['x.com.evil.test', 'evilx.com', '..x.com', '.reddit.com.evil.test', 'www.linkedin.com@evil.test', 'x.com:443', '.google.com'];
  const result = filterBrowserState('reddit', {
    cookies: [...domains.map(domain => cookie(domain)), cookie('.reddit.com'), cookie('www.reddit.com')],
    origins: [origin('https://reddit.com.evil.test'), origin('http://reddit.com'), origin('https://user:secret@reddit.com'), origin('https://reddit.com/path'), origin('https://reddit.com:444'), origin('https://www.reddit.com')],
  });
  assert.deepEqual(result.cookies.map(entry => entry.domain), ['.reddit.com', 'www.reddit.com']);
  assert.deepEqual(result.origins.map(entry => entry.origin), ['https://www.reddit.com']);
  assert.deepEqual(filterBrowserState('linkedin', { cookies: [cookie('.linkedin.com'), cookie('.x.com')], origins: [] }).cookies.map(entry => entry.domain), ['.linkedin.com']);
});

test('raw JSON and compressed session maps roundtrip through filtering', () => {
  const states = { twitter: { cookies: [cookie('.x.com', 'a'.repeat(4000)), cookie('.google.com')], origins: [origin('https://x.com')] }, reddit: { cookies: [], origins: [] } };
  const filtered = { twitter: filterBrowserState('twitter', states.twitter), reddit: filterBrowserState('reddit', states.reddit) };
  const encoded = encodeBrowserStates(states);
  assert.ok(encoded.startsWith('gzip:'));
  assert.deepEqual(decodeBrowserStates(encoded), filtered);
  assert.deepEqual(decodeBrowserStates(encodeBrowserStates(states, { compress: false })), filtered);
  assert.deepEqual(decodeBrowserStates(JSON.stringify(states)), filtered);
});

test('malformed, invalid gzip, oversized and unknown source inputs return sanitized errors', () => {
  const compressedBomb = `gzip:${gzipSync(Buffer.from(' '.repeat(MAX_DECODED_BYTES + 1))).toString('base64')}`;
  for (const input of ['PRIVATE_TEST_VALUE invalid json', 'gzip:PRIVATE_TEST_VALUE', 'gzip:AAAA', '{"twitter":null}', '{"google":{"cookies":[],"origins":[]}}', 'x'.repeat(MAX_DECODED_BYTES + 1), compressedBomb]) {
    assert.throws(() => decodeBrowserStates(input), error => error.message === 'Invalid ORIN browser session state' && !error.message.includes('PRIVATE_TEST_VALUE'));
  }
  assert.throws(() => filterBrowserState('google', { cookies: [], origins: [] }), /Invalid ORIN browser session state/);
  assert.throws(() => encodeBrowserStates({ twitter: { cookies: [cookie('.x.com', 'a'.repeat(50_000))], origins: [] } }, { compress: false }), /Invalid ORIN browser session state/);
});
