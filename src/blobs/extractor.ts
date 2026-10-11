import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { getEnvBool } from '../envars';
import logger from '../logger';
import { sha256 } from '../util/createHash';
import { extractBlobHashesFromValue } from './blobRefs';
import { BLOB_MAX_SIZE, BLOB_MIN_SIZE, BLOB_SCHEME } from './constants';
import { type BlobRef, recordBlobReference, storeBlob } from './index';

import type { ProviderResponse } from '../types/providers';

interface BlobContext {
  evalId?: string;
  testIdx?: number;
  promptIdx?: number;
}

type BlobKind = 'audio' | 'image';

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

function shouldExternalize(buffer: Buffer, minSizeBytes = BLOB_MIN_SIZE): boolean {
  const size = buffer.length;
  return size >= minSizeBytes && size <= BLOB_MAX_SIZE;
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
    return extractBase64(base64OrDataUrl);
  }

  try {
    return { buffer: Buffer.from(base64OrDataUrl, 'base64'), mimeType: defaultMimeType };
  } catch (error) {
    logger.warn('[BlobExtractor] Failed to parse base64 data', { error });
    return null;
  }
}

/** Reuse one write per media kind and decoded payload within a response. */
type StoreOnce = (
  base64OrDataUrl: string,
  defaultMimeType: string,
  location: string,
  kind: BlobKind,
  minSizeBytes?: number,
) => Promise<BlobRef | null>;

function createStoreOnce(blobContext: BlobContext): StoreOnce {
  const cache = new Map<string, Promise<BlobRef>>();
  return async (base64OrDataUrl, defaultMimeType, location, kind, minSizeBytes) => {
    const parsed = parseBinary(base64OrDataUrl, defaultMimeType);
    if (!parsed || !shouldExternalize(parsed.buffer, minSizeBytes)) {
      return null;
    }

    const cacheKey = `${kind}:${sha256(parsed.buffer)}`;
    const existing = cache.get(cacheKey);
    if (existing) {
      return existing;
    }

    if (!isBlobStorageEnabled()) {
      return null;
    }

    // Blob extraction is local-only. Remote synchronization happens when an eval is shared.
    const pendingStore = storeBlob(parsed.buffer, parsed.mimeType || 'application/octet-stream', {
      ...blobContext,
      location,
      kind,
    }).then(({ ref }) => ref);
    cache.set(cacheKey, pendingStore);

    try {
      return await pendingStore;
    } catch (error) {
      cache.delete(cacheKey);
      throw error;
    }
  };
}

function getRawSvgOutputPreview(output: string): { dataUrl: string; uri: string } | null {
  const trimmed = output.trim();
  if (!trimmed.startsWith('<')) {
    return null;
  }

  if (XMLValidator.validate(trimmed) !== true) {
    return null;
  }

  try {
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('svg' in parsed)) {
      return null;
    }
  } catch {
    return null;
  }

  const buffer = Buffer.from(trimmed, 'utf8');
  return {
    dataUrl: `data:image/svg+xml;base64,${buffer.toString('base64')}`,
    uri: `${BLOB_SCHEME}${sha256(buffer)}`,
  };
}

function appendMetadataBlobUri(
  metadata: ProviderResponse['metadata'],
  uri: string,
): ProviderResponse['metadata'] {
  const existingBlobUris = Array.isArray(metadata?.blobUris)
    ? metadata.blobUris.filter((value): value is string => typeof value === 'string')
    : [];

  return {
    ...(metadata || {}),
    blobUris: [...new Set([...existingBlobUris, uri])],
  };
}

async function storeRawSvgOutputPreview(
  output: ProviderResponse['output'],
  metadata: ProviderResponse['metadata'],
  storeOnce: StoreOnce,
  context?: BlobContext,
): Promise<{ metadata: ProviderResponse['metadata']; mutated: boolean }> {
  if (typeof output !== 'string') {
    return { metadata, mutated: false };
  }

  const preview = getRawSvgOutputPreview(output);
  if (!preview) {
    return { metadata, mutated: false };
  }

  const existingBlobUris = Array.isArray(metadata?.blobUris)
    ? metadata.blobUris.filter((value): value is string => typeof value === 'string')
    : [];
  if (existingBlobUris.includes(preview.uri)) {
    return { metadata, mutated: false };
  }

  const stored = await storeOnce(preview.dataUrl, 'image/svg+xml', 'response.output', 'image', 0);
  if (!stored) {
    return { metadata, mutated: false };
  }

  logger.debug('[BlobExtractor] Stored raw SVG output blob', {
    ...context,
    hash: stored.hash,
  });
  return {
    metadata: appendMetadataBlobUri(metadata, stored.uri),
    mutated: true,
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
    const mimeType = value.slice(5, value.indexOf(';'));
    const storedRef = await storeOnce(value, mimeType, location, getKindFromMimeType(mimeType));
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

  // Reuse matching audio blobs already stored elsewhere in the response.
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

  // Raw SVG text is user-visible media even when it is smaller than the
  // generic externalization threshold. Store a preview blob for the media
  // library while preserving the text output for assertions and rendering.
  const rawSvgPreview = await storeRawSvgOutputPreview(
    response.output,
    next.metadata || response.metadata,
    storeOnce,
    context,
  );
  if (rawSvgPreview.mutated) {
    next.metadata = rawSvgPreview.metadata;
    mutated = true;
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
    const mimeType = response.output.slice(5, response.output.indexOf(';'));
    const stored = await storeOnce(
      response.output,
      mimeType,
      'response.output',
      getKindFromMimeType(mimeType),
    );
    if (stored) {
      next.output = stored.uri;
      mutated = true;
      logger.debug('[BlobExtractor] Stored output blob', { ...context, hash: stored.hash });
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

async function recordExistingBlobReferences(
  value: unknown,
  context: BlobContext,
  location: string,
): Promise<void> {
  const hashes = [...new Set(extractBlobHashesFromValue(value))];
  if (hashes.length > 0) {
    await Promise.all(hashes.map((hash) => recordBlobReference(hash, { ...context, location })));
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
