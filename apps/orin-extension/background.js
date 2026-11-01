// MV3 service worker for the ORIN Saver extension.
// Handles context menus, the save-page keyboard command, popup messages,
// and the declarativeNetRequest rule that strips the Origin header on
// POSTs to the configured ORIN origin.

const DEFAULT_ORIGIN = 'https://orin-digest.onrender.com';
const INTERNAL_SCHEMES = ['chrome:', 'edge:', 'about:', 'chrome-extension:', 'devtools:', 'view-source:'];

// --- Headers ---

// The ORIN contribution endpoint rejects writes whose `Origin` header does
// not match the server's own origin (same-origin write guard). That header
// is set by the browser and cannot be removed from fetch(), so we strip it
// with a dynamic declarativeNetRequest rule instead. Without this the
// extension's POST would always look cross-origin and be rejected with 403.
async function syncOriginStripRule(origin) {
  let domain;
  try {
    domain = new URL(origin).hostname;
  } catch {
    domain = new URL(DEFAULT_ORIGIN).hostname;
  }
  // Safari's declarativeNetRequest condition support is narrower than Chrome's
  // (urlFilter/requestDomains/requestMethods are not documented as supported),
  // so the rule uses regexFilter over the /api/orin/ path instead. Matching
  // GET category lookups as well is harmless — the server's same-origin guard
  // only applies to writes.
  const hostRegex = domain.replace(/^www\./, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{ header: 'Origin', operation: 'remove' }]
      },
      condition: {
        regexFilter: `^https?://(www\\.)?${hostRegex}(?::\\d+)?/api/orin/`,
        // xmlhttprequest covers both fetches from the background worker and
        // any future in-page fetches of this API.
        resourceTypes: ['xmlhttprequest']
      }
    }]
  });
}

// Make sure the configured origin is host-permissioned. Cookies (the ORIN
// GitHub session, HttpOnly) are only attached to extension fetches with
// `credentials: 'include'` when the origin matches granted host permissions.
async function ensureHostPermission(origin) {
  const pattern = origin + '/*';
  const granted = await chrome.permissions.contains({ origins: [pattern] });
  if (granted) return true;
  try {
    return await chrome.permissions.request({ origins: [pattern] });
  } catch {
    // Requesting without a user gesture (e.g. on startup) throws; the options
    // page re-requests on save. Load-unpacked installs of the default origins
    // are covered by host_permissions in the manifest.
    return false;
  }
}

// --- Saving ---

function canonicalize(url) {
  const trimmed = (url || '').trim();
  if (!trimmed) return null;
  // Accept scheme-less input from the popup as https.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return 'https://' + trimmed;
  return trimmed;
}

async function saveToOrin({ url, title, note, category }) {
  const origin = (await chrome.storage.sync.get('orinOrigin')).orinOrigin || DEFAULT_ORIGIN;
  const finalUrl = canonicalize(url);
  if (!finalUrl || isInternal(finalUrl)) {
    return { ok: false, code: 'invalid', message: "This page can't be saved" };
  }

  const body = {
    url: finalUrl,
    title: (title || '').trim() || finalUrl,
    ...(note ? { note: note.trim() } : {}),
    ...(category ? { category } : {})
  };

  const direct = await saveDirect(origin, body);
  // Safari's background worker does not attach HttpOnly cookies to
  // cross-origin fetches, so its direct path always fails with 401 even
  // while the user is signed in (or 'network' when host access is missing).
  // Fall back to saving from an ORIN tab's own page context, where
  // same-origin fetches attach cookies naturally.
  if (direct.ok) return direct;
  if (isSafari() && (direct.code === 'auth' || direct.code === 'network')) {
    return saveFromOrinTab(origin, body, direct);
  }
  return direct;
}

