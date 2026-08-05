/**
 * Shared utilities for video generation providers (OpenAI Sora, Azure Sora, Google Veo).
 *
 * This module provides common functionality for video caching, output formatting,
 * and storage operations used across different video generation providers.
 */
import crypto from 'crypto';
import fsPromises from 'fs/promises';
import path from 'path';

import logger from '../../logger';
import { getMediaStorage, storeMedia } from '../../storage';
import { getConfigDirectoryPath } from '../../util/config/manage';
import { isSecretField, looksLikeSecret, REDACTED, sanitizeUrl } from '../../util/sanitizer';
import { ellipsize } from '../../util/text';

import type { MediaMetadata, MediaStorageRef } from '../../storage/types';

// =============================================================================
// Constants
// =============================================================================

const MEDIA_DIR = 'media';
const CACHE_DIR = 'video/_cache';
const SIGNED_URL_CREDENTIAL_PARAM_NAME =
  /^(?:x-amz-|x-goog-|awsaccesskeyid$|googleaccessid$|expires$|sig(?:nature)?$|policy$|key-pair-id$|key$|auth$|credential$|jwt$|st$|se$|sp$|sv$|sr$|si$|ss$|srt$|spr$|sip$|ses$|sdd$|saoid$|suoid$|scid$|skoid$|sktid$|skt$|ske$|sks$|skv$|rscc$|rscd$|rsce$|rscl$|rsct$)/i;
const CACHE_CREDENTIAL_PATH_SEGMENT =
  /^(?:(?:token|key|secret|credential|auth|bearer|basic)[-_. ][a-z0-9._~-]{8,}|sk-(?:proj-|ant-)?[a-z0-9_-]{20,}|key-[a-z0-9]{20,}|AKIA[A-Z0-9]{16}|AIza[a-zA-Z0-9_-]{35}|eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)$/i;

/** Default polling interval for video generation jobs (10 seconds) */
export const DEFAULT_POLL_INTERVAL_MS = 10000;

/** Default maximum polling time for video generation jobs (10 minutes) */
export const DEFAULT_MAX_POLL_TIME_MS = 600000;

function isCredentialLikeVideoUrlValue(value: string): boolean {
  return looksLikeSecret(value) || CACHE_CREDENTIAL_PATH_SEGMENT.test(value);
}

function scrubVideoUrlParams(params: URLSearchParams, removeCredentials: boolean): void {
  for (const key of Array.from(params.keys())) {
    const values = params.getAll(key);
    const containsCredentialValue = values.some(
      (value) => value === REDACTED || isCredentialLikeVideoUrlValue(value),
    );
    if (
      isSecretField(key) ||
      SIGNED_URL_CREDENTIAL_PARAM_NAME.test(key) ||
      containsCredentialValue
    ) {
      if (removeCredentials) {
        params.delete(key);
      } else {
        params.set(key, REDACTED);
      }
    }
  }
}

