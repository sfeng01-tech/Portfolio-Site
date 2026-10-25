#!/usr/bin/env node
import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { allowedSourceUrl, dailyDate, selectItems } from './core.mjs';
import { collectFeed, collectSocial, createRedditApi, createXApi } from './sources.mjs';
import { summarize } from './summarize.mjs';
import { filterBrowserState, encodeBrowserStates, decodeBrowserStates } from './session-state.mjs';

const home = path.dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({ options: {
  config: { type: 'string', default: path.join(home, 'config.local.json') },
  'state-dir': { type: 'string', default: path.join(home, '.state') },
  once: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, 'rss-only': { type: 'boolean' },
  'no-model': { type: 'boolean' }, 'keychain-openrouter': { type: 'boolean' },
  login: { type: 'string' },
  'export-sessions': { type: 'boolean' },
  'sync-sessions': { type: 'boolean' },
  repo: { type: 'string', default: 'sfeng01-tech/Portfolio-Site' },
} });

async function saveJson(file, value) {
  await writeFile(`${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(`${file}.tmp`, file);
}

function validateConfig(config) {
  if (!Array.isArray(config.topics) || !config.topics.length || config.topics.some(topic => typeof topic !== 'string' || !topic.trim() || topic.length > 100)) throw new Error('Config needs bounded, nonempty topic strings');
  if (!Number.isInteger(config.maxItems) || config.maxItems < 1 || config.maxItems > 100) throw new Error('maxItems must be 1–100');
  if (!(config.maxAgeHours > 0 && config.maxAgeHours <= 168) || !(config.maxRunUsd > 0 && config.maxRunUsd <= 1)) throw new Error('Invalid freshness or run budget');
  if (!Array.isArray(config.feeds) || !Array.isArray(config.social) || config.feeds.length + config.social.length > 20) throw new Error('At most 20 configured sources');
  dailyDate(config.timezone);
  return config;
}

async function main() {
  const config = validateConfig(JSON.parse(await readFile(values.config, 'utf8')));
  const stateDir = path.resolve(values['state-dir']);
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  // Profile/data lock prevents overlapping scheduler jobs and Chromium profile corruption.
  const lockPath = path.join(stateDir, 'run.lock');
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('Another ORIN job holds run.lock; inspect process before removing a stale lock'); throw error; }
  try {
    await lock.writeFile(String(process.pid));
    if (values['export-sessions'] || values['sync-sessions']) {
      const { chromium } = await import('playwright');
      const states = {};
      for (const source of config.social.filter(row => row.enabled)) {
        const context = await chromium.launchPersistentContext(path.join(stateDir, `profile-${source.source}`), { headless: true });
        try { states[source.source] = filterBrowserState(source.source, await context.storageState()); } finally { await context.close(); }
      }
      if (values['sync-sessions']) {
        if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(values.repo)) throw new Error('Invalid GitHub repository');
        const encoded = encodeBrowserStates(states);
        if (Buffer.byteLength(encoded) > 47_000) throw new Error('Session secret exceeds GitHub size limit; reduce stored source state before syncing');
        const result = spawnSync('gh', ['secret', 'set', 'ORIN_BROWSER_STORAGE_STATE', '--repo', values.repo], { input: encoded, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        if (result.status !== 0) throw new Error('Unable to save browser session secret to GitHub; no session values were logged');
        console.info(`Saved dedicated sessions for ${Object.keys(states).join(', ')} as a GitHub Actions secret. Third-party login state was excluded.`);
        return;
      }
      await saveJson(path.join(stateDir, 'browser-sessions.json'), states);
      console.info('Exported private browser-sessions.json in runner state. Treat this file as an account credential; never commit or upload as a build artifact.');
      return;
    }
    if (values.login) {
      const source = config.social.find(row => row.source === values.login);
      if (!source || !allowedSourceUrl(source.source, source.urls?.[0])) throw new Error('Unknown login source');
      const { chromium } = await import('playwright');
      const context = await chromium.launchPersistentContext(path.join(stateDir, `profile-${source.source}`), { headless: false });
      const page = context.pages()[0] || await context.newPage();
      await page.goto(source.urls[0], { waitUntil: 'domcontentloaded' });
      console.info('Sign in manually in the dedicated browser, then close its window. Credentials stay in this private runner profile.');
      await new Promise(resolve => context.on('close', resolve));
      return;
    }
    const date = dailyDate(config.timezone);
    let state = { seen: {}, days: {} };
    try { state = JSON.parse(await readFile(path.join(stateDir, 'state.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const browserStates = process.env.ORIN_BROWSER_STORAGE_STATE ? decodeBrowserStates(process.env.ORIN_BROWSER_STORAGE_STATE) : {};
    const redditApi = config.feeds.some(feed => feed.source === 'reddit') ? createRedditApi() : null;
    const xApi = config.feeds.some(feed => feed.source === 'twitter') ? createXApi() : null;
    const collected = [...(state.days?.[date] || [])], sourceStatus = [];
    const status = (source, url, value, message) => sourceStatus.push({ source, url, status: value, message: message.slice(0, 500), checkedAt: new Date().toISOString() });
    for (const feed of config.feeds) {
      try {
        if (feed.source === 'twitter') {
          if (values['dry-run'] || values['rss-only']) {
            status(feed.source, feed.url, 'disabled', 'X API skipped for dry-run or rss-only; no metered request sent');
            continue;
          }
          if (!process.env.X_API_BEARER_TOKEN) throw new Error('X API is not configured; add the X_API_BEARER_TOKEN Actions secret');
          if (process.env.ORIN_X_API_ALREADY_USED === 'true') throw new Error(`X daily cap already used for ${date}; skipping this run`);
        }
        const items = await collectFeed(feed, { redditApi, xApi }); collected.push(...items);
        const sourceLabel = feed.source === 'reddit' ? 'entries observed through Reddit OAuth API' : feed.source === 'twitter' ? 'posts observed through X API v2 (daily cap: 50)' : 'feed entries observed';
        status(feed.source, feed.url, 'ok', `${items.length} ${sourceLabel}`);
      }
      catch (error) { status(feed.source, feed.url, 'error', error.message); }
    }
    for (const source of config.social) {
      if (!source.enabled || values['rss-only']) { status(source.source, source.urls?.[0] || '', 'disabled', 'Browser source disabled for this run'); continue; }
      try {
        const result = await collectSocial(source, path.join(stateDir, `profile-${source.source}`), { storageState: browserStates[source.source] });
        collected.push(...result.items); status(source.source, source.urls[0], result.status, result.message);
      } catch { status(source.source, source.urls?.[0] || '', 'error', 'Browser collection failed; inspect dedicated session and installed browser before next run'); }
    }
    const items = selectItems(collected, config, state.seen, date);
    const payload = { date, items, sourceStatus };
    // Dry-run never reads a key, calls a model, publishes, or advances dedup state.
    if (values['dry-run']) {
      await saveJson(path.join(stateDir, 'preview.json'), payload);
      console.info(`Dry run: ${items.length} relevant items. Preview saved privately in runner state; nothing published.`);
      console.info(sourceStatus.map(row => `${row.source}: ${row.status} — ${row.message}`).join('\n'));
      return;
    }
    const endpoint = process.env.ORIN_INGEST_URL;
    const token = process.env.ORIN_INGEST_TOKEN;
    const endpointUrl = endpoint ? new URL(endpoint) : null;
    if (!endpointUrl || (endpointUrl.protocol !== 'https:' && !(endpointUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpointUrl.hostname))) || endpointUrl.pathname !== '/api/orin/ingest' || endpointUrl.username || endpointUrl.password || !token || token.length < 32) throw new Error('Set HTTPS ORIN_INGEST_URL ending /api/orin/ingest and ORIN_INGEST_TOKEN (32+ characters)');
    if (!values['no-model'] && items.length) {
      let apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey && values['keychain-openrouter']) {
        if (process.platform !== 'darwin') throw new Error('Keychain is only available on macOS; configure runner environment secret');
        const result = spawnSync('/usr/bin/security', ['find-generic-password', '-s', 'openrouter-api-key', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        if (result.status !== 0) throw new Error('Unable to read OpenRouter key from Keychain');
        apiKey = result.stdout.trim();
      }
      payload.digest = await summarize(items, config, apiKey, date);
    }
    await saveJson(path.join(stateDir, 'pending.json'), payload);
    const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60_000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`Ingest HTTP ${response.status}; state not advanced, pending.json retained for diagnosis`);
    const result = await response.json();
    if (!Number.isInteger(result.count) || result.date !== date) throw new Error('Ingest acknowledgment was invalid; local state not advanced');
    state.seen ||= {}; state.days ||= {};
    for (const item of items) state.seen[item.url] = date;
    state.days[date] = items;
    const cutoff = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
    state.seen = Object.fromEntries(Object.entries(state.seen).filter(([, seenDate]) => seenDate >= cutoff));
    state.days = Object.fromEntries(Object.entries(state.days).filter(([day]) => day >= cutoff));
    state.lastSuccess = new Date().toISOString();
    await saveJson(path.join(stateDir, 'state.json'), state);
    console.info(`Published ORIN ${date}: ${result.count} items (${result.skipped || 0} previously delivered URLs skipped). ${sourceStatus.filter(row => ['blocked', 'error'].includes(row.status)).length} sources need attention.`);
  } finally { await lock.close(); await unlink(lockPath); }
}

main().catch(error => { console.error(`ORIN: ${error.message}`); process.exitCode = 1; });
