/**
 * Shared utilities for video generation providers (OpenAI Sora, Azure Sora, Google Veo).
 *
 * This module provides common functionality for video caching, output formatting,
 * and storage operations used across different video generation providers.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import logger from '../../logger';
import { getMediaStorage, storeMedia } from '../../storage';
import { getConfigDirectoryPath } from '../../util/config/manage';
import { ellipsize } from '../../util/text';

import type { MediaMetadata, MediaStorageRef } from '../../storage/types';

// =============================================================================
// Constants
// =============================================================================

const MEDIA_DIR = 'media';
const CACHE_DIR = 'video/_cache';

/** Default polling interval for video generation jobs (10 seconds) */
export const DEFAULT_POLL_INTERVAL_MS = 10000;

/** Default maximum polling time for video generation jobs (10 minutes) */
export const DEFAULT_MAX_POLL_TIME_MS = 600000;

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
  const cacheDir = path.join(basePath, CACHE_DIR);
  // Ensure directory exists
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return path.join(cacheDir, `${cacheKey}.json`);
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
  inputReference?: string | null;
}): string {
  const hashInput = JSON.stringify({
    provider: params.provider,
    prompt: params.prompt,
    model: params.model,
    size: params.size,
    seconds: params.seconds,
    inputReference: params.inputReference || null,
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

  if (!fs.existsSync(mappingPath)) {
    return null;
  }

  try {
    const mappingData = fs.readFileSync(mappingPath, 'utf8');
    const mapping: VideoCacheMapping = JSON.parse(mappingData);
    // Verify the referenced video file still exists in storage
    if (mapping.videoKey) {
      const storage = getMediaStorage();
      if (await storage.exists(mapping.videoKey)) {
        return mapping.videoKey;
      }
    }
  } catch (err: unknown) {
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
export function readCacheMapping(cacheKey: string): VideoCacheMapping | null {
  const mappingPath = getCacheMappingPath(cacheKey);

  if (!fs.existsSync(mappingPath)) {
    return null;
  }

  try {
    const mappingData = fs.readFileSync(mappingPath, 'utf8');
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
export function storeCacheMapping(
  cacheKey: string,
  videoKey: string,
  thumbnailKey?: string,
  spritesheetKey?: string,
  providerName: string = 'Video',
): void {
  const mapping: VideoCacheMapping = {
    videoKey,
    thumbnailKey,
    spritesheetKey,
    createdAt: new Date().toISOString(),
  };

  const mappingPath = getCacheMappingPath(cacheKey);
  fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2), 'utf8');
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
