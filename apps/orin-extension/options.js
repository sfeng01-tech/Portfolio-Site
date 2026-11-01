const DEFAULT_ORIGIN = 'https://orin-digest.onrender.com';

const $ = (id) => document.getElementById(id);

async function init() {
  const { orinOrigin } = await chrome.storage.sync.get('orinOrigin');
  const origin = orinOrigin || DEFAULT_ORIGIN;
  $('origin').value = origin;
  $('current').textContent = 'Current: ' + origin;
  $('save').addEventListener('click', save);
}

function normalize(input) {
  const trimmed = input.trim().replace(/\/+$/, ''); // no trailing slash
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  return parsed.origin;
}

// Changing the origin needs two follow-ups: a host permission for the new
// origin (cookies are only attached to permitted hosts) and a rebuilt DNR
// rule so the Origin header is stripped on the new domain. Permission
// requests must happen in this user-gesture context, not from the service
// worker, so the options page requests the permission and asks the
// background worker to rebuild the rule afterwards.
async function save() {
  const origin = normalize($('origin').value);
  if (!origin) return setStatus('Enter a valid http(s) URL', 'error');

  const granted = await chrome.permissions.request({ origins: [origin + '/*'] });
  if (!granted) return setStatus('Host permission for ' + origin + ' was not granted', 'error');

  await chrome.storage.sync.set({ orinOrigin: origin });

  const response = await chrome.runtime.sendMessage({ type: 'updateOrigin', origin });
  if (!response?.ok) return setStatus('Saved, but could not rebuild the request rule', 'error');

  $('current').textContent = 'Current: ' + origin;
  setStatus('Saved. ORIN origin is now ' + origin, 'ok');
}

function setStatus(text, kind) {
  const status = $('status');
  status.textContent = text;
  status.className = kind;
}

init();