function getDecodedVideoUrlFragment(hash: string): string {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

function isCredentialLikeVideoUrlFragment(fragment: string): boolean {
  const segments = fragment.split('/').filter(Boolean);
  return (
    isCredentialLikeVideoUrlValue(fragment) ||
    segments.some(isCredentialLikeVideoUrlValue) ||
    (segments.length > 1 && isSecretField(segments[0]))
  );
}

function hasVideoUrlCredentialParams(params: URLSearchParams): boolean {
  for (const [key, value] of params.entries()) {
    if (
      isSecretField(key) ||
      SIGNED_URL_CREDENTIAL_PARAM_NAME.test(key) ||
      value === REDACTED ||
      isCredentialLikeVideoUrlValue(value)
    ) {
      return true;
    }
  }
  return false;
}

function scrubVideoReferenceUrl(
  reference: string,
  removeCredentials: boolean,
  scrubCredentialPathSegments = false,
): string {
  const safeReference = sanitizeUrl(reference);
  try {
    const safeUrl = new URL(safeReference);
    if (scrubCredentialPathSegments) {
      safeUrl.pathname = safeUrl.pathname
        .split('/')
        .map((segment) => {
          try {
            return CACHE_CREDENTIAL_PATH_SEGMENT.test(decodeURIComponent(segment))
              ? '%5BREDACTED%5D'
              : segment;
          } catch {
            return segment;
          }
        })
        .join('/');
    }
    scrubVideoUrlParams(safeUrl.searchParams, removeCredentials);
    if (!removeCredentials) {
      safeUrl.searchParams.sort();
    }

    const decodedFragment = getDecodedVideoUrlFragment(safeUrl.hash);
    if (safeUrl.hash.includes('=') || decodedFragment.includes('=')) {
      const fragmentParams = new URLSearchParams(
        safeUrl.hash.includes('=') ? safeUrl.hash.slice(1) : decodedFragment,
      );
      scrubVideoUrlParams(fragmentParams, removeCredentials);
      if (!removeCredentials) {
        fragmentParams.sort();
      }
      const fragment = fragmentParams.toString();
      safeUrl.hash = fragment ? `#${fragment}` : '';
    } else if (isCredentialLikeVideoUrlFragment(decodedFragment)) {
      safeUrl.hash = removeCredentials ? '' : `#${encodeURIComponent(REDACTED)}`;
    }
    return safeUrl.toString();
  } catch {
    return safeReference;
  }
}

/**
 * Remove replayable credentials from a video URI before persisting it in provider metadata.
 * The resource path and benign query parameters are preserved.
 */
export function sanitizeVideoSourceUri(uri: string): string {
  return scrubVideoReferenceUrl(uri, true);
}

/**
 * Canonicalize a video input URL for cache identity without retaining replayable credentials.
 * Credential parameter names remain as stable markers so equivalent signed resources deduplicate.
 */
export function sanitizeVideoCacheReferenceUrl(reference: string): string {
  return scrubVideoReferenceUrl(reference, false, true);
}

/**
 * Whether a URL can safely participate in a persistent video cache key.
 *
 * Credential-bearing URLs are intentionally excluded instead of canonicalized:
 * hashing the raw URL retains secret-derived material, while redacting it can make
 * distinct authenticated resources collide on the same persistent cache entry.
 */
export function isVideoCacheReferenceUrlSafe(reference: string): boolean {
  const sanitizedReference = sanitizeUrl(reference);
  if (
    sanitizedReference === REDACTED ||
    sanitizedReference.includes(REDACTED) ||
    /%5Bredacted%5D/i.test(sanitizedReference)
  ) {
    return false;
  }

  try {
    const referenceUrl = new URL(reference);
    if (referenceUrl.username || referenceUrl.password) {
      return false;
    }

    if (hasVideoUrlCredentialParams(referenceUrl.searchParams)) {
      return false;
    }

    const decodedFragment = getDecodedVideoUrlFragment(referenceUrl.hash);
    if (referenceUrl.hash.includes('=') || decodedFragment.includes('=')) {
      const fragmentParams = new URLSearchParams(
        referenceUrl.hash.includes('=') ? referenceUrl.hash.slice(1) : decodedFragment,
      );
      if (hasVideoUrlCredentialParams(fragmentParams)) {
        return false;
      }
    } else if (isCredentialLikeVideoUrlFragment(decodedFragment)) {
      return false;
    }

    return !referenceUrl.pathname.split('/').some((segment) => {
      try {
        return CACHE_CREDENTIAL_PATH_SEGMENT.test(decodeURIComponent(segment));
      } catch {
        return false;
      }
    });
  } catch {
    // A malformed or relative reference cannot be partitioned safely without
    // risking secret-derived cache material, so leave it to provider validation.
    return false;
  }
}

// =============================================================================
// Cache Utilities
// =============================================================================

/**
 * Get the file path for a cache mapping file.
 * Cache mappings are stored directly on filesystem (not through media storage)
 * to avoid content-based key generation.
 */
export function getCacheMappingPath(cacheKey: string): string {
  const basePath = path.join(getConfigDirectoryPath(true), MEDIA_DIR);
  return path.join(basePath, CACHE_DIR, `${cacheKey}.json`);
}

/**
 * Generate a deterministic content hash from video generation parameters.
 * Used for cache key lookup and deduplication.
 *
 * @param params - Parameters to include in the hash
 * @returns A hex hash string (12 characters) for content addressing
 */
export function generateVideoCacheKey(params: {
  provider: string;
  prompt: string;
  model: string;
  size: string;
  seconds: number;
  inputReference?: string | { file_id: string } | { image_url: string } | null;
  characters?: Array<{ id: string }>;
  cacheScope?: Record<string, string>;
}): string {
  const rawReference =
    typeof params.inputReference === 'string'
      ? params.inputReference
      : params.inputReference && 'image_url' in params.inputReference
        ? params.inputReference.image_url
        : undefined;
  let inputReference: typeof params.inputReference = rawReference || params.inputReference || null;

  if (rawReference && /^https?:\/\//i.test(rawReference)) {
    inputReference = sanitizeVideoCacheReferenceUrl(rawReference);
  }

  const hashInput = JSON.stringify({
    provider: params.provider,
    prompt: params.prompt,
    model: params.model,
    size: params.size,
    seconds: params.seconds,
    inputReference,
    ...(params.characters?.length ? { characters: params.characters } : {}),
    ...(params.cacheScope && Object.keys(params.cacheScope).length > 0
      ? { cacheScope: params.cacheScope }
      : {}),
  });

  return crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 12);
}

/**
 * Cache mapping data structure stored to filesystem.
 */
export interface VideoCacheMapping {
  videoKey: string;
  thumbnailKey?: string;
  spritesheetKey?: string;
  createdAt: string;
}

/**
 * Check if a cached video exists for the given cache key.
 * Reads the cache mapping from filesystem and verifies the video still exists.
 *
 * @param cacheKey - The cache key to look up
 * @param providerName - Provider name for logging (e.g., 'OpenAI Video', 'Azure Video')
 * @returns The video storage key if cached and exists, null otherwise
 */
