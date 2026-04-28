import { getEnvBool } from '../envars';
import logger from '../logger';
import { BLOB_MAX_SIZE, BLOB_MIN_SIZE } from './constants';
import { type BlobRef, recordBlobReference, storeBlob } from './index';
import { shouldAttemptRemoteBlobUpload, uploadBlobRemote } from './remoteUpload';

import type { ProviderResponse } from '../types/providers';

interface BlobContext {
  evalId?: string;
  testIdx?: number;
  promptIdx?: number;
}

type BlobKind = 'audio' | 'image';

const BLOB_URI_REGEX = /^promptfoo:\/\/blob\/([a-f0-9]{64})$/i;
const BLOB_HASH_REGEX = /^[a-f0-9]{64}$/i;

function isDataUrl(value: string): boolean {
  return /^data:(audio|image)\/[^;]+;base64,/.test(value);
}

function extractBase64(value: string): { buffer: Buffer; mimeType: string } | null {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }
  const mimeType = match[1];
  try {
    return { buffer: Buffer.from(match[2], 'base64'), mimeType };
  } catch (error) {
    logger.warn('[BlobExtractor] Failed to parse base64 data URL', { error });
    return null;
  }
}

function shouldExternalize(buffer: Buffer): boolean {
  const size = buffer.length;
  return size >= BLOB_MIN_SIZE && size <= BLOB_MAX_SIZE;
}

function getKindFromMimeType(mimeType: string): BlobKind {
  return mimeType.startsWith('audio/') ? 'audio' : 'image';
}

/**
 * Normalize audio format to proper MIME type.
 * Some providers return just 'wav' instead of 'audio/wav'.
 * @internal Exported for testing
 */
export function normalizeAudioMimeType(format: string | undefined): string {
  if (!format) {
    return 'audio/wav';
  }

  const trimmedFormat = format.trim();

  // Already a proper audio MIME type - validate strictly to prevent MIME injection
  // Only allow: audio/subtype where subtype is alphanumeric with optional dash/underscore/plus
  // Periods are NOT allowed to prevent attacks like "audio/wav.html" being interpreted as HTML
  if (/^audio\/[a-z0-9_+-]+$/i.test(trimmedFormat)) {
    return trimmedFormat;
  }

  // Normalize common formats (e.g., "wav", "mp3")
  const formatLower = trimmedFormat.toLowerCase();
  const mimeMap: Record<string, string> = {
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    aac: 'audio/aac',
    m4a: 'audio/mp4',
    webm: 'audio/webm',
  };

  // Check if format is in the known map
  if (mimeMap[formatLower]) {
    return mimeMap[formatLower];
  }

  // Validate format contains only alphanumeric, dash, or underscore
  // Periods are NOT allowed to prevent MIME injection attacks (e.g., "wav.html" -> "audio/wav.html")
  // which browsers could interpret as HTML and execute embedded scripts
  if (!/^[a-z0-9_-]+$/i.test(formatLower)) {
    logger.warn('[BlobExtractor] Invalid audio format, using default', { format });
    return 'audio/wav';
  }

  return `audio/${formatLower}`;
}

function parseBinary(
  base64OrDataUrl: string,
  defaultMimeType: string,
): { buffer: Buffer; mimeType: string } | null {
  if (isDataUrl(base64OrDataUrl)) {
    const parsed = extractBase64(base64OrDataUrl);
    if (!parsed) {
      return null;
    }
    return parsed;
  }

  try {
    return { buffer: Buffer.from(base64OrDataUrl, 'base64'), mimeType: defaultMimeType };
  } catch (error) {
    logger.warn('[BlobExtractor] Failed to parse base64 data', { error });
    return null;
  }
}

