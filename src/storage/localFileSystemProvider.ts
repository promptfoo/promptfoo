/**
 * Local filesystem storage provider for media files.
 *
 * Stores media in the local promptfoo data directory (~/.promptfoo/media).
 * Uses content-based hashing for deduplication.
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { pathToFileURL } from 'url';

import { FilesystemBlobStorageProvider } from '../blobs/filesystemProvider';
import logger from '../logger';
import { getConfigDirectoryPath } from '../util/config/manage';
import { sha256 } from '../util/createHash';

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
 * Local filesystem storage provider
 */
export class LocalFileSystemProvider implements MediaStorageProvider {
  readonly providerId = 'local';
  private basePath: string;
  private readonly realBasePath: string;
  private readonly hashIndex: ReadonlyMap<string, string>;
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
    this.ensureDirectory();
    // Match fsPromises.realpath when resolving root aliases, including Windows short names.
    this.realBasePath = fs.realpathSync.native(this.basePath);
    this.hashIndex = this.loadHashIndex();
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
   * Load legacy lookup entries without rewriting the index. New writes use blob paths.
   */
  private loadHashIndex(): ReadonlyMap<string, string> {
    const indexPath = path.join(this.basePath, HASH_INDEX_FILE);
    try {
      if (fs.existsSync(indexPath)) {
        const data = fs.readFileSync(indexPath, 'utf8');
        const parsed = JSON.parse(data);
        const index = new Map<string, string>(Object.entries(parsed));
        logger.debug(`[LocalStorage] Loaded hash index with ${index.size} entries`);
        return index;
      }
    } catch (error) {
      logger.warn(`[LocalStorage] Failed to load hash index, starting fresh`, { error });
    }
    return new Map();
  }

  /**
   * Resolve a legacy key without following symlinks below the configured root.
   */
  private async getFilePath(key: string): Promise<string> {
    // Prevent directory traversal and ensure all paths are under the base path
    const targetPath = path.resolve(this.basePath, key);
    // Ensure basePath has trailing separator for strict prefix check
    const safeBase = path.resolve(this.basePath) + path.sep;
    if (!targetPath.startsWith(safeBase)) {
      throw new Error(
        `[LocalStorage] Invalid media key: path traversal attempt detected ("${key}")`,
      );
    }
    const relativePath = path.relative(path.resolve(this.basePath), targetPath);
    const filePath = path.join(this.realBasePath, relativePath);
    let currentPath = this.realBasePath;
    for (const component of ['', ...relativePath.split(path.sep)]) {
      currentPath = path.join(currentPath, component);
      try {
        const stat = await fsPromises.lstat(currentPath);
        if (
          stat.isSymbolicLink() ||
          path.relative(await fsPromises.realpath(currentPath), currentPath) !== ''
        ) {
          throw new Error(`[LocalStorage] Invalid media key: symbolic links are not allowed`);
        }
      } catch (error) {
        // Deleting missing media remains a no-op; every existing ancestor was checked.
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          break;
        }
        throw error;
      }
    }
    return filePath;
  }

  async store(data: Buffer, metadata: MediaMetadata): Promise<StoreResult> {
    // Compute SHA-256 hash of data.
    const contentHash = sha256(data);

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
    try {
      const filePath = await this.getFilePath(key);
      const file = await fsPromises.open(
        filePath,
        fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
      );
      try {
        return await file.readFile();
      } finally {
        await file.close();
      }
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
      const filePath = await this.getFilePath(key);
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
    const filePath = await this.getFilePath(key);
    const metadataPath = await this.getFilePath(`${key}.meta.json`);

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
        : await this.getFilePath(key);
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
    const hashIndexPath = path.join(this.basePath, HASH_INDEX_FILE);

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
        if (entry.name.endsWith('.meta.json') || fullPath === hashIndexPath) {
          continue;
        }
        if (entry.isDirectory()) {
          // Blob writers reserve hash-prefixed directories for unpublished staging files.
          if (fullPath.startsWith(blobBase) && /^[a-f0-9]{64}\./i.test(entry.name)) {
            continue;
          }
          await walkDir(fullPath);
          continue;
        }
        try {
          const stat = await fsPromises.lstat(fullPath);
          if (!stat.isFile()) {
            continue;
          }
          fileCount++;
          totalSizeBytes += stat.size;
        } catch (error) {
          // File may have been deleted between readdir and stat
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
          }
        }
      }
    };

    await walkDir(this.basePath);
    return { fileCount, totalSizeBytes };
  }
}
