import { getBlobByHash } from '../blobs';
import logger from '../logger';

const BLOB_URI_PREFIX = 'promptfoo://blob/';
const BLOB_URI_REGEX = /promptfoo:\/\/blob\/([a-f0-9]{64})/gi;
const BLOB_HASH_REGEX = /^[a-f0-9]{64}$/i;
const MAX_DEPTH = 8;
const MAX_STRING_LENGTH_TO_SCAN = 100_000;

type BlobPayload = {
  base64: string;
  dataUrl: string;
  mimeType: string;
};

export type BlobInlineCache = Map<string, BlobPayload | null>;

function normalizeHash(hash: string): string {
  return hash.toLowerCase();
}

function shouldScanString(value: string): boolean {
  if (value.startsWith(BLOB_URI_PREFIX)) {
    return true;
  }
  return value.length <= MAX_STRING_LENGTH_TO_SCAN;
}

function extractHashesFromString(value: string): string[] {
  if (!shouldScanString(value) || !value.includes(BLOB_URI_PREFIX)) {
    return [];
  }

  const hashes: string[] = [];
  for (const match of value.matchAll(BLOB_URI_REGEX)) {
    if (match[1]) {
      hashes.push(normalizeHash(match[1]));
    }
  }
  return hashes;
}

function extractHashFromBlobRef(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as { uri?: string; hash?: string; mimeType?: string };
  if (candidate.uri && typeof candidate.uri === 'string') {
    const match = candidate.uri.match(BLOB_URI_REGEX);
    return match?.[1] ? normalizeHash(match[1]) : null;
  }

  if (
    candidate.hash &&
    typeof candidate.hash === 'string' &&
    BLOB_HASH_REGEX.test(candidate.hash) &&
    typeof candidate.mimeType === 'string'
  ) {
    return normalizeHash(candidate.hash);
  }

  return null;
}

function collectBlobHashes(
  value: unknown,
  hashes: Set<string>,
  visited: WeakSet<object>,
  depth: number,
): void {
  if (depth > MAX_DEPTH) {
    return;
  }

  if (typeof value === 'string') {
    for (const hash of extractHashesFromString(value)) {
      hashes.add(hash);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const child of value) {
      collectBlobHashes(child, hashes, visited, depth + 1);
    }
    return;
  }

  if (value && typeof value === 'object') {
    if (visited.has(value)) {
      return;
    }
    visited.add(value);

    const blobHash = extractHashFromBlobRef(value);
    if (blobHash) {
      hashes.add(blobHash);
      return;
    }

    for (const child of Object.values(value as Record<string, unknown>)) {
      collectBlobHashes(child, hashes, visited, depth + 1);
    }
  }
}

async function ensureBlobPayloads(hashes: Set<string>, cache: BlobInlineCache): Promise<void> {
  const missing = Array.from(hashes).filter((hash) => !cache.has(hash));
  if (missing.length === 0) {
    return;
  }

  await Promise.all(
    missing.map(async (hash) => {
      try {
        const blob = await getBlobByHash(hash);
        const base64 = blob.data.toString('base64');
        const mimeType = blob.metadata.mimeType || 'application/octet-stream';
        cache.set(hash, {
          base64,
          mimeType,
          dataUrl: `data:${mimeType};base64,${base64}`,
        });
      } catch (error) {
        logger.warn('[Share] Failed to inline blob reference', { error, hash });
        cache.set(hash, null);
      }
    }),
  );
}

function replaceBlobUris(value: string, cache: BlobInlineCache): string {
  if (!shouldScanString(value) || !value.includes(BLOB_URI_PREFIX)) {
    return value;
  }

  return value.replace(BLOB_URI_REGEX, (match, hash) => {
    const payload = cache.get(normalizeHash(hash));
    return payload ? payload.dataUrl : match;
  });
}

async function inlineValue(
  value: unknown,
  cache: BlobInlineCache,
  visited: WeakSet<object>,
  depth: number,
): Promise<unknown> {
  if (depth > MAX_DEPTH) {
    return value;
  }

  if (typeof value === 'string') {
    return replaceBlobUris(value, cache);
  }

  if (Array.isArray(value)) {
    return Promise.all(value.map((child) => inlineValue(child, cache, visited, depth + 1)));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (visited.has(value)) {
    return value;
  }
  visited.add(value);

  const next: Record<string, unknown> = { ...(value as Record<string, unknown>) };

  if ('blobRef' in next) {
    const blobHash = extractHashFromBlobRef(next.blobRef);
    if (blobHash) {
      const payload = cache.get(blobHash);
      if (payload) {
        delete next.blobRef;
        if (next.data == null) {
          next.data = payload.base64;
        }
        if (!next.format && payload.mimeType.includes('/')) {
          next.format = payload.mimeType.split('/')[1];
        }
      }
    }
  }

  for (const [key, child] of Object.entries(next)) {
    next[key] = await inlineValue(child, cache, visited, depth + 1);
  }

  return next;
}

export function createBlobInlineCache(): BlobInlineCache {
  return new Map();
}

export async function inlineBlobRefsForShare<T>(value: T, cache: BlobInlineCache): Promise<T> {
  const hashes = new Set<string>();
  collectBlobHashes(value, hashes, new WeakSet(), 0);
  await ensureBlobPayloads(hashes, cache);
  return (await inlineValue(value, cache, new WeakSet(), 0)) as T;
}
