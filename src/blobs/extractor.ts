import { getEnvBool } from '../envars';
import logger from '../logger';
import { BLOB_MAX_SIZE, BLOB_MIN_SIZE } from './constants';
import { type BlobRef, recordBlobReference, storeBlob } from './index';

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

  // Store blobs locally (like videos). Media files are not uploaded to cloud.
  const { ref } = await storeBlob(parsed.buffer, parsed.mimeType || 'application/octet-stream', {
    ...context,
    location,
    kind,
  });
  return ref;
}

async function externalizeDataUrls(
  value: unknown,
  context: BlobContext,
  location: string,
): Promise<{ value: unknown; mutated: boolean }> {
  if (typeof value === 'string') {
    if (!isDataUrl(value)) {
      return { value, mutated: false };
    }
    const parsed = extractBase64(value);
    if (!parsed || !shouldExternalize(parsed.buffer)) {
      return { value, mutated: false };
    }
    const storedRef =
      (await maybeStore(
        parsed.buffer.toString('base64'),
        parsed.mimeType,
        context,
        location,
        getKindFromMimeType(parsed.mimeType),
      )) || null;
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
          context,
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
        context,
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

  // Audio at top level
  if (response.audio?.data && typeof response.audio.data === 'string') {
    const stored = await maybeStore(
      response.audio.data,
      normalizeAudioMimeType(response.audio.format),
      blobContext,
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

  // Turns audio (multi-turn)

  // biome-ignore lint/suspicious/noExplicitAny: FIXME: This is not correct and needs to be addressed
  const turns = (response as any).turns;
  if (Array.isArray(turns)) {
    const updatedTurns = await Promise.all(
      turns.map(async (turn, idx) => {
        if (turn?.audio?.data && typeof turn.audio.data === 'string') {
          const stored = await maybeStore(
            turn.audio.data,
            normalizeAudioMimeType(turn.audio.format),
            blobContext,
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
      const stored = await maybeStore(
        parsed.buffer.toString('base64'),
        parsed.mimeType,
        blobContext,
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
            const stored = await maybeStore(
              item.b64_json,
              'image/png',
              blobContext,
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

  if (response.metadata) {
    const { value, mutated: metadataMutated } = await externalizeDataUrls(
      response.metadata,
      blobContext,
      'response.metadata',
    );
    if (metadataMutated) {
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