async function maybeStore(
  base64OrDataUrl: string,
  defaultMimeType: string,
  context: BlobContext,
  location: string,
  kind: BlobKind,
): Promise<BlobRef | null> {
  const parsed = parseBinary(base64OrDataUrl, defaultMimeType);
  if (!parsed || !shouldExternalize(parsed.buffer)) {
    return null;
  }

  if (!isBlobStorageEnabled()) {
    return null;
  }

  const mimeType = parsed.mimeType || 'application/octet-stream';

  // Always store blobs locally first for local viewing
  const { ref } = await storeBlob(parsed.buffer, mimeType, {
    ...context,
    location,
    kind,
  });

  // Also upload to cloud when authenticated (best-effort, non-blocking)
  // This enables blobs to be viewable after sharing to cloud
  if (shouldAttemptRemoteBlobUpload()) {
    uploadBlobRemote(parsed.buffer, mimeType, {
      evalId: context.evalId,
      testIdx: context.testIdx,
      promptIdx: context.promptIdx,
      location,
      kind,
    }).catch((error) => {
      // Log but don't fail - local storage already succeeded
      logger.debug('[BlobExtractor] Cloud upload failed (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
        hash: ref.hash,
      });
    });
  }

  return ref;
}

/**
 * Per-response store-once function: returns the same `BlobRef` for byte-identical
 * payloads regardless of how the input is encoded (raw base64 vs. `data:` URL) or
 * which field it appeared under, so a single response that mirrors the same
 * audio/image across `output`, `images[]`, `metadata`, and `turns[]` triggers one
 * `storeBlob` write and one cloud upload.
 */
type StoreOnce = (
  base64OrDataUrl: string,
  defaultMimeType: string,
  location: string,
  kind: BlobKind,
) => Promise<BlobRef | null>;

function createStoreOnce(blobContext: BlobContext): StoreOnce {
  const cache = new Map<string, Promise<BlobRef | null>>();
  return async (base64OrDataUrl, defaultMimeType, location, kind) => {
    // Canonicalize the cache key on the parsed bytes (not the raw input string)
    // so a `data:image/png;base64,XYZ` URL and the bare `XYZ` base64 hit the
    // same cache slot when they decode to the same buffer.
    const parsed = parseBinary(base64OrDataUrl, defaultMimeType);
    if (!parsed || !shouldExternalize(parsed.buffer)) {
      return null;
    }

    const cacheKey = `${kind}:${parsed.buffer.toString('base64')}`;
    const existing = cache.get(cacheKey);
    if (existing) {
      return existing;
    }

    const pendingStore = maybeStore(base64OrDataUrl, defaultMimeType, blobContext, location, kind);
    cache.set(cacheKey, pendingStore);

    try {
      const stored = await pendingStore;
      if (!stored) {
        cache.delete(cacheKey);
      }
      return stored;
    } catch (error) {
      cache.delete(cacheKey);
      throw error;
    }
  };
}

async function externalizeDataUrls(
  value: unknown,
  storeOnce: StoreOnce,
  location: string,
): Promise<{ value: unknown; mutated: boolean }> {
  if (typeof value === 'string') {
    if (!isDataUrl(value)) {
      return { value, mutated: false };
    }
    const parsed = extractBase64(value);
    if (!parsed) {
      return { value, mutated: false };
    }
    // Pass the raw data-URL through `storeOnce` so it canonicalizes on the
    // parsed bytes, sharing the per-response cache with `output` / `images[]`
    // / `turns[]` / top-level audio.
    const storedRef = await storeOnce(
      value,
      parsed.mimeType,
      location,
      getKindFromMimeType(parsed.mimeType),
    );
    if (!storedRef) {
      return { value, mutated: false };
    }
    return { value: storedRef.uri, mutated: true };
  }

  if (Array.isArray(value)) {
    let mutated = false;
    const nextValues = await Promise.all(
      value.map(async (item, idx) => {
        const { value: nextValue, mutated: childMutated } = await externalizeDataUrls(
          item,
          storeOnce,
          `${location}[${idx}]`,
        );
        mutated ||= childMutated;
        return nextValue;
      }),
    );
    return mutated ? { value: nextValues, mutated } : { value, mutated: false };
  }

  if (value && typeof value === 'object') {
    let mutated = false;
    const nextObject: Record<string, unknown> = { ...(value as Record<string, unknown>) };

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const { value: nextValue, mutated: childMutated } = await externalizeDataUrls(
        child,
        storeOnce,
        location ? `${location}.${key}` : key,
      );
      if (childMutated) {
        nextObject[key] = nextValue;
        mutated = true;
      }
    }
    return mutated ? { value: nextObject, mutated: true } : { value, mutated: false };
  }

  return { value, mutated: false };
}

