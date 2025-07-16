import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getEnvString } from '../envars';
import logger from '../logger';
import { getConfigDirectoryPath } from './config/manage';

export interface StoredAsset {
  id: string;
  path: string;
  url: string;
  mimeType: string;
  originalName?: string;
  createdAt: Date;
  type: 'image' | 'video' | 'audio' | 'document' | 'other';
}

export type AssetType = StoredAsset['type'];

/**
 * Get the directory where assets are stored
 */
export function getAssetsDirectory(): string {
  const cacheDir =
    getEnvString('PROMPTFOO_CACHE_PATH') || path.join(getConfigDirectoryPath(), 'cache');
  const assetsDir = path.join(cacheDir, 'assets');

  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
    logger.debug(`Created assets directory: ${assetsDir}`);
  }

  return assetsDir;
}

/**
 * Get file extension from MIME type
 */
export function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
  };

  return mimeToExt[mimeType] || '.bin';
}

/**
 * Determine asset type from MIME type
 */
export function getAssetType(mimeType: string): AssetType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('application/pdf') || mimeType.startsWith('text/')) return 'document';
  return 'other';
}

/**
 * Save a base64-encoded asset to the file system
 */
export function saveBase64Asset(
  base64Data: string,
  mimeType: string = 'image/png',
  originalName?: string,
): StoredAsset {
  const id = uuidv4();
  const ext = getExtensionFromMimeType(mimeType);
  const filename = `${id}${ext}`;
  const filePath = path.join(getAssetsDirectory(), filename);

  // Remove data URL prefix if present
  const base64Clean = base64Data.replace(/^data:.*?;base64,/, '');
  const buffer = Buffer.from(base64Clean, 'base64');

  fs.writeFileSync(filePath, buffer);
  logger.debug(`Saved asset: ${filePath} (${buffer.length} bytes)`);

  return {
    id,
    path: filePath,
    url: `/assets/${filename}`,
    mimeType,
    originalName,
    createdAt: new Date(),
    type: getAssetType(mimeType),
  };
}

/**
 * Get the full path for an asset by filename
 */
export function getAssetPath(filename: string): string | null {
  const assetPath = path.join(getAssetsDirectory(), filename);
  return fs.existsSync(assetPath) ? assetPath : null;
}

/**
 * Delete an asset by filename
 */
export function deleteAsset(filename: string): boolean {
  const assetPath = getAssetPath(filename);
  if (assetPath) {
    try {
      fs.unlinkSync(assetPath);
      logger.debug(`Deleted asset: ${assetPath}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete asset: ${assetPath}: ${error}`);
      return false;
    }
  }
  return false;
}

/**
 * Clean up old assets based on age
 */
export function cleanupOldAssets(maxAgeMs: number): number {
  const assetsDir = getAssetsDirectory();
  const files = fs.readdirSync(assetsDir);
  const now = Date.now();
  let deletedCount = 0;

  for (const file of files) {
    const filePath = path.join(assetsDir, file);
    try {
      const stats = fs.statSync(filePath);
      const age = now - stats.mtimeMs;

      if (age > maxAgeMs) {
        fs.unlinkSync(filePath);
        deletedCount++;
        logger.debug(
          `Cleaned up old asset: ${file} (age: ${Math.round(age / 1000 / 60 / 60)} hours)`,
        );
      }
    } catch (error) {
      logger.error(`Error cleaning up asset ${file}: ${error}`);
    }
  }

  if (deletedCount > 0) {
    logger.info(`Cleaned up ${deletedCount} old assets`);
  }

  return deletedCount;
}
