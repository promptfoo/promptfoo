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
import { pathToFileURL } from 'url';

import { FilesystemBlobStorageProvider } from '../blobs/filesystemProvider';
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
  private blobProvider?: FilesystemBlobStorageProvider;

  private get blobs(): FilesystemBlobStorageProvider {
    return (this.blobProvider ??= new FilesystemBlobStorageProvider({
      basePath: path.join(this.basePath, 'blob-data'),
    }));
  }

  private blobHash(key: string): string {
    const hash = key.slice('blob/'.length);
    this.blobs.getFilePath(hash);
    return hash;
  }

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

  async store(data: Buffer, metadata: MediaMetadata): Promise<StoreResult> {
    const contentHash = computeHash(data);

    // Check for existing file with same hash (deduplication)
    const existingKey = await this.findByHash(contentHash);
    if (existingKey && !existingKey.startsWith('blob/')) {
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

    // Keep the media owner/configuration separate from the global blob registry.
    const mimeType =
      metadata.contentType === 'image/jpg'
        ? 'image/jpeg'
        : metadata.contentType === 'audio/mp3'
          ? 'audio/mpeg'
          : metadata.contentType;
    const result = await this.blobs.store(data, mimeType);
    const key = `blob/${result.ref.hash}`;

    const ref: MediaStorageRef = {
      provider: this.providerId,
      key,
      contentHash,
      metadata: result.deduplicated
        ? metadata
        : { ...metadata, sizeBytes: data.length, contentHash },
    };

    return { ref, deduplicated: result.deduplicated };
  }

  async retrieve(key: string): Promise<Buffer> {
    if (key.startsWith('blob/')) {
      return (await this.blobs.getByHash(this.blobHash(key))).data;
    }
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

  async retrieveWithMetadata(key: string): Promise<{ data: Buffer; contentType?: string }> {
    if (key.startsWith('blob/')) {
      const { data, metadata } = await this.blobs.getByHash(this.blobHash(key));
      return { data, contentType: metadata.mimeType };
    }
    return { data: await this.retrieve(key) };
  }

  async exists(key: string): Promise<boolean> {
    try {
      if (key.startsWith('blob/')) {
        return await this.blobs.exists(this.blobHash(key));
      }
      const filePath = this.getFilePath(key);
      await fsPromises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    if (key.startsWith('blob/')) {
      await this.blobs.deleteByHash(this.blobHash(key));
      return;
    }
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
      // Only remove legacy sidecars, preserving unrelated directories at this path.
      if (!(await fsPromises.lstat(metadataPath)).isDirectory()) {
        await fsPromises.unlink(metadataPath);
      }
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
      const filePath = key.startsWith('blob/')
        ? this.blobs.getFilePath(this.blobHash(key))
        : this.getFilePath(key);
      await fsPromises.access(filePath);
      return pathToFileURL(filePath).href;
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
    return (await this.blobs.exists(contentHash)) ? `blob/${contentHash}` : null;
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
    const blobBase = path.join(this.basePath, 'blob-data') + path.sep;

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
        if (entry.name.endsWith('.meta.json')) {
          continue;
        }
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Blob writers reserve hash-prefixed directories for unpublished staging files.
          if (fullPath.startsWith(blobBase) && /^[a-f0-9]{64}\./i.test(entry.name)) {
            continue;
          }
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
