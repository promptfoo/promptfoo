import { PDFDocument, StandardFonts } from 'pdf-lib';

export const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_PDF_TEXT_CHARS = 50_000;
const MAX_PAGES = 10;
const PAGE_SIZE: [number, number] = [612, 792];
const MARGIN = 48;
const FONT_SIZE = 11;
const LINE_HEIGHT = 16;

async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  if (bytes.length > MAX_PDF_BYTES || Buffer.from(bytes.subarray(0, 5)).toString() !== '%PDF-') {
    throw new Error('PDF must be a valid PDF file no larger than 5 MiB');
  }
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  if (document.getPageCount() === 0 || document.getPageCount() > MAX_PAGES) {
    throw new Error('PDF must contain between 1 and 10 pages');
  }
  for (const page of document.getPages()) {
    for (const { width, height } of [page.getSize(), page.getCropBox()]) {
      if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width < 72 ||
        height < 72 ||
        width > 1440 ||
        height > 1440
      ) {
        throw new Error('PDF pages must be between 1 and 20 inches in each dimension');
      }
    }
  }
  return document;
}

/** Render text on new pages, preserving the template's existing pages. */
export async function createPdf(text: string, template?: Uint8Array): Promise<Buffer> {
  if (text.length > MAX_PDF_TEXT_CHARS) {
    throw new Error('PDF text exceeds the 50,000-character limit');
  }
  const document = template ? await loadPdf(template) : await PDFDocument.create();
  if (!template) {
    document.setCreationDate(new Date(0));
    document.setModificationDate(new Date(0));
  }
  const font = await document.embedFont(StandardFonts.Helvetica);
  let page = document.addPage(PAGE_SIZE);
  let y = PAGE_SIZE[1] - MARGIN;
  const drawLine = (line: string) => {
    if (y < MARGIN) {
      page = document.addPage(PAGE_SIZE);
      y = PAGE_SIZE[1] - MARGIN;
    }
    if (document.getPageCount() > MAX_PAGES) {
      throw new Error('PDF exceeds the 10-page limit after adding review notes');
    }
    page.drawText(line, { x: MARGIN, y, size: FONT_SIZE, font });
    y -= LINE_HEIGHT;
  };
  // Measure glyphs instead of counting characters; split long unbroken payloads too.
  for (const paragraph of text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')) {
    let remaining = paragraph;
    while (remaining) {
      let end = 0;
      let width = 0;
      for (const character of remaining) {
        try {
          width += font.widthOfTextAtSize(character, FONT_SIZE);
        } catch {
          throw new Error(
            'PDF text contains characters unsupported by Helvetica. Use Latin text for PDF generation.',
          );
        }
        if (width > PAGE_SIZE[0] - 2 * MARGIN) {
          break;
        }
        end += character.length;
      }
      if (end < remaining.length && remaining.lastIndexOf(' ', end) > 0) {
        end = remaining.lastIndexOf(' ', end);
      }
      drawLine(remaining.slice(0, end));
      remaining = remaining.slice(end).trimStart();
    }
    if (!paragraph) {
      drawLine('');
    }
  }
  const bytes = Buffer.from(await document.save());
  if (bytes.length > MAX_PDF_BYTES) {
    throw new Error('Rendered PDF exceeds the 5 MiB limit');
  }
  return bytes;
}

export async function inspectPdf(bytes: Uint8Array): Promise<{ text: string; pageCount: number }> {
  const document = await loadPdf(bytes);
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(bytes), isEvalSupported: false });
  try {
    const result = await parser.getText();
    const text = result.pages.map((page) => page.text).join('\n\n');
    if (text.length > MAX_PDF_TEXT_CHARS) {
      throw new Error('PDF extracted text exceeds the 50,000-character limit');
    }
    return {
      text,
      pageCount: document.getPageCount(),
    };
  } finally {
    await parser.destroy();
  }
}

/** Rasterize every page, including the template, so no extractable text remains. */
export async function scanPdf(bytes: Uint8Array): Promise<Buffer> {
  const source = await loadPdf(bytes);
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(bytes), isEvalSupported: false });
  const document = await PDFDocument.create();
  document.setCreationDate(new Date(0));
  document.setModificationDate(new Date(0));
  try {
    for (let index = 0; index < source.getPageCount(); index++) {
      const sourcePage = source.getPage(index);
      const crop = sourcePage.getCropBox();
      const rotated = sourcePage.getRotation().angle % 180 !== 0;
      const width = rotated ? crop.height : crop.width;
      const height = rotated ? crop.width : crop.height;
      const screenshot = await parser.getScreenshot({
        partial: [index + 1],
        scale: Math.min(1200 / width, 1600 / height),
        imageDataUrl: false,
        imageBuffer: true,
      });
      const image = await document.embedPng(screenshot.pages[0].data);
      document.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
    }
  } finally {
    await parser.destroy();
  }
  const result = Buffer.from(await document.save());
  if (result.length > MAX_PDF_BYTES) {
    throw new Error('Scanned PDF exceeds the 5 MiB limit; use a smaller template or text mode');
  }
  return result;
}
