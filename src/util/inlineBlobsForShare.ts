import { getShareAuthorizedBlob } from '../blobs';
import {
  BLOB_SCAN_MAX_DEPTH,
  BLOB_SCAN_MAX_STRING_LENGTH,
  BLOB_URI_REGEX,
  collectBlobHashes,
  extractBlobHashesFromValue,
  normalizeBlobHash,
} from '../blobs/blobRefs';
import { BLOB_SCHEME } from '../blobs/constants';
import logger from '../logger';

const MAX_DEPTH = BLOB_SCAN_MAX_DEPTH;
const MAX_STRING_LENGTH_TO_SCAN = BLOB_SCAN_MAX_STRING_LENGTH;

type BlobPayload = {
  base64: string;
  dataUrl: string;
  mimeType: string;
};

export type BlobInlineCache = Map<string, BlobPayload | null>;

function shouldScanString(value: string): boolean {
  if (value.startsWith(BLOB_SCHEME)) {
    return true;
  }
  return value.length <= MAX_STRING_LENGTH_TO_SCAN;
}

function extractHashFromBlobRef(value: unknown): string | null {
  return extractBlobHashesFromValue(value, MAX_STRING_LENGTH_TO_SCAN)[0] ?? null;
}

async function ensureBlobPayloads(
  hashes: Set<string>,
  cache: BlobInlineCache,
  localEvalId: string,
): Promise<void> {
  const missing = Array.from(hashes).filter((hash) => !cache.has(hash));
  if (missing.length === 0) {
    return;
  }

  await Promise.all(
    missing.map(async (hash) => {
      try {
        // Result text may contain copied blob URIs; only refs with trusted provenance
        // for this eval authorize reading local bytes (same gate as the upload path).
        const blob = await getShareAuthorizedBlob(hash, localEvalId);
        if (!blob) {
          cache.set(hash, null);
          return;
        }

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
  if (!shouldScanString(value) || !value.includes(BLOB_SCHEME)) {
    return value;
  }

  return value.replace(BLOB_URI_REGEX, (match, hash) => {
    const payload = cache.get(normalizeBlobHash(hash));
    return payload ? payload.dataUrl : match;
  });
}

async function inlineValue(
  value: unknown,
  cache: BlobInlineCache,
  memo: WeakMap<object, unknown>,
  depth: number,
): Promise<unknown> {
  if (depth > MAX_DEPTH) {
    return value;
  }

  if (typeof value === 'string') {
    return replaceBlobUris(value, cache);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const existing = memo.get(value);
  if (existing !== undefined) {
    return existing;
  }

  if (Array.isArray(value)) {
    const next: unknown[] = new Array(value.length);
    memo.set(value, next);
    await Promise.all(
      value.map(async (child, index) => {
        next[index] = await inlineValue(child, cache, memo, depth + 1);
      }),
    );
    return next;
  }

  const next: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  memo.set(value, next);

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
    next[key] = await inlineValue(child, cache, memo, depth + 1);
  }

  return next;
}

export function createBlobInlineCache(): BlobInlineCache {
  return new Map();
}

export async function inlineBlobRefsForShare<T>(
  value: T,
  cache: BlobInlineCache,
  localEvalId: string,
): Promise<T> {
  const hashes = collectBlobHashes(value, {
    maxDepth: MAX_DEPTH,
    maxStringLength: MAX_STRING_LENGTH_TO_SCAN,
  });
  await ensureBlobPayloads(hashes, cache, localEvalId);
  return (await inlineValue(value, cache, new WeakMap(), 0)) as T;
}
