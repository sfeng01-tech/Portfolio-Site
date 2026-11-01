const DEFAULT_ORIGIN = 'https://orin-digest.onrender.com';
const INTERNAL_SCHEMES = ['chrome:', 'edge:', 'about:', 'chrome-extension:', 'devtools:', 'view-source:'];

const $ = (id) => document.getElementById(id);

let activeTab = null;
let saveEnabled = true;
let origin = DEFAULT_ORIGIN;

async function init() {
  const { orinOrigin } = await chrome.storage.sync.get('orinOrigin');
  origin = orinOrigin || DEFAULT_ORIGIN;
  $('target-origin').textContent = origin;

  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let url = activeTab?.url || '';
  if (isInternal(url)) {
    $('save').disabled = true;
    saveEnabled = false;
    $('internal-warning').hidden = false;
    url = '';
  } else {
    $('url').value = url;
    $('title').value = activeTab?.title || '';
  }

  loadCategories(origin);

  $('save').addEventListener('click', save);
  $('open-orin').addEventListener('click', () => chrome.tabs.create({ url: origin + '/orin' }));
  // Login happens on the ORIN site; afterwards the extension reuses the
  // browser cookie jar automatically.
  $('login').addEventListener('click', () => chrome.tabs.create({ url: origin + '/orin' }));
}

function isInternal(url) {
  try {
    return INTERNAL_SCHEMES.some((scheme) => url.startsWith(scheme));
  } catch {
    return true;
  }
}

// Categories come from the owner-only GET; failure is never fatal for saving.
async function loadCategories(origin) {
  let response;
  try {
    response = await chrome.runtime.sendMessage({ type: 'fetchCategories' });
  } catch {
    return showCategoriesUnavailable();
  }
  if (!response || !response.categories || !response.categories.length) {
    return showCategoriesUnavailable();
  }
  // The worker may serve cached labels with ok:false (e.g. Safari's cookie
  // limitation); labels are still good for the dropdown.

  const select = $('category');
  for (const label of response.categories) {
    const option = document.createElement('option');
    option.value = label;
    option.textContent = label; // textContent, labels are data not markup
    select.appendChild(option);
  }
  select.hidden = false;
}

function showCategoriesUnavailable() {
  // Keep it simple: nothing blocking, just a hint. The save still sends an
  // unclassified item and ORIN files it separately.
  $('category-hint').hidden = false;
}

async function save() {
  if (!saveEnabled) return;
  const url = $('url').value.trim();
  const title = $('title').value.trim();
  const note = $('note').value.trim();
  const categorySelect = $('category');
  const category = !categorySelect.hidden ? categorySelect.value : undefined;

  $('save').disabled = true;
  setStatus('Saving…', '');

  const result = await chrome.runtime.sendMessage({ type: 'save', url, title, note, category });

  if (result?.ok) {
    const dayMessage = result.date ? ` — ${formatDay(result.date)}` : '';
    setStatus(`Saved to ORIN${dayMessage}${result.existed ? ' (already saved today)' : ''}`, 'ok');
    $('save').disabled = false;
    // Safari saves run through an ORIN tab, which is the one path that can
    // read categories there; the worker caches them, so correct the
    // "unavailable" state that init may have shown.
    if ($('category').hidden) loadCategories(origin);
  } else {
    $('save').disabled = false;
    if (result?.code === 'auth') $('login').hidden = false;
    setStatus(result?.message || 'Something went wrong', 'error');
  }
}

function formatDay(date) {
  // ORIN dates are digest-day stamps; show a short human-readable version.
  try {
    return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return String(date);
  }
}

function setStatus(text, kind) {
  const status = $('status');
  status.textContent = text; // never innerHTML: titles/notes may contain HTML-ish text
  status.className = kind;
}

init();