async function externalizeMetadataAudio(
  metadata: ProviderResponse['metadata'],
  storeOnce: StoreOnce,
): Promise<{ value: ProviderResponse['metadata']; mutated: boolean }> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { value: metadata, mutated: false };
  }

  const audio = metadata.audio;
  if (!audio || typeof audio !== 'object' || Array.isArray(audio)) {
    return { value: metadata, mutated: false };
  }

  const audioRecord = audio as Record<string, unknown>;
  if (typeof audioRecord.data !== 'string') {
    return { value: metadata, mutated: false };
  }

  // Routing through `storeOnce` (instead of calling `maybeStore` directly) means
  // a metadata-mirrored audio payload reuses the blob written for any other
  // path (`response.audio.data`, `turns[N].audio.data`, etc.) when the bytes
  // match — one store, one cloud upload.
  const stored = await storeOnce(
    audioRecord.data,
    normalizeAudioMimeType(typeof audioRecord.format === 'string' ? audioRecord.format : undefined),
    'response.metadata.audio.data',
    'audio',
  );
  if (!stored) {
    return { value: metadata, mutated: false };
  }

  return {
    value: {
      ...metadata,
      audio: {
        ...audioRecord,
        data: undefined,
        blobRef: stored,
      },
    },
    mutated: true,
  };
}

/**
 * Best-effort extraction of binary data from provider responses.
 * Currently focuses on audio.data fields and data URL outputs.
 */
