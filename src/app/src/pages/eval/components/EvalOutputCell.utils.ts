import { normalizeMediaText, resolveImageSource } from '@app/utils/media';
import type { ImageOutput } from '@promptfoo/types';

function getImageDataUriComparisonKey(src: string): string | undefined {
  const trimmed = src.trim();
  if (!trimmed.toLowerCase().startsWith('data:')) {
    return undefined;
  }

  const commaIndex = trimmed.indexOf(',');
  if (commaIndex === -1) {
    return undefined;
  }

  const metadata = trimmed.slice('data:'.length, commaIndex);
  const payload = trimmed.slice(commaIndex + 1);
  const [mimeType = '', ...params] = metadata.split(';').filter(Boolean);
  const normalizedMimeType = mimeType.toLowerCase();
  const hasBase64Param = params.some((param) => param.toLowerCase() === 'base64');

  if (
    hasBase64Param &&
    (normalizedMimeType.startsWith('image/') || normalizedMimeType === 'application/octet-stream')
  ) {
    return `data:image-content;base64,${payload.replace(/\s+/g, '')}`;
  }

  return undefined;
}

export function normalizeImageSrcForComparison(src: string): string {
  const normalized = normalizeMediaText(src.trim());
  return resolveImageSource(normalized) || normalized;
}

function getImageSrcComparisonKeys(src: string): string[] {
  const normalized = normalizeImageSrcForComparison(src);
  const dataUriKey = getImageDataUriComparisonKey(normalized);
  return dataUriKey && dataUriKey !== normalized ? [normalized, dataUriKey] : [normalized];
}

export function addImageSrcComparisonKeys(keys: Set<string>, src: string) {
  for (const key of getImageSrcComparisonKeys(src)) {
    keys.add(key);
  }
}

export function hasImageSrcComparisonKey(keys: Set<string>, src: string): boolean {
  return getImageSrcComparisonKeys(src).some((key) => keys.has(key));
}

export function extractMarkdownImageSources(markdown: string): string[] {
  const sources = new Set<string>();
  const markdownImageRegex = /!\[[^\]]*]\((<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\)/g;

  for (const match of markdown.matchAll(markdownImageRegex)) {
    const candidate = match[1]?.trim();
    if (!candidate) {
      continue;
    }
    const unwrapped =
      candidate.startsWith('<') && candidate.endsWith('>') ? candidate.slice(1, -1) : candidate;
    sources.add(normalizeImageSrcForComparison(unwrapped));
  }

  return [...sources];
}

export function resolveEvalImageOutputSource(image: ImageOutput): string | undefined {
  if (typeof image.data === 'string' && /^https?:\/\//.test(image.data)) {
    return image.data;
  }

  return resolveImageSource(image);
}
