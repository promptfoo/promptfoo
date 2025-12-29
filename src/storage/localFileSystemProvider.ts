/**
 * Local filesystem storage provider for media files.
 *
 * Stores media in the local promptfoo data directory (~/.promptfoo/media).
 * Uses content-based hashing for deduplication.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

import logger from '../logger';
import { getConfigDirectoryPath } from '../util/config/manage';

import type {
  LocalStorageConfig,
  MediaMetadata,
  MediaStorageProvider,
  MediaStorageRef,
  StoreResult,
} from './types';

const MEDIA_SUBDIR = 'media';
const HASH_INDEX_FILE = 'hash-index.json';

/**
 * Get file extension from content type
 */
function getExtensionFromContentType(contentType: string): string {
  const typeMap: Record<string, string> = {
    'audio/wav': 'wav',
    'audio/mp3': 'mp3',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/ogg': 'ogv',
  };
  return typeMap[contentType] || 'bin';
}

/**
 * Compute SHA-256 hash of data
 */
function computeHash(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Local filesystem storage provider
 */
export class LocalFileSystemProvider implements MediaStorageProvider {
  readonly providerId = 'local';
  private basePath: string;
  private hashIndexPath: string;
  private hashIndex: Map<string, string> = new Map();

  constructor(config: LocalStorageConfig = {}) {
    this.basePath = config.basePath || path.join(getConfigDirectoryPath(true), MEDIA_SUBDIR);
    this.hashIndexPath = path.join(this.basePath, HASH_INDEX_FILE);
    this.ensureDirectory();
    this.loadHashIndex();
  }

  /**
   * Ensure the media directory exists
   */
  private ensureDirectory(): void {
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
      logger.debug(`[LocalStorage] Created media directory: ${this.basePath}`);
    }
  }

  /**
   * Load the hash index from disk
   */
  private loadHashIndex(): void {
    try {
      if (fs.existsSync(this.hashIndexPath)) {
        const data = fs.readFileSync(this.hashIndexPath, 'utf8');
        const parsed = JSON.parse(data);
        this.hashIndex = new Map(Object.entries(parsed));
        logger.debug(`[LocalStorage] Loaded hash index with ${this.hashIndex.size} entries`);
      }
    } catch (error) {
      logger.warn(`[LocalStorage] Failed to load hash index, starting fresh`, { error });
      this.hashIndex = new Map();
    }
  }

  /**
   * Save the hash index to disk
   */
  private async saveHashIndex(): Promise<void> {
    try {
      const data = JSON.stringify(Object.fromEntries(this.hashIndex), null, 2);
      await fsPromises.writeFile(this.hashIndexPath, data, 'utf8');
    } catch (error) {
      logger.warn(`[LocalStorage] Failed to save hash index`, { error });
    }
  }

  /**
   * Get the full path for a storage key
   */
  private getFilePath(key: string): string {
    // Prevent directory traversal and ensure all paths are under the base path
    const targetPath = path.resolve(this.basePath, key);
    // Ensure basePath has trailing separator for strict prefix check
    const safeBase = path.resolve(this.basePath) + path.sep;
    if (!targetPath.startsWith(safeBase)) {
      throw new Error(
        `[LocalStorage] Invalid media key: path traversal attempt detected ("${key}")`,
      );
    }
    return targetPath;
  }

  /**
   * Generate a storage key from hash and metadata
   */
  private generateKey(hash: string, metadata: MediaMetadata): string {
    const extension = getExtensionFromContentType(metadata.contentType);
    const prefix = metadata.mediaType || 'media';
    // Use first 12 chars of hash for shorter filenames while maintaining uniqueness
    return `${prefix}/${hash.slice(0, 12)}.${extension}`;
  }

  async store(data: Buffer, metadata: MediaMetadata): Promise<StoreResult> {
    const contentHash = computeHash(data);

    // Check for existing file with same hash (deduplication)
    const existingKey = await this.findByHash(contentHash);
    if (existingKey) {
      logger.debug(`[LocalStorage] Deduplicated media: ${existingKey}`);
      return {
        ref: {
          provider: this.providerId,
          key: existingKey,
          contentHash,
          metadata,
        },
        deduplicated: true,
      };
    }

    // Generate new key and store
    const key = this.generateKey(contentHash, metadata);
    const filePath = this.getFilePath(key);

    // Ensure subdirectory exists
    const dir = path.dirname(filePath);
    await fsPromises.mkdir(dir, { recursive: true });

    // Write file
    await fsPromises.writeFile(filePath, data);

    // Update hash index
    this.hashIndex.set(contentHash, key);
    await this.saveHashIndex();

    // Write metadata alongside
    const metadataPath = `${filePath}.meta.json`;
    await fsPromises.writeFile(
      metadataPath,
      JSON.stringify(
        {
          ...metadata,
          contentHash,
          sizeBytes: data.length,
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    logger.debug(`[LocalStorage] Stored media: ${key} (${data.length} bytes)`);

    const ref: MediaStorageRef = {
      provider: this.providerId,
      key,
      contentHash,
      metadata: {
        ...metadata,
        sizeBytes: data.length,
        contentHash,
      },
    };

    return { ref, deduplicated: false };
  }

  async retrieve(key: string): Promise<Buffer> {
    const filePath = this.getFilePath(key);

    try {
      return await fsPromises.readFile(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`[LocalStorage] Media not found: ${key}`);
      }
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(key);
      await fsPromises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    const metadataPath = `${filePath}.meta.json`;

    // Find and remove from hash index
    for (const [hash, storedKey] of this.hashIndex.entries()) {
      if (storedKey === key) {
        this.hashIndex.delete(hash);
        break;
      }
    }
    await this.saveHashIndex();

    // Delete files (ignore ENOENT errors)
    try {
      await fsPromises.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    try {
      await fsPromises.unlink(metadataPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    logger.debug(`[LocalStorage] Deleted media: ${key}`);
  }

  async getUrl(key: string, _expiresIn?: number): Promise<string | null> {
    // For local storage, return a file:// URL or null
    // The web UI will need to handle this via the API
    try {
      const filePath = this.getFilePath(key);
      await fsPromises.access(filePath);
      return `file://${filePath}`;
    } catch {
      return null;
    }
  }

  async findByHash(contentHash: string): Promise<string | null> {
    const key = this.hashIndex.get(contentHash);
    if (key && (await this.exists(key))) {
      return key;
    }
    // Clean up stale index entry if file doesn't exist
    if (key) {
      this.hashIndex.delete(contentHash);
      await this.saveHashIndex();
    }
    return null;
  }

  /**
   * Get the base path for this provider
   */
  getBasePath(): string {
    return this.basePath;
  }

  /**
   * Get stats about stored media
   */
  async getStats(): Promise<{ fileCount: number; totalSizeBytes: number }> {
    let fileCount = 0;
    let totalSizeBytes = 0;

    const walkDir = async (dir: string): Promise<void> => {
      let entries: fs.Dirent[];
      try {
        entries = await fsPromises.readdir(dir, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return;
        }
        throw error;
      }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else if (!entry.name.endsWith('.json')) {
          // Skip metadata files
          try {
            const stat = await fsPromises.stat(fullPath);
            fileCount++;
            totalSizeBytes += stat.size;
          } catch (error) {
            // File may have been deleted between readdir and stat
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
              throw error;
            }
          }
        }
      }
    };

    await walkDir(this.basePath);
    return { fileCount, totalSizeBytes };
  }
}
