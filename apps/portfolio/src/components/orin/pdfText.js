// Client-side PDF text extraction for the ORIN Share tab. The browser reads the
// file and returns its text so no PDF binary ever leaves the device; only the
// extracted text travels to the contributions endpoint.
//
// pdfjs is loaded lazily by callers (dynamic import), so the ORIN page only
// downloads this bundle when a PDF is actually picked.
import * as pdfjs from 'pdfjs-dist';
// Vite resolves `?url` to a hashed asset the service worker can fetch.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Keep the payload aligned with the excerpt bound used to validate digest items.
export const MAX_PDF_TEXT = 12000;
export const MAX_PDF_BYTES = 40_000_000;

const collapse = text => text.replace(/\s+/g, ' ').trim();

export function pdfTitle(fileName) {
  const base = String(fileName || '').replace(/\.pdf$/i, '').trim();
  return (base || 'Shared document').slice(0, 300);
}

export async function extractPdfText(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const document_ = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  try {
    const segments = [];
    let characters = 0;
    for (let pageNumber = 1; pageNumber <= document_.numPages; pageNumber += 1) {
      const page = await document_.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = collapse(content.items.map(item => item.str).join(' '));
      if (pageText) {
        segments.push(pageText);
        characters += pageText.length + 1;
        // Stop once the extracted text already fills the storeable excerpt.
        if (characters >= MAX_PDF_TEXT) break;
      }
      if (segments.length && (pageNumber & 7) === 0) page.cleanup();
    }
    return { title: pdfTitle(file.name), text: segments.join(' ').slice(0, MAX_PDF_TEXT) };
  } finally {
    await document_.destroy();
  }
}