export async function checkVideoCache(
  cacheKey: string,
  providerName: string = 'Video',
): Promise<string | null> {
  const mappingPath = getCacheMappingPath(cacheKey);

  try {
    const mappingData = await fsPromises.readFile(mappingPath, 'utf8');
    const mapping: VideoCacheMapping = JSON.parse(mappingData);
    // Verify the referenced video file still exists in storage
    if (mapping.videoKey) {
      const storage = getMediaStorage();
      if (await storage.exists(mapping.videoKey)) {
        return mapping.videoKey;
      }
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    // Mapping file corrupted, treat as cache miss
    logger.debug(`[${providerName}] Cache mapping read failed: ${err}`);
  }

  return null;
}

/**
 * Read the full cache mapping from filesystem.
 *
 * @param cacheKey - The cache key to look up
 * @returns The cache mapping if it exists, null otherwise
 */
export async function readCacheMapping(cacheKey: string): Promise<VideoCacheMapping | null> {
  const mappingPath = getCacheMappingPath(cacheKey);

  try {
    const mappingData = await fsPromises.readFile(mappingPath, 'utf8');
    return JSON.parse(mappingData) as VideoCacheMapping;
  } catch {
    return null;
  }
}

/**
 * Store cache mapping from request hash to storage keys.
 * Written directly to filesystem to maintain predictable path.
 *
 * @param cacheKey - The cache key
 * @param videoKey - The video storage key (required)
 * @param thumbnailKey - Optional thumbnail storage key
 * @param spritesheetKey - Optional spritesheet storage key
 * @param providerName - Provider name for logging
 */
export async function storeCacheMapping(
  cacheKey: string,
  videoKey: string,
  thumbnailKey?: string,
  spritesheetKey?: string,
  providerName: string = 'Video',
): Promise<void> {
  const mapping: VideoCacheMapping = {
    videoKey,
    thumbnailKey,
    spritesheetKey,
    createdAt: new Date().toISOString(),
  };

  const mappingPath = getCacheMappingPath(cacheKey);
  await fsPromises.mkdir(path.dirname(mappingPath), { recursive: true });
  await fsPromises.writeFile(mappingPath, JSON.stringify(mapping, null, 2), 'utf8');
  logger.debug(`[${providerName}] Stored cache mapping at ${mappingPath}`);
}

// =============================================================================
// Output Formatting
// =============================================================================

/**
 * Sanitize a prompt for use in markdown output.
 * Removes newlines and escapes brackets.
 */
export function sanitizePromptForOutput(prompt: string): string {
  return prompt
    .replace(/\r?\n|\r/g, ' ')
    .replace(/\[/g, '(')
    .replace(/\]/g, ')');
}

/**
 * Format video output as markdown link.
 *
 * @param prompt - The original prompt
 * @param videoUrl - The video URL (typically storageRef:...)
 * @param maxLength - Maximum length for ellipsized prompt (default: 50)
 * @returns Markdown formatted output string
 */
export function formatVideoOutput(
  prompt: string,
  videoUrl: string,
  maxLength: number = 50,
): string {
  const sanitizedPrompt = sanitizePromptForOutput(prompt);
  const ellipsizedPrompt = ellipsize(sanitizedPrompt, maxLength);
  return `[Video: ${ellipsizedPrompt}](${videoUrl})`;
}

/**
 * Build a storageRef URL from a storage key.
 */
export function buildStorageRefUrl(storageKey: string): string {
  return `storageRef:${storageKey}`;
}

// =============================================================================
// Storage Utilities
// =============================================================================

/**
 * Download and store video content to media storage.
 *
 * @param buffer - Video content as a Buffer
 * @param metadata - Storage metadata
 * @param providerName - Provider name for logging
 * @returns Storage reference or error
 */
export async function storeVideoContent(
  buffer: Buffer,
  metadata: MediaMetadata,
  providerName: string = 'Video',
): Promise<{ storageRef?: MediaStorageRef; error?: string }> {
  try {
    const { ref } = await storeMedia(buffer, metadata);
    logger.debug(`[${providerName}] Stored video at ${ref.key}`);
    return { storageRef: ref };
  } catch (err: unknown) {
    return {
      error: `Failed to store video: ${String(err)}`,
    };
  }
}

// =============================================================================
// Validation Utilities
// =============================================================================

/**
 * Validation result returned by validation functions.
 */
export interface ValidationResult {
  valid: boolean;
  message?: string;
}

/**
 * Create a validation function for a set of allowed values.
 *
 * @param allowedValues - Array of allowed values
 * @param fieldName - Human-readable field name for error messages
 * @returns A validation function
 */
export function createValidator<T extends string | number>(
  allowedValues: readonly T[],
  fieldName: string,
): (value: T) => ValidationResult {
  return (value: T): ValidationResult => {
    if (!allowedValues.includes(value)) {
      return {
        valid: false,
        message: `Invalid ${fieldName} "${value}". Valid options: ${allowedValues.join(', ')}`,
      };
    }
    return { valid: true };
  };
}
