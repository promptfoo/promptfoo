import { normalizeMediaText, resolveImageSource } from '@app/utils/media';
import { fromMarkdown } from 'mdast-util-from-markdown';
import type { ImageOutput } from '@promptfoo/types';
import type { Nodes } from 'mdast';

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

function visitMarkdownNodes(node: Nodes, visitor: (node: Nodes) => void): void {
  visitor(node);
  if ('children' in node) {
    for (const child of node.children) {
      visitMarkdownNodes(child, visitor);
    }
  }
}

export function extractMarkdownImageSources(markdown: string): string[] {
  if (!markdown.includes('![')) {
    return [];
  }

  const sources = new Set<string>();
  const definitions = new Map<string, string>();
  const candidates: Array<string | { identifier: string }> = [];

  visitMarkdownNodes(fromMarkdown(markdown), (node) => {
    if (node.type === 'definition') {
      definitions.set(node.identifier, node.url);
    } else if (node.type === 'image') {
      candidates.push(node.url);
    } else if (node.type === 'imageReference') {
      candidates.push({ identifier: node.identifier });
    }
  });

  for (const candidate of candidates) {
    const source =
      typeof candidate === 'string' ? candidate : definitions.get(candidate.identifier);
    if (source) {
      sources.add(normalizeImageSrcForComparison(source));
    }
  }

  return [...sources];
}

export function resolveEvalImageOutputSource(image: ImageOutput): string | undefined {
  if (typeof image.data === 'string' && /^https?:\/\//.test(image.data)) {
    return image.data;
  }

  return resolveImageSource(image);
}
