import { BLOB_MAX_SIZE, BLOB_MIN_SIZE } from './constants';
import { storeBlob, type BlobRef } from './index';
import { getEnvBool } from '../envars';
import logger from '../logger';
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

function shouldExternalize(buffer: Buffer): boolean {
  const size = buffer.length;
  return size >= BLOB_MIN_SIZE && size <= BLOB_MAX_SIZE;
}

function getKindFromMimeType(mimeType: string): BlobKind {
  return mimeType.startsWith('audio/') ? 'audio' : 'image';
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
    const { ref } = await storeBlob(parsed.buffer, parsed.mimeType, {
      ...context,
      location,
      kind: getKindFromMimeType(parsed.mimeType),
    });
    return { value: ref.uri, mutated: true };
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
  if (!isBlobStorageEnabled() || !response) {
    return response;
  }

  let mutated = false;
  const next: ProviderResponse = { ...response };
  const blobContext = context || {};

  // Audio at top level
  if (response.audio?.data && typeof response.audio.data === 'string') {
    const stored = await maybeStore(
      response.audio.data,
      response.audio.format || 'audio/wav',
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
  if (Array.isArray(response.turns)) {
    const updatedTurns = await Promise.all(
      response.turns.map(async (turn, idx) => {
        if (turn?.audio?.data && typeof turn.audio.data === 'string') {
          const stored = await maybeStore(
            turn.audio.data,
            turn.audio.format || 'audio/wav',
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
    next.turns = updatedTurns;
  }

  // Output data URL (images/audio) inside string
  if (typeof response.output === 'string' && isDataUrl(response.output)) {
    const parsed = extractBase64(response.output);
    if (parsed && shouldExternalize(parsed.buffer)) {
      const stored = await storeBlob(parsed.buffer, parsed.mimeType, {
        ...blobContext,
        location: 'response.output',
        kind: getKindFromMimeType(parsed.mimeType),
      });
      next.output = stored.ref.uri;
      mutated = true;
      logger.debug('[BlobExtractor] Stored output blob', { ...context, hash: stored.ref.hash });
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

  return mutated ? next : response;
}

export function isBlobStorageEnabled(): boolean {
  return getEnvBool('PROMPTFOO_BLOB_STORAGE_ENABLED', false);
}
