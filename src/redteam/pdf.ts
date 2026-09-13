import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

import { PDFDocument, StandardFonts } from 'pdf-lib';
import { getDirectory } from '../esm';

export const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_PDF_TEXT_CHARS = 50_000;
const MAX_PAGES = 10;
const PAGE_SIZE: [number, number] = [612, 792];
const MARGIN = 48;
const FONT_SIZE = 11;
const LINE_HEIGHT = 16;

function validatePdfBytes(bytes: Uint8Array): void {
  if (bytes.length > MAX_PDF_BYTES || Buffer.from(bytes.subarray(0, 5)).toString() !== '%PDF-') {
    throw new Error('PDF must be a valid PDF file no larger than 5 MiB');
  }
}

async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  validatePdfBytes(bytes);
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

async function processPdf<T>(bytes: Uint8Array, operation: 'inspect' | 'scan'): Promise<T> {
  validatePdfBytes(bytes);
  const require = createRequire(path.join(getDirectory(), 'package.json'));
  let parserPath: string;
  try {
    parserPath = require.resolve('pdf-parse');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
      throw new Error('PDF strategy requires pdf-parse. Install it with: npm install pdf-parse');
    }
    throw error;
  }
  // Isolate PDF parsing and rendering from the CLI's heap and event loop. A process
  // also lets us override inherited Node memory flags, unlike worker resourceLimits.
  // Fixed source and dependency paths avoid a separate asset in bundled builds.
  const child = spawn(
    process.execPath,
    [
      '--max-old-space-size=256',
      '--max-semi-space-size=16',
      '--input-type=commonjs',
      '--eval',
      `async function processPdf() {
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      const { PDFDocument } = require(process.argv[1]);
      const document = await PDFDocument.load(bytes, { updateMetadata: false });
      const pages = document.getPages();
      if (pages.length < 1 || pages.length > 10) {
        throw new Error('PDF must contain between 1 and 10 pages');
      }
      for (const page of pages) {
        for (const { width, height } of [page.getSize(), page.getCropBox()]) {
          if (!Number.isFinite(width) || !Number.isFinite(height) ||
              width < 72 || height < 72 || width > 1440 || height > 1440) {
            throw new Error('PDF pages must be between 1 and 20 inches in each dimension');
          }
        }
      }
      const { PDFParse } = require(process.argv[2]);
      const parser = new PDFParse({ data: new Uint8Array(bytes), isEvalSupported: false });
      try {
        if (process.argv[3] === 'scan') {
          const scanned = await PDFDocument.create();
          scanned.setCreationDate(new Date(0));
          scanned.setModificationDate(new Date(0));
          for (let index = 0; index < pages.length; index++) {
            const page = pages[index];
            const crop = page.getCropBox();
            const rotated = page.getRotation().angle % 180 !== 0;
            const width = rotated ? crop.height : crop.width;
            const height = rotated ? crop.width : crop.height;
            const screenshot = await parser.getScreenshot({
              partial: [index + 1], scale: Math.min(1200 / width, 1600 / height),
              imageDataUrl: false, imageBuffer: true,
            });
            const image = await scanned.embedPng(screenshot.pages[0].data);
            scanned.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
          }
          const output = Buffer.from(await scanned.save());
          if (output.length > ${MAX_PDF_BYTES}) {
            throw new Error('Scanned PDF exceeds the 5 MiB limit; use a smaller template or text mode');
          }
          return output.toString('base64');
        }
        const result = await parser.getText();
        const text = result.pages.map((page) => page.text).join('\\n\\n');
        if (text.length > 50000) {
          throw new Error('PDF extracted text exceeds the 50,000-character limit');
        }
        return { text, pageCount: pages.length };
      } finally {
        await parser.destroy();
      }
    }
    processPdf().then(
      (result) => process.send({ result }),
      (error) => process.send({ error: error.message }),
    );`,
      require.resolve('pdf-lib'),
      parserPath,
      operation,
    ],
    {
      env: { ...process.env, NODE_OPTIONS: '' },
      stdio: ['pipe', 'ignore', 'ignore', 'ipc'],
      windowsHide: true,
    },
  );
  const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
  let timer: NodeJS.Timeout | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('PDF processing exceeded the 15-second limit')),
        15_000,
      );
      child.once('message', (message: { error?: string; result: T }) => {
        if (message.error) {
          reject(new Error(message.error));
        } else {
          resolve(message.result);
        }
      });
      child.once('error', reject);
      child.once('exit', (code, signal) =>
        reject(
          new Error(
            `PDF subprocess exited (${signal ?? code}); document may exceed parser memory limits`,
          ),
        ),
      );
      child.stdin!.on('error', reject);
      child.stdin!.end(bytes);
    });
  } finally {
    clearTimeout(timer);
    child.kill('SIGKILL');
    await closed;
  }
}

export async function inspectPdf(bytes: Uint8Array): Promise<{ text: string; pageCount: number }> {
  return processPdf(bytes, 'inspect');
}

/** Rasterize every page, including the template, so no extractable text remains. */
export async function scanPdf(bytes: Uint8Array): Promise<Buffer> {
  return Buffer.from(await processPdf<string>(bytes, 'scan'), 'base64');
}
