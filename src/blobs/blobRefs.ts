import { BLOB_SCHEME } from './constants';

export const BLOB_HASH_REGEX = /^[a-f0-9]{64}$/i;
export const BLOB_URI_REGEX = /promptfoo:\/\/blob\/([a-f0-9]{64})/gi;

interface CollectBlobHashesOptions {
  maxDepth?: number;
  maxStringLength?: number;
}

export function normalizeBlobHash(hash: string): string {
  return hash.toLowerCase();
}

function shouldScanString(value: string, maxStringLength?: number): boolean {
  if (!value.includes(BLOB_SCHEME)) {
    return false;
  }
  return (
    maxStringLength === undefined ||
    value.startsWith(BLOB_SCHEME) ||
    value.length <= maxStringLength
  );
}

export function extractBlobHashesFromString(value: string, maxStringLength?: number): string[] {
  if (!shouldScanString(value, maxStringLength)) {
    return [];
  }

  return Array.from(value.matchAll(BLOB_URI_REGEX), (match) => normalizeBlobHash(match[1]));
}

export function extractBlobHashesFromValue(value: unknown, maxStringLength?: number): string[] {
  if (typeof value === 'string') {
    return extractBlobHashesFromString(value, maxStringLength);
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const candidate = value as { hash?: unknown; uri?: unknown };
  if (typeof candidate.hash === 'string' && BLOB_HASH_REGEX.test(candidate.hash)) {
    return [normalizeBlobHash(candidate.hash)];
  }
  if (typeof candidate.uri === 'string') {
    return extractBlobHashesFromString(candidate.uri, maxStringLength);
  }

  return [];
}

export function collectBlobHashes(
  value: unknown,
  options: CollectBlobHashesOptions = {},
  hashes = new Set<string>(),
  visited = new WeakSet<object>(),
  depth = 0,
): Set<string> {
  if (options.maxDepth !== undefined && depth > options.maxDepth) {
    return hashes;
  }

  for (const hash of extractBlobHashesFromValue(value, options.maxStringLength)) {
    hashes.add(hash);
  }

  if (typeof value === 'string' || !value || typeof value !== 'object') {
    return hashes;
  }

  if (visited.has(value)) {
    return hashes;
  }
  visited.add(value);

  const children = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  for (const child of children) {
    collectBlobHashes(child, options, hashes, visited, depth + 1);
  }

  return hashes;
}
