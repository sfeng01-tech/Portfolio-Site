import { createHash } from 'node:crypto';

// Character-bounded chunks keep retrieval passages small enough to cite and
// large enough to carry an argument. Overlap preserves sentences that straddle
// a boundary without duplicating whole documents.
export const CHUNK_CHARS = 1800;
export const CHUNK_OVERLAP = 220;

export const estimateTokens = text => Math.ceil(String(text || '').length / 4);

export function chunkText(text, { maxChars = CHUNK_CHARS, overlap = CHUNK_OVERLAP } = {}) {
  const clean = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(clean.length, start + maxChars);
    if (end < clean.length) {
      // Prefer a paragraph, then a sentence, then a word boundary.
      const window = clean.slice(start, end);
      const paragraph = window.lastIndexOf('\n\n');
      const sentence = window.lastIndexOf('. ');
      const word = window.lastIndexOf(' ');
      const cut = paragraph > maxChars * 0.45 ? paragraph + 2
        : sentence > maxChars * 0.55 ? sentence + 2
          : word > maxChars * 0.6 ? word + 1 : -1;
      if (cut > 0) end = start + cut;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

export const chunkHash = text => createHash('sha256').update(String(text || '')).digest('hex');
export const chunkId = (kind, sourceId, ordinal) => `${kind}:${sourceId}:${ordinal}`;

// Build the searchable text for one saved item. Title and excerpt are what the
// collector reliably stores; longer text is used when a source provides it.
export function itemChunkText(item = {}) {
  const title = String(item.title || '').trim();
  const body = String(item.text || item.content || item.excerpt || '').trim();
  if (!title) return body;
  return body ? `${title}\n\n${body}` : title;
}

// Notes keep their title out of the first passage only once; the chunker then
// splits the combined text like any other document.
export function noteChunkText(note = {}) {
  const title = String(note.title || '').trim();
  const body = String(note.content || '').trim();
  if (!title) return body;
  return body ? `${title}\n\n${body}` : title;
}