async function saveDirect(origin, body) {
  try {
    const response = await fetch(origin + '/api/orin/contributions', {
      method: 'POST',
      // 'include' lets the browser attach the ORIN GitHub session cookie even
      // though it is HttpOnly (invisible to chrome.cookies / document.cookie).
      // Works in Chrome; Safari omits the cookie here — see saveFromOrinTab.
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      return { ok: true, existed: Boolean(data.existed), date: data.date, id: data.id };
    }

    const bodyText = await response.json().catch(() => ({}));
    const serverMessage = typeof bodyText.error === 'string' ? bodyText.error : '';
    if (response.status === 401) {
      return { ok: false, code: 'auth', message: 'Not logged in — click Log in to open ORIN' };
    }
    return {
      ok: false,
      code: 'server',
      status: response.status,
      message: serverMessage || `ORIN returned ${response.status}`
    };
  } catch (error) {
    console.error('[orin-extension] Save failed:', error.message || error);
    return { ok: false, code: 'network', message: 'Could not reach ORIN at ' + origin };
  }
}

// Safari's user agent contains "Safari" but not "Chrome"; Chrome-based
// browsers all contain "Chrome". Only Safari gets the tab-backed fallback,
// so Chrome keeps its silent, no-tab direct path.
function isSafari() {
  const ua = (navigator && navigator.userAgent) || '';
  return ua.includes('Safari') && !ua.includes('Chrome');
}

async function saveFromOrinTab(origin, body, directResult) {
  let tab;
  let createdTab = false;
  try {
    ({ tab, createdTab } = await getOrinTab(origin));
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['lib/in-page-saver.js']
    });
    const pageResult = await chrome.tabs.sendMessage(tab.id, {
      type: 'orin-page-save',
      payload: body
    });

    if (pageResult?.categories) {
      await chrome.storage.local.set({
        orinCategories: { labels: pageResult.categories, at: Date.now() }
      });
    }

    if (!pageResult) {
      return { ok: false, code: directResult.code, message: directResult.message };
    }
    if (pageResult.ok) {
      return { ok: true, existed: pageResult.existed, date: pageResult.date, id: pageResult.id };
    }
    // Auth inside the tab means the user isn't signed into ORIN itself
    // (not a cookie problem). Leave the ORIN tab open for the sign-in.
    if (pageResult.code === 'auth') {
      console.error('[orin-extension] Not signed in on ORIN tab.');
      return { ok: false, code: 'auth', message: 'Sign in on the ORIN tab that just opened, then save again' };
    }
    return pageResult;
  } catch (error) {
    console.error('[orin-extension] Tab save failed:', error.message || error);
    return {
      ok: false,
      code: 'auth',
      message: 'ORIN needs you to sign in where the extension can reach it. Open ORIN in a tab, sign in, then save again.'
    };
  } finally {
    // Only close tabs we opened ourselves for the legwork.
    if (createdTab && tab) chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function getOrinTab(origin) {
  // Prefer an ORIN tab the user already has open: saving there is invisible.
  try {
    const tabs = await chrome.tabs.query({ url: origin + '/*' });
    if (tabs.length) return { tab: tabs[0], createdTab: false };
  } catch {
    // URL-pattern queries can be rejected without per-site access in Safari;
    // fall through to creating one.
  }
  const tab = await chrome.tabs.create({ url: origin + '/orin', active: false });
  await waitForLoad(tab.id);
  return { tab, createdTab: true };
}

function waitForLoad(tabId) {
  let timer;
  return new Promise((resolve) => {
    const done = () => {
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve();
    };
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') done();
    };
    chrome.tabs.onUpdated.addListener(listener);
    // If the page never reports complete (redirect, slow site), proceed after
    // a generous timeout; the in-page saver will fail cleanly instead.
    timer = setTimeout(done, 10000);
  });
}

function isInternal(url) {
  try {
    return INTERNAL_SCHEMES.some((scheme) => url.startsWith(scheme));
  } catch {
    return true;
  }
}

// --- Badge feedback ---

let badgeTimer;
async function flashBadge(ok) {
  const text = ok ? '✓' : '✕';
  await chrome.action.setBadgeBackgroundColor({ color: ok ? '#16a34a' : '#dc2626' });
  await chrome.action.setBadgeText({ text });
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => chrome.action.setBadgeText({ text: '' }), 4000);
}

