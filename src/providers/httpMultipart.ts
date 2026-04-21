import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { z } from 'zod';
import cliState from '../cliState';
import { getNunjucksEngine } from '../util/templates';

const GeneratedDocumentSourceSchema = z.object({
  type: z.literal('generated'),
  generator: z.literal('basic-document').optional().default('basic-document'),
  format: z.enum(['pdf', 'png', 'jpeg', 'jpg']).optional().default('pdf'),
  text: z.string().optional(),
});

const PathFileSourceSchema = z.object({
  type: z.literal('path'),
  path: z.string(),
});

const MultipartFieldPartSchema = z.object({
  kind: z.literal('field'),
  name: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const MultipartFilePartSchema = z.object({
  kind: z.literal('file'),
  name: z.string(),
  filename: z.string().optional(),
  filenameTemplate: z.string().optional(),
  contentType: z.string().optional(),
  source: z.union([GeneratedDocumentSourceSchema, PathFileSourceSchema]),
});

export const HttpMultipartConfigSchema = z.object({
  parts: z.array(z.union([MultipartFieldPartSchema, MultipartFilePartSchema])).min(1),
});

export type HttpMultipartConfig = z.infer<typeof HttpMultipartConfigSchema>;

export interface MultipartFileDescriptor {
  field: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  source: 'generated' | 'path';
}

export interface MultipartFieldDescriptor {
  field: string;
  value: string;
}

export interface RenderedHttpMultipartBody {
  body: FormData;
  fields: MultipartFieldDescriptor[];
  files: MultipartFileDescriptor[];
}

function renderTemplate(value: string, vars: Record<string, unknown>): string {
  return getNunjucksEngine().renderString(value, vars);
}

function getMimeTypeForGeneratedFormat(
  format: z.infer<typeof GeneratedDocumentSourceSchema>['format'],
) {
  switch (format) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'pdf':
    default:
      return 'application/pdf';
  }
}

function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function createBasicPdf(text: string): Buffer {
  const displayText = escapePdfText(text.replace(/\s+/g, ' ').trim().slice(0, 800));
  const content = `BT
/F1 16 Tf
72 720 Td
(${displayText}) Tj
ET`;

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += object;
  }

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
}

function createGeneratedImage(format: 'png' | 'jpeg' | 'jpg'): Buffer {
  if (format === 'png') {
    // 1x1 transparent PNG.
    return Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
      'base64',
    );
  }

  // 1x1 white JPEG.
  return Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z',
    'base64',
  );
}

function createGeneratedFile(
  source: z.infer<typeof GeneratedDocumentSourceSchema>,
  vars: Record<string, unknown>,
): { buffer: Buffer; contentType: string; extension: string } {
  const format = source.format || 'pdf';
  const contentType = getMimeTypeForGeneratedFormat(format);
  const text = renderTemplate(
    source.text || 'Promptfoo generated document for multipart HTTP target testing.',
    vars,
  );

  if (format === 'pdf') {
    return { buffer: createBasicPdf(text), contentType, extension: 'pdf' };
  }

  return {
    buffer: createGeneratedImage(format),
    contentType,
    extension: format === 'jpg' ? 'jpg' : format,
  };
}

function normalizeFilePath(filePath: string): string {
  if (!filePath.startsWith('file://')) {
    return filePath;
  }

  try {
    return fileURLToPath(filePath);
  } catch {
    // Preserve promptfoo's long-standing shorthand: file://relative/path.ext
    return filePath.slice('file://'.length);
  }
}

function resolvePath(filePath: string): string {
  const withoutFileScheme = normalizeFilePath(filePath);
  if (path.isAbsolute(withoutFileScheme)) {
    return withoutFileScheme;
  }
  return path.resolve(cliState.basePath || process.cwd(), withoutFileScheme);
}

function getContentTypeFromFilename(filename: string): string {
  switch (path.extname(filename).toLowerCase()) {
    case '.pdf':
      return 'application/pdf';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.bmp':
      return 'image/bmp';
    case '.tif':
    case '.tiff':
      return 'image/tiff';
    case '.webp':
      return 'image/webp';
    case '.txt':
      return 'text/plain';
    case '.json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}

async function loadFilePart(
  source: z.infer<typeof PathFileSourceSchema>,
  vars: Record<string, unknown>,
  abortSignal?: AbortSignal,
): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
  const resolvedPath = resolvePath(renderTemplate(source.path, vars));
  const buffer = await fs.readFile(resolvedPath, { signal: abortSignal });
  return {
    buffer,
    filename: path.basename(resolvedPath),
    contentType: getContentTypeFromFilename(resolvedPath),
  };
}

export async function renderHttpMultipartBody(
  config: HttpMultipartConfig,
  vars: Record<string, unknown>,
  abortSignal?: AbortSignal,
): Promise<RenderedHttpMultipartBody> {
  const formData = new FormData();
  const fields: MultipartFieldDescriptor[] = [];
  const files: MultipartFileDescriptor[] = [];

  for (const part of config.parts) {
    abortSignal?.throwIfAborted();
    const field = renderTemplate(part.name, vars);

    if (part.kind === 'field') {
      const value = renderTemplate(String(part.value), vars);
      formData.append(field, value);
      fields.push({ field, value });
      continue;
    }

    let loaded: { buffer: Buffer; contentType: string };
    let defaultFilename: string;

    if (part.source.type === 'path') {
      const file = await loadFilePart(part.source, vars, abortSignal);
      loaded = file;
      defaultFilename = file.filename;
    } else {
      const generated = createGeneratedFile(part.source, vars);
      loaded = generated;
      defaultFilename = `promptfoo-document.${generated.extension}`;
    }

    const filenameTemplate = part.filenameTemplate || part.filename || defaultFilename;
    const filename = renderTemplate(filenameTemplate, vars);
    const contentType = part.contentType || loaded.contentType;
    const blob = new Blob([loaded.buffer as unknown as BlobPart], { type: contentType });

    formData.append(field, blob, filename);
    files.push({
      field,
      filename,
      contentType,
      sizeBytes: loaded.buffer.length,
      source: part.source.type,
    });
  }

  return { body: formData, fields, files };
}
