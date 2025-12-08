/**
 * Local filesystem storage provider for media files.
 *
 * Stores media in the local promptfoo data directory (~/.promptfoo/media).
 * Uses content-based hashing for deduplication.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
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
  private saveHashIndex(): void {
    try {
      const data = JSON.stringify(Object.fromEntries(this.hashIndex), null, 2);
      fs.writeFileSync(this.hashIndexPath, data, 'utf8');
    } catch (error) {
      logger.warn(`[LocalStorage] Failed to save hash index`, { error });
    }
  }

  /**
   * Get the full path for a storage key
   */
  private getFilePath(key: string): string {
    return path.join(this.basePath, key);
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
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write file
    fs.writeFileSync(filePath, data);

    // Update hash index
    this.hashIndex.set(contentHash, key);
    this.saveHashIndex();

    // Write metadata alongside
    const metadataPath = `${filePath}.meta.json`;
    fs.writeFileSync(
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

    if (!fs.existsSync(filePath)) {
      throw new Error(`[LocalStorage] Media not found: ${key}`);
    }

    return fs.readFileSync(filePath);
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.getFilePath(key);
    return fs.existsSync(filePath);
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
    this.saveHashIndex();

    // Delete files
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    if (fs.existsSync(metadataPath)) {
      fs.unlinkSync(metadataPath);
    }

    logger.debug(`[LocalStorage] Deleted media: ${key}`);
  }

  async getUrl(key: string, _expiresIn?: number): Promise<string | null> {
    // For local storage, return a file:// URL or null
    // The web UI will need to handle this via the API
    const filePath = this.getFilePath(key);
    if (fs.existsSync(filePath)) {
      return `file://${filePath}`;
    }
    return null;
  }

  async findByHash(contentHash: string): Promise<string | null> {
    const key = this.hashIndex.get(contentHash);
    if (key && (await this.exists(key))) {
      return key;
    }
    // Clean up stale index entry if file doesn't exist
    if (key) {
      this.hashIndex.delete(contentHash);
      this.saveHashIndex();
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
  getStats(): { fileCount: number; totalSizeBytes: number } {
    let fileCount = 0;
    let totalSizeBytes = 0;

    const walkDir = (dir: string): void => {
      if (!fs.existsSync(dir)) {
        return;
      }
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (!entry.name.endsWith('.json')) {
          // Skip metadata files
          fileCount++;
          totalSizeBytes += fs.statSync(fullPath).size;
        }
      }
    };

    walkDir(this.basePath);
    return { fileCount, totalSizeBytes };
  }
}

