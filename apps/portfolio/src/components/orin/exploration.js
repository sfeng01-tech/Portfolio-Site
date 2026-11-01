// Both search results and cited answer cards can become starting references.
// Research accepts HTTPS references; notes without a link remain in the library.
const safeLink = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
  catch { return null; }
};

export function researchHandoff(question, sources) {
  const references = new Map();
  let omitted = 0;
  for (const source of sources) {
    const url = safeLink(source.resolvedUrl) || safeLink(source.url);
    if (!url) { omitted++; continue; }
    const itemId = source.kind === 'note' ? null : (source.sourceId || source.id);
    references.set(url, {
      url, title: String(source.title || url).slice(0,500),
      excerpt: String(source.snippet || source.excerpt || '').slice(0,4000),
      ...(/^[a-f0-9]{64}$/.test(itemId || '') ? { itemId } : {})
    });
  }
  return { question, sources: [...references.values()],
    notice: omitted ? `${omitted} source${omitted === 1 ? ' has' : 's have'} no HTTPS link and could not be attached. Add a source link in the draft if needed.` : '' };
}
