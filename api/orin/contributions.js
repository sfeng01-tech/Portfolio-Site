import { youtubeMetadata } from '../../apps/portfolio/server/youtube.js';
import { orinSql, privateResponse, requireOrinOwner, safeUrl, sendError, validDate, validateCategory, itemId } from '../../apps/portfolio/server/orin.js';

const localDay = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: process.env.ORIN_TIMEZONE || 'America/Los_Angeles'
}).format(new Date());

// Shared PDFs arrive as extracted text, never as a binary upload. The same
// bounds as digest excerpts apply, plus a floor so scanned, textless PDFs are
// rejected rather than stored as empty entries.
const MIN_PDF_TEXT = 80;
const MAX_PDF_TEXT = 12000;
const MAX_PDF_NAME = 300;
const invalidPdfText = text => text.length < MIN_PDF_TEXT || text.length > MAX_PDF_TEXT || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text);

export default async function handler(req, res) {
  privateResponse(res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await requireOrinOwner(req, true);
    const body = req.body || {};
    if (body.date !== undefined && body.date !== null && !validDate(body.date)) return res.status(400).json({ error: 'Invalid date' });
    const day = validDate(body.date) ? body.date : localDay();
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') return res.status(400).json({ error: 'Invalid note' });
    if (day > localDay()) return res.status(400).json({ error: 'Digest date cannot be in the future' });
    if (note.length > 4000) return res.status(400).json({ error: 'Note is too long' });

    const hasUrl = typeof body.url === 'string' && body.url.trim() !== '';
    const sharedPdf = body.pdf === undefined || body.pdf === null ? null : body.pdf;
    if (!hasUrl && !sharedPdf) return res.status(400).json({ error: 'Provide a URL or a PDF to share' });
    if (hasUrl && sharedPdf) return res.status(400).json({ error: 'Share either a URL or a PDF, not both' });

    let id, title, excerpt, itemUrl, contribution, pdfName, pdfText;
    if (sharedPdf) {
      if (typeof sharedPdf !== 'object' || Array.isArray(sharedPdf)) return res.status(400).json({ error: 'Invalid PDF payload' });
      pdfName = typeof sharedPdf.name === 'string' ? sharedPdf.name.trim() : '';
      if (!pdfName || pdfName.length > MAX_PDF_NAME || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(pdfName)) return res.status(400).json({ error: 'Invalid PDF name' });
      pdfText = String(sharedPdf.text ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
      if (invalidPdfText(pdfText)) {
        return res.status(400).json({ error: `PDF text could not be read or is outside the ${MIN_PDF_TEXT}–${MAX_PDF_TEXT} character range` });
      }
      // Identity comes from the content, so re-sharing the same document is a
      // no-op instead of a duplicate. No remote URL exists for uploads.
      id = itemId(`orin-pdf:${pdfName}:${pdfText}`);
      title = pdfName.replace(/\.pdf$/i, '').slice(0, 500) || 'Shared PDF';
      excerpt = note ? `${note}\n\n${pdfText}`.slice(0, MAX_PDF_TEXT) : pdfText;
      itemUrl = null;
      contribution = { kind: 'pdf', sharedBy: 'you', fileName: pdfName, characters: pdfText.length, ...(note ? { note } : {}) };
    } else {
      const canonicalUrl = safeUrl(body.url);
      const hostname = new URL(canonicalUrl).hostname.replace(/^www\./, '');
      id = itemId(canonicalUrl);
      title = `Shared link from ${hostname}`;
      excerpt = note || 'Added from the Share tab for review.';
      itemUrl = canonicalUrl;
      contribution = { kind: 'url', sharedBy: 'you', ...(note ? { note } : {}) };
    }

    const sql = await orinSql();
    let category = null;
    if (body.category !== undefined && body.category !== null && body.category !== '') {
      category = validateCategory(body.category);
      const [existing] = await sql`SELECT label FROM orin_categories WHERE lower(label) = lower(${category}) LIMIT 1`;
      if (!existing) return res.status(404).json({ error: 'Unknown category' });
      category = existing.label;
    }
    if (!category && itemUrl && ['youtube.com', 'm.youtube.com', 'youtu.be'].includes(new URL(itemUrl).hostname.replace(/^www\./, ''))) {
      category = 'YouTube';
    }

    const now = new Date().toISOString();
    const metadata = itemUrl ? await youtubeMetadata(itemUrl) : null;
    const item = {
      id,
      source: 'shared',
      url: itemUrl,
      title,
      excerpt,
      author: 'You',
      publishedAt: now,
      collectedAt: now,
      contribution,
      ...(metadata || {}),
      topics: category ? [category] : [],
      ...(category ? { category, categorySource: 'user' } : {})
    };

    const [existingItem] = await sql`SELECT id FROM orin_items WHERE id = ${id}`;
    await sql.transaction([
      sql`INSERT INTO orin_digests (day, digest, source_status) VALUES (${day}, NULL::jsonb, '[]'::jsonb) ON CONFLICT (day) DO NOTHING`,
      ...(existingItem ? [] : [sql`INSERT INTO orin_items (id, item) VALUES (${id}, ${JSON.stringify(item)}::jsonb)`]),
      sql`INSERT INTO orin_digest_items (day, item_id) VALUES (${day}, ${id}) ON CONFLICT DO NOTHING`
    ]);
    return res.status(existingItem ? 200 : 201).json({
      id, date: day, ...(sharedPdf ? { fileName: pdfName, characters: pdfText.length, existed: Boolean(existingItem) } : { url: itemUrl, existed: Boolean(existingItem) })
    });
  } catch (error) {
    return sendError(res, error);
  }
}
