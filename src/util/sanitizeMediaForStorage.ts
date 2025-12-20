/**
 * Sanitizes eval results by replacing large base64 media data with storage references.
 *
 * This prevents database bloat by storing media files separately and only
 * keeping lightweight references in the database.
 */

import logger from '../logger';
import { isMediaStorageEnabled, storeMedia } from '../storage';

import type { AtomicTestCase, ProviderResponse } from '../types';

/** Prefix for storage references */
const STORAGE_REF_PREFIX = 'storageRef:';

/** Minimum size (bytes) to consider for externalization - 10KB */
const MIN_SIZE_FOR_EXTERNALIZATION = 10 * 1024;

/**
 * Check if a string looks like base64 encoded audio/image data
 */
function isLikelyBase64Media(value: string): boolean {
  if (typeof value !== 'string' || value.length < MIN_SIZE_FOR_EXTERNALIZATION) {
    return false;
  }

  // Check for data URL prefix
  if (value.startsWith('data:audio/') || value.startsWith('data:image/')) {
    return true;
  }

  // Check if it looks like raw base64 (no whitespace, valid chars, reasonable length)
  const base64Pattern = /^[A-Za-z0-9+/]+=*$/;
  const sample = value.slice(0, 1000).replace(/\s/g, '');
  return base64Pattern.test(sample) && value.length > MIN_SIZE_FOR_EXTERNALIZATION;
}

/**
 * Extract format from data URL or guess from context
 */
function getMediaFormat(
  value: string,
  hint?: 'audio' | 'image',
): { format: string; mimeType: string } {
  // Check data URL
  const dataUrlMatch = value.match(/^data:(audio|image)\/([^;,]+)/);
  if (dataUrlMatch) {
    const type = dataUrlMatch[1] as 'audio' | 'image';
    const subtype = dataUrlMatch[2];
    return {
      format: subtype,
      mimeType: `${type}/${subtype}`,
    };
  }

  // Use hint or default
  if (hint === 'audio') {
    return { format: 'mp3', mimeType: 'audio/mp3' };
  }
  return { format: 'png', mimeType: 'image/png' };
}

/**
 * Extract raw base64 data from a value (handles data URLs)
 */
function extractBase64Data(value: string): string {
  const dataUrlMatch = value.match(/^data:[^;]+;base64,(.+)$/);
  if (dataUrlMatch) {
    return dataUrlMatch[1];
  }
  return value;
}

/**
 * Create a storage reference string
 */
export function createStorageRef(key: string): string {
  return `${STORAGE_REF_PREFIX}${key}`;
}

/**
 * Check if a value is a storage reference
 */
export function isStorageRef(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(STORAGE_REF_PREFIX);
}

/**
 * Parse a storage reference to get the key
 */
export function parseStorageRef(ref: string): string | null {
  if (!isStorageRef(ref)) {
    return null;
  }
  return ref.slice(STORAGE_REF_PREFIX.length);
}

/**
 * Sanitize a test case by replacing base64 media vars with storage refs.
 *
 * Uses metadata set by strategies to know exactly which var contains media:
 * - audioStorageKey + audioInjectVar → replace vars[audioInjectVar]
 * - imageStorageKey + imageInjectVar → replace vars[imageInjectVar]
 */
export async function sanitizeTestCaseForStorage(
  testCase: AtomicTestCase,
): Promise<AtomicTestCase> {
  if (!isMediaStorageEnabled()) {
    logger.debug('[SanitizeMedia] Media storage disabled, skipping sanitization');
    return testCase;
  }

  if (!testCase.vars) {
    logger.debug('[SanitizeMedia] No vars in test case, skipping');
    return testCase;
  }

  const metadata = testCase.metadata || {};

  // Get storage keys and var names from metadata (set by strategies)
  const audioStorageKey = metadata.audioStorageKey as string | undefined;
  const audioInjectVar = metadata.audioInjectVar as string | undefined;
  const imageStorageKey = metadata.imageStorageKey as string | undefined;
  const imageInjectVar = metadata.imageInjectVar as string | undefined;

  // If no storage keys, nothing to do
  if (!audioStorageKey && !imageStorageKey) {
    return testCase;
  }

  const sanitizedVars = { ...testCase.vars };
  let modified = false;

  // Replace audio var with storage ref
  if (audioStorageKey && audioInjectVar && sanitizedVars[audioInjectVar] !== undefined) {
    logger.info(
      `[SanitizeMedia] Replacing var '${audioInjectVar}' with audio ref: ${audioStorageKey}`,
    );
    sanitizedVars[audioInjectVar] = createStorageRef(audioStorageKey);
    modified = true;
  }

  // Replace image var with storage ref
  if (imageStorageKey && imageInjectVar && sanitizedVars[imageInjectVar] !== undefined) {
    logger.info(
      `[SanitizeMedia] Replacing var '${imageInjectVar}' with image ref: ${imageStorageKey}`,
    );
    sanitizedVars[imageInjectVar] = createStorageRef(imageStorageKey);
    modified = true;
  }

  if (!modified) {
    return testCase;
  }

  return {
    ...testCase,
    vars: sanitizedVars,
  };
}