async function saveAndSignal(payload) {
  const result = await saveToOrin(payload);
  flashBadge(result.ok);
  if (!result.ok) {
    console.error('[orin-extension] Save failed:', result.message);
  }
  return result;
}

// --- Context menus & commands ---

async function saveActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return { ok: false, code: 'invalid', message: 'No active tab to save' };
  return saveAndSignal({ url: tab.url, title: tab.title });
}

chrome.runtime.onInstalled.addListener(async () => {
  if (!(await chrome.storage.sync.get('orinOrigin')).orinOrigin) {
    await chrome.storage.sync.set({ orinOrigin: DEFAULT_ORIGIN });
  }
  chrome.contextMenus.create({
    id: 'orin-save',
    title: 'Save to ORIN',
    contexts: ['page', 'link']
  });
  chrome.contextMenus.create({
    id: 'orin-save-page',
    parentId: 'orin-save',
    title: 'Save page to ORIN',
    contexts: ['page']
  });
  chrome.contextMenus.create({
    id: 'orin-save-link',
    parentId: 'orin-save',
    title: 'Save link to ORIN',
    contexts: ['link']
  });
  await syncOriginStripRule((await chrome.storage.sync.get('orinOrigin')).orinOrigin || DEFAULT_ORIGIN);
});

chrome.runtime.onStartup.addListener(async () => {
  const { orinOrigin } = await chrome.storage.sync.get('orinOrigin');
  await syncOriginStripRule(orinOrigin || DEFAULT_ORIGIN);
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'orin-save-page') {
    saveActiveTab();
  } else if (info.menuItemId === 'orin-save-link') {
    // A link save has no note; derive a title since link targets rarely carry one.
    let hostname = '';
    try { hostname = new URL(info.linkUrl).hostname; } catch { /* keep empty */ }
    saveAndSignal({
      url: info.linkUrl,
      title: info.selectionText || 'Link saved from ' + hostname
    });
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'save-page') saveActiveTab();
});

// --- Messages from the popup ---

async function fetchCategories() {
  const origin = (await chrome.storage.sync.get('orinOrigin')).orinOrigin || DEFAULT_ORIGIN;
  const cached = (await chrome.storage.local.get('orinCategories')).orinCategories
    || { labels: [], at: 0 };
  try {
    const response = await fetch(origin + '/api/orin/categories', { credentials: 'include' });
    if (response.ok) {
      const data = await response.json();
      // Shape per api/orin/categories.js: { categories: [{ label, items }] }
      const categories = (Array.isArray(data.categories) ? data.categories : [])
        .map((row) => row && row.label)
        .filter((label) => typeof label === 'string' && label.length > 0)
        .sort((a, b) => a.localeCompare(b));
      if (categories.length) {
        await chrome.storage.local.set({ orinCategories: { labels: categories, at: Date.now() } });
      }
      return { ok: true, categories };
    }
    // 401 (or anything else) — same Safari cookie limitation or genuinely
    // logged out. Never open a tab just for categories; the popup shows
    // whatever is cached and a fresh fetch piggybacks on every Safari save.
    return { ok: false, categories: cached.labels || [] };
  } catch (error) {
    console.error('[orin-extension] Categories fetch failed:', error.message || error);
    return { ok: false, categories: cached.labels || [] };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'save') {
    saveToOrin(message).then(sendResponse);
    return true; // keep the message channel open for the async response
  }
  if (message?.type === 'fetchCategories') {
    fetchCategories().then(sendResponse);
    return true;
  }
  if (message?.type === 'updateOrigin') {
    // The options page has already stored the origin and requested the host
    // permission (needs its user gesture); we only rebuild the DNR rule.
    syncOriginStripRule(message.origin)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error('[orin-extension] DNR rule update failed:', error.message || error);
        sendResponse({ ok: false });
      });
    return true;
  }
});
