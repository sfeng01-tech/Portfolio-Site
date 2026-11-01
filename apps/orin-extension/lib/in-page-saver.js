// In-page saver: injected into an ORIN-origin tab by the background worker
// (via chrome.scripting.executeScript with file injection, so it keeps the
// same isolated world across injections).
//
// Why it exists: Safari does not attach HttpOnly session cookies to fetches
// from the extension's background service worker, so the direct save path can
// never authenticate there. A same-origin fetch from a real ORIN page does
// attach cookies — and its Origin header matches the server naturally, so no
// declarativeNetRequest header stripping is needed on this path.
//
// Re-injection is guarded by a world flag so repeated saves don't stack
// duplicate onMessage listeners.
if (!window.__orinSaverListener) {
  window.__orinSaverListener = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'orin-page-save') return;
    handlePageSave(message).then(sendResponse);
    return true; // async response
  });
}

async function handlePageSave(message) {
  const body = message.payload || {};
  try {
    const response = await fetch('/api/orin/contributions', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: body.url,
        title: body.title,
        ...(body.note ? { note: body.note } : {}),
        ...(body.category ? { category: body.category } : {})
      })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        return { ok: false, code: 'auth', message: 'Sign in on this ORIN tab, then save again from the extension' };
      }
      return { ok: false, code: 'server', status: response.status, message: (typeof data.error === 'string' && data.error) || `ORIN returned ${response.status}` };
    }

    const data = await response.json().catch(() => ({}));
    // Piggyback a categories refresh: this is the only Safari request path
    // that can read the owner-only endpoint, so the background worker caches
    // it for the popup.
    let categories = null;
    try {
      const categoriesResponse = await fetch('/api/orin/categories', { credentials: 'same-origin' });
      if (categoriesResponse.ok) {
        const categoriesData = await categoriesResponse.json();
        categories = (Array.isArray(categoriesData.categories) ? categoriesData.categories : [])
          .map((row) => row && row.label)
          .filter((label) => typeof label === 'string' && label.length > 0)
          .sort((a, b) => a.localeCompare(b));
      }
    } catch { /* cache refresh is best-effort */ }

    return { ok: true, existed: Boolean(data.existed), date: data.date, id: data.id, ...(categories ? { categories } : {}) };
  } catch (error) {
    return { ok: false, code: 'network', message: 'ORIN page could not reach its own API (' + (error && error.message ? error.message : 'network error') + ')' };
  }
}
