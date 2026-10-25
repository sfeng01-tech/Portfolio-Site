// Normalizes editor HTML into a small, trusted subset before a note is saved or
// rendered back into contentEditable. The whitelist matches what the toolbar
// produces, so scripts, event handlers, styling payloads from pasted sources,
// and unknown markup cannot reach the database or the render pass.
const DROP_WITH_CONTENT = new Set(['script', 'style', 'noscript', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'canvas', 'video', 'audio']);
const ALLOWED_TAGS = new Set([
  'p', 'br', 'div', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'a', 'span'
]);
const ALLOWED_ATTRIBUTES = { a: ['href', 'title'] };

function safeHref(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value, 'https://orin.invalid');
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

// Returns an html string that only contains whitelisted tags and attributes.
export function sanitizeNoteHtml(html) {
  if (typeof html !== 'string' || !html.trim()) return '';
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const output = parsed.body;
  const collapse = [];
  for (const node of [...output.children]) {
    const replacement = sanitizeNode(node, collapse);
    if (replacement === null) node.remove();
    else if (replacement !== undefined && replacement !== node) node.replaceWith(...replacement);
  }
  if (collapse.length) {
    for (const [dead, keep] of collapse) {
      if (dead.parentNode) dead.replaceWith(...keep);
    }
    collapse.length = 0;
    return sanitizeNoteHtml(output.innerHTML);
  }
  return output.innerHTML;
}

// sanitizeNode clones a whitelisted element and returns null for anything that
// must vanish. Disallowed containers unwrap: their surviving children move up.
function sanitizeNode(node, collapse) {
  if (node.nodeType === Node.TEXT_NODE) return node.cloneNode();
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const tag = node.tagName.toLowerCase();
  if (DROP_WITH_CONTENT.has(tag)) return null;
  if (!ALLOWED_TAGS.has(tag)) {
    collapse.push([node, [...node.childNodes].map(child => sanitizeNode(child, collapse) ?? '')]);
    return null;
  }
  const clone = document.createElement(tag);
  for (const name of ALLOWED_ATTRIBUTES[tag] || []) {
    const value = node.getAttribute(name);
    if (name === 'href') {
      const href = safeHref(value);
      if (href) clone.setAttribute('href', href);
    } else if (value) clone.setAttribute(name, value);
  }
  for (const child of [...node.childNodes]) {
    const replacement = sanitizeNode(child, collapse);
    if (replacement === null) continue;
    clone.append(replacement !== child && replacement !== undefined ? replacement : child);
  }
  return clone;
}

// Word/character accounting for the status bar, matching the server count.
export function notePlainText(html) {
  const parsed = new DOMParser().parseFromString(sanitizeNoteHtml(html) || '', 'text/html');
  for (const block of ['p', 'div', 'h1', 'h2', 'h3', 'li', 'blockquote']) {
    for (const node of parsed.querySelectorAll(block)) node.after(parsed.createTextNode('\n'));
  }
  return (parsed.body.textContent || '').replace(/\u00a0/g, ' ');
}

export function countWords(text) {
  return String(text).split(/\s+/).filter(Boolean).length;
}

// Docs derive the title from the first document line until you rename it.
export function titleFromHtml(html, fallback = 'Untitled note') {
  const firstLine = notePlainText(html).split('\n').map(line => line.trim()).find(Boolean);
  return firstLine ? firstLine.slice(0, 120) : fallback;
}