export async function extractAndStoreBinaryData(
  response: ProviderResponse | null | undefined,
  context?: BlobContext,
): Promise<ProviderResponse | null | undefined> {
  if (!response) {
    return response;
  }

  let mutated = false;
  const next: ProviderResponse = { ...response };
  const blobContext = context || {};
  const storeOnce = createStoreOnce(blobContext);

  // Audio at top level
  if (response.audio?.data && typeof response.audio.data === 'string') {
    const stored = await storeOnce(
      response.audio.data,
      normalizeAudioMimeType(response.audio.format),
      'response.audio.data',
      'audio',
    );
    if (stored) {
      next.audio = {
        ...response.audio,
        data: undefined,
        blobRef: stored,
      };
      mutated = true;
      logger.debug('[BlobExtractor] Stored audio blob', { ...context, hash: stored.hash });
    }
  }

  // Images array
  if (response.images?.length) {
    const externalizedImages = await Promise.all(
      response.images.map(async (img, idx) => {
        if (!img.data || typeof img.data !== 'string' || !isDataUrl(img.data)) {
          return img;
        }
        const stored = await storeOnce(
          img.data,
          img.mimeType || 'image/png',
          `response.images[${idx}].data`,
          'image',
        );
        if (stored) {
          mutated = true;
          logger.debug('[BlobExtractor] Stored image blob', { ...context, hash: stored.hash });
          return { ...img, data: undefined, blobRef: stored };
        }
        return img;
      }),
    );
    next.images = externalizedImages;
  }

  // Turns audio (multi-turn)

  // biome-ignore lint/suspicious/noExplicitAny: FIXME: This is not correct and needs to be addressed
  const turns = (response as any).turns;
  if (Array.isArray(turns)) {
    const updatedTurns = await Promise.all(
      turns.map(async (turn, idx) => {
        if (turn?.audio?.data && typeof turn.audio.data === 'string') {
          const stored = await storeOnce(
            turn.audio.data,
            normalizeAudioMimeType(turn.audio.format),
            `response.turns[${idx}].audio.data`,
            'audio',
          );
          if (stored) {
            mutated = true;
            return {
              ...turn,
              audio: {
                ...turn.audio,
                data: undefined,
                blobRef: stored,
              },
            };
          }
        }
        return turn;
      }),
    );

    // biome-ignore lint/suspicious/noExplicitAny: FIXME: This is not correct and needs to be addressed
    (next as any).turns = updatedTurns;
  }

  // Output data URL (images/audio) inside string
  if (typeof response.output === 'string' && isDataUrl(response.output)) {
    const parsed = extractBase64(response.output);
    if (parsed && shouldExternalize(parsed.buffer)) {
      const stored = await storeOnce(
        response.output,
        parsed.mimeType,
        'response.output',
        getKindFromMimeType(parsed.mimeType),
      );
      if (stored) {
        next.output = stored.uri;
        mutated = true;
        logger.debug('[BlobExtractor] Stored output blob', { ...context, hash: stored.hash });
      }
    }
  }

  // OpenAI (and similar) image responses often arrive as JSON strings with b64_json fields.
  // Try to parse and externalize b64_json when it looks like an image payload.
  if (
    typeof response.output === 'string' &&
    response.output.trim().startsWith('{') &&
    ((response.isBase64 && response.format === 'json') ||
      response.output.includes('"b64_json"') ||
      response.output.includes('b64_json'))
  ) {
    try {
      const parsed = JSON.parse(response.output) as { data?: Array<Record<string, unknown>> };
      if (Array.isArray(parsed.data)) {
        let jsonMutated = false;
        const storedUris: string[] = [];
        for (const item of parsed.data) {
          if (item?.b64_json && typeof item.b64_json === 'string') {
            const stored = await storeOnce(
              item.b64_json,
              'image/png',
              'response.output.data[].b64_json',
              'image',
            );
            if (stored) {
              item.b64_json = stored.uri;
              storedUris.push(stored.uri);
              jsonMutated = true;
              mutated = true;
              logger.debug('[BlobExtractor] Stored image blob from b64_json', {
                ...context,
                hash: stored.hash,
              });
            }
          }
        }
        if (jsonMutated) {
          // Prefer a simple blob ref output so graders/UI don't have to parse JSON
          if (storedUris.length === 1) {
            next.output = storedUris[0];
          } else if (storedUris.length > 1) {
            next.output = JSON.stringify(storedUris);
          } else {
            next.output = JSON.stringify(parsed);
          }
          next.metadata = {
            ...(response.metadata || {}),
            blobUris: storedUris,
            originalFormat: response.format,
          };
        }
      }
    } catch (err) {
      logger.debug('[BlobExtractor] Failed to parse base64 JSON output', {
        error: err instanceof Error ? err.message : String(err),
        location: 'response.output',
      });
    }
  }

  const metadata = next.metadata || response.metadata;
  if (metadata) {
    const { value: audioValue, mutated: audioMetadataMutated } = await externalizeMetadataAudio(
      metadata,
      storeOnce,
    );
    const { value, mutated: dataUrlMetadataMutated } = await externalizeDataUrls(
      audioValue,
      storeOnce,
      'response.metadata',
    );
    if (audioMetadataMutated || dataUrlMetadataMutated) {
      next.metadata = value as ProviderResponse['metadata'];
      mutated = true;
    }
  }

  const finalResponse = mutated ? next : response;
  if (blobContext.evalId) {
    await recordExistingBlobReferences(finalResponse, blobContext, 'response');
  }

  return finalResponse;
}

export function isBlobStorageEnabled(): boolean {
  // Single toggle: default to externalize; opt out with PROMPTFOO_INLINE_MEDIA=true
  return !getEnvBool('PROMPTFOO_INLINE_MEDIA', false);
}

function parseBlobHashFromValue(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    const match = value.match(BLOB_URI_REGEX);
    return match ? match[1] : null;
  }

  if (typeof value === 'object') {
    const candidate = value as { uri?: string; hash?: string };
    if (candidate.hash && BLOB_HASH_REGEX.test(candidate.hash)) {
      return candidate.hash;
    }
    if (candidate.uri && typeof candidate.uri === 'string') {
      const match = candidate.uri.match(BLOB_URI_REGEX);
      if (match) {
        return match[1];
      }
    }
  }

  return null;
}

async function recordExistingBlobReferences(
  value: unknown,
  context: BlobContext,
  location: string,
): Promise<void> {
  const hash = parseBlobHashFromValue(value);
  if (hash) {
    await recordBlobReference(hash, { ...context, location });
    return;
  }

  if (Array.isArray(value)) {
    await Promise.all(
      value.map((child, idx) =>
        recordExistingBlobReferences(child, context, `${location}[${idx}]`),
      ),
    );
    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      await recordExistingBlobReferences(child, context, location ? `${location}.${key}` : key);
    }
  }
}