/**
 * Store base64 audio data and return storage ref
 */
async function storeBase64Audio(audioData: string, evalId?: string): Promise<string | null> {
  if (!isLikelyBase64Media(audioData)) {
    return null;
  }

  try {
    const { mimeType } = getMediaFormat(audioData, 'audio');
    const rawBase64 = extractBase64Data(audioData);
    const buffer = Buffer.from(rawBase64, 'base64');

    const { ref } = await storeMedia(buffer, {
      contentType: mimeType,
      mediaType: 'audio',
      evalId,
    });

    logger.debug(`[SanitizeMedia] Stored audio to ${ref.key} (${buffer.length} bytes)`);
    return createStorageRef(ref.key);
  } catch (error) {
    logger.warn(`[SanitizeMedia] Failed to externalize audio, keeping inline`, { error });
    return null;
  }
}

/**
 * Sanitize redteam history entries (Hydra multi-turn attack history)
 * These contain promptAudio.data with base64 audio
 */
async function sanitizeRedteamHistory(
  history: Array<{
    prompt?: string;
    promptAudio?: { data?: string; format?: string };
    [key: string]: unknown;
  }>,
  evalId?: string,
): Promise<{ history: typeof history; modified: boolean }> {
  let modified = false;
  const sanitizedHistory = await Promise.all(
    history.map(async (entry) => {
      if (entry.promptAudio?.data && typeof entry.promptAudio.data === 'string') {
        const storageRef = await storeBase64Audio(entry.promptAudio.data, evalId);
        if (storageRef) {
          modified = true;
          return {
            ...entry,
            promptAudio: {
              ...entry.promptAudio,
              data: storageRef,
            },
          };
        }
      }
      return entry;
    }),
  );

  return { history: sanitizedHistory, modified };
}

/**
 * Sanitize a provider response by replacing audio/image data with storage refs
 */
export async function sanitizeResponseForStorage(
  response: ProviderResponse | null | undefined,
  evalId?: string,
): Promise<ProviderResponse | null | undefined> {
  if (!response || !isMediaStorageEnabled()) {
    return response;
  }

  let modified = false;
  const sanitized = { ...response };

  // Handle response.audio.data
  if (response.audio?.data && typeof response.audio.data === 'string') {
    const storageRef = await storeBase64Audio(response.audio.data, evalId);
    if (storageRef) {
      sanitized.audio = {
        ...response.audio,
        data: storageRef,
      };
      modified = true;
    }
  }

  // Handle response.metadata.redteamHistory[].promptAudio.data (Hydra multi-turn attacks)
  const metadata = response.metadata as Record<string, unknown> | undefined;
  if (metadata?.redteamHistory && Array.isArray(metadata.redteamHistory)) {
    const { history, modified: historyModified } = await sanitizeRedteamHistory(
      metadata.redteamHistory,
      evalId,
    );
    if (historyModified) {
      sanitized.metadata = {
        ...metadata,
        redteamHistory: history,
      };
      modified = true;
    }
  }

  return modified ? sanitized : response;
}

/**
 * Sanitize an entire eval result for storage
 */
export async function sanitizeResultForStorage<
  T extends {
    testCase: AtomicTestCase;
    response?: ProviderResponse | null;
    evalId?: string;
  },
>(result: T): Promise<T> {
  if (!isMediaStorageEnabled()) {
    return result;
  }

  const [sanitizedTestCase, sanitizedResponse] = await Promise.all([
    sanitizeTestCaseForStorage(result.testCase),
    sanitizeResponseForStorage(result.response, result.evalId),
  ]);

  // Only create new object if something changed
  if (sanitizedTestCase === result.testCase && sanitizedResponse === result.response) {
    return result;
  }

  return {
    ...result,
    testCase: sanitizedTestCase,
    response: sanitizedResponse,
  };
}
