/**
 * Provider file cache utilities.
 *
 * When a cloud provider has an uploaded custom script (Python/JavaScript),
 * the CLI downloads and caches the file locally by checksum. This allows
 * the file to be used without re-downloading on subsequent runs.
 *
 * Cache location: ~/.promptfoo/provider-files/{checksum}.{ext}
 */
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

import { isCacheEnabled } from '../cache';
import logger from '../logger';
import { getProviderFileFromCloud, type ProviderFileMetadata } from './cloud';
import { getConfigDirectoryPath } from './config/manage';

const PROVIDER_FILES_CACHE_DIR = 'provider-files';
const HEX_PATTERN = /^[0-9a-f]+$/i;
const ALLOWED_EXTENSIONS: Record<string, string> = {
  python: 'py',
  javascript: 'js',
};

/**
 * Gets the provider files cache directory path, creating it if necessary.
 */
function getProviderFilesCacheDir(): string {
  const cacheDir = path.join(getConfigDirectoryPath(true), PROVIDER_FILES_CACHE_DIR);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return cacheDir;
}

/**
 * Gets the file extension for a provider file based on its language.
 * Only allows known safe extensions to prevent path traversal.
 */
function getFileExtension(language: string): string {
  const ext = ALLOWED_EXTENSIONS[language];
  if (!ext) {
    throw new Error(`Unsupported provider file language: ${language}`);
  }
  return ext;
}

/**
 * Validates a checksum string contains only hex characters.
 */
function validateChecksum(checksum: string): string {
  if (!checksum || !HEX_PATTERN.test(checksum)) {
    throw new Error(`Invalid checksum format: expected hex string`);
  }
  return checksum;
}

/**
 * Gets the cached file path for a provider file based on its checksum.
 * Validates inputs to prevent path traversal.
 */
function getCachedFilePath(checksum: string, extension: string): string {
  const safeChecksum = validateChecksum(checksum);
  const filename = `${safeChecksum}.${extension}`;
  return path.join(getProviderFilesCacheDir(), filename);
}

/**
 * Checks if a provider file is already cached locally.
 * @param checksum - The SHA256 checksum of the file
 * @param extension - The file extension (e.g., 'py', 'js')
 * @returns The cached file path if it exists, null otherwise
 */
export function getCachedProviderFile(checksum: string, extension: string): string | null {
  const cachedPath = getCachedFilePath(checksum, extension);
  if (fs.existsSync(cachedPath)) {
    logger.debug(`[ProviderFileCache] Cache hit for ${checksum}.${extension}`);
    return cachedPath;
  }
  logger.debug(`[ProviderFileCache] Cache miss for ${checksum}.${extension}`);
  return null;
}

/**
 * Caches a provider file locally.
 * @param content - The file content to cache
 * @param checksum - The SHA256 checksum of the file
 * @param extension - The file extension (e.g., 'py', 'js')
 * @returns The path to the cached file
 */
export function cacheProviderFile(content: string, checksum: string, extension: string): string {
  const cachedPath = getCachedFilePath(checksum, extension);
  fs.writeFileSync(cachedPath, content, 'utf-8');
  logger.debug(`[ProviderFileCache] Cached file to ${cachedPath}`);
  return cachedPath;
}

/**
 * Gets or downloads a provider file from cloud.
 * If the file is already cached (by checksum), returns the cached path.
 * Otherwise, downloads the file from cloud and caches it.
 *
 * @param providerId - The cloud provider ID
 * @param fileMetadata - Optional metadata if already fetched (contains checksum)
 * @returns The local file path to use for the provider, or null if no file exists
 */
export async function getOrDownloadProviderFile(
  providerId: string,
  fileMetadata?: ProviderFileMetadata | null,
): Promise<string | null> {
  // If we have metadata and cache is enabled, check cache first
  if (fileMetadata && isCacheEnabled()) {
    const extension = getFileExtension(fileMetadata.language);
    const cachedPath = getCachedProviderFile(fileMetadata.checksumSha256, extension);
    if (cachedPath) {
      return cachedPath;
    }
  }

  // Need to download the file content
  logger.debug(`[ProviderFileCache] Downloading provider file for ${providerId}`);
  const fileWithContent = await getProviderFileFromCloud(providerId);

  if (!fileWithContent) {
    logger.debug(`[ProviderFileCache] No file found for provider ${providerId}`);
    return null;
  }

  // Verify content integrity before caching
  const actualChecksum = createHash('sha256').update(fileWithContent.content).digest('hex');
  if (actualChecksum !== fileWithContent.checksumSha256.toLowerCase()) {
    throw new Error(
      `[ProviderFileCache] Checksum mismatch for provider ${providerId}: expected ${fileWithContent.checksumSha256}, got ${actualChecksum}`,
    );
  }

  // Cache the file
  const extension = getFileExtension(fileWithContent.language);
  const cachedPath = cacheProviderFile(
    fileWithContent.content,
    fileWithContent.checksumSha256,
    extension,
  );

  logger.info(
    `[ProviderFileCache] Downloaded and cached ${fileWithContent.filename} for provider ${providerId}`,
  );
  return cachedPath;
}

/**
 * Clears the provider files cache.
 * This can be used to force re-download of all provider files.
 */
export function clearProviderFilesCache(): void {
  const cacheDir = path.join(getConfigDirectoryPath(), PROVIDER_FILES_CACHE_DIR);
  if (fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, { recursive: true });
    logger.info('[ProviderFileCache] Cleared provider files cache');
  }
}
