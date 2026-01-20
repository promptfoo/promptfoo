import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';

import logger from '../logger';
import { getConfigDirectoryPath } from '../util/config/manage';
import { BLOB_SCHEME, DEFAULT_FILESYSTEM_SUBDIR } from './constants';

import type {
  BlobMetadata,
  BlobRef,
  BlobStorageProvider,
  BlobStoreResult,
  StoredBlob,
} from './types';

interface FilesystemProviderConfig {
  basePath?: string;
}

const BLOB_HASH_REGEX = /^[a-f0-9]{64}$/i;

function computeHash(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function buildUri(hash: string): string {
  return `${BLOB_SCHEME}${hash}`;
}

export class FilesystemBlobStorageProvider implements BlobStorageProvider {
  readonly providerId = 'filesystem';
  private readonly basePath: string;

  constructor(config?: FilesystemProviderConfig) {
    const defaultBase = path.join(getConfigDirectoryPath(true), DEFAULT_FILESYSTEM_SUBDIR);
    this.basePath = path.resolve(config?.basePath || defaultBase);
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
      logger.debug('[BlobFS] Created blob directory', { basePath: this.basePath });
    }
  }

  private assertValidHash(hash: string): void {
    if (!BLOB_HASH_REGEX.test(hash)) {
      throw new Error(`[BlobFS] Invalid blob hash: "${hash}"`);
    }
  }

  private resolvePathInBase(unsafePath: string): string {
    const targetPath = path.isAbsolute(unsafePath)
      ? path.resolve(unsafePath)
      : path.resolve(this.basePath, unsafePath);

    const safeBase = path.resolve(this.basePath) + path.sep;
    if (!targetPath.startsWith(safeBase)) {
      throw new Error('[BlobFS] Path traversal attempt detected');
    }

    return targetPath;
  }

  private hashToPath(hash: string): string {
    this.assertValidHash(hash);

    const dirRelative = path.join(hash.slice(0, 2), hash.slice(2, 4));
    const fileRelative = path.join(dirRelative, hash);
    return this.resolvePathInBase(fileRelative);
  }

  private async ensureHashDir(hash: string): Promise<void> {
    this.assertValidHash(hash);

    const dirRelative = path.join(hash.slice(0, 2), hash.slice(2, 4));
    const dirPath = this.resolvePathInBase(dirRelative);
    await fsPromises.mkdir(dirPath, { recursive: true });
  }

  private metadataPath(filePath: string): string {
    return `${filePath}.meta.json`;
  }

  async store(data: Buffer, mimeType: string): Promise<BlobStoreResult> {
    const hash = computeHash(data);
    await this.ensureHashDir(hash);
    const filePath = this.hashToPath(hash);

    // Check if file already exists (deduplication)
    try {
      await fsPromises.access(filePath);
      const meta = await this.readMetadata(filePath);
      const ref = this.buildRef(
        hash,
        meta?.mimeType ?? mimeType,
        meta?.sizeBytes ?? data.length,
        meta?.provider ?? this.providerId,
      );
      return { ref, deduplicated: true };
    } catch {
      // File doesn't exist, proceed with storing
    }

    await fsPromises.writeFile(filePath, data);

    const metadata: BlobMetadata = {
      mimeType,
      sizeBytes: data.length,
      createdAt: new Date().toISOString(),
      provider: this.providerId,
      key: filePath,
    };
    await fsPromises.writeFile(this.metadataPath(filePath), JSON.stringify(metadata, null, 2));

    return {
      ref: this.buildRef(hash, mimeType, data.length, this.providerId),
      deduplicated: false,
    };
  }

  async getByHash(hash: string): Promise<StoredBlob> {
    const filePath = this.hashToPath(hash);

    let data: Buffer;
    try {
      data = await fsPromises.readFile(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Blob not found: ${hash}`);
      }
      throw error;
    }

    const metadata =
      (await this.readMetadata(filePath)) ||
      ({
        mimeType: 'application/octet-stream',
        sizeBytes: data.length,
        createdAt: new Date().toISOString(),
        provider: this.providerId,
        key: filePath,
      } satisfies BlobMetadata);
    return { data, metadata };
  }

  async exists(hash: string): Promise<boolean> {
    try {
      const filePath = this.hashToPath(hash);
      await fsPromises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async deleteByHash(hash: string): Promise<void> {
    try {
      const filePath = this.hashToPath(hash);
      const metaPath = this.metadataPath(filePath);

      // Delete files (ignore ENOENT errors)
      try {
        await fsPromises.unlink(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
      try {
        await fsPromises.unlink(metaPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    } catch {
      // Ignore invalid hashes/path traversal attempts
    }
  }

  async getUrl(_hash: string, _expiresInSeconds?: number): Promise<string | null> {
    // Local filesystem is proxied; return null to signal proxy route.
    return null;
  }

  private buildRef(hash: string, mimeType: string, sizeBytes: number, provider: string): BlobRef {
    return {
      uri: buildUri(hash),
      hash,
      mimeType,
      sizeBytes,
      provider,
    };
  }

  private async readMetadata(filePath: string): Promise<BlobMetadata | null> {
    const safeFilePath = this.resolvePathInBase(filePath);
    const metaPath = this.metadataPath(safeFilePath);
    try {
      const raw = await fsPromises.readFile(metaPath, 'utf8');
      return JSON.parse(raw) as BlobMetadata;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      logger.warn('[BlobFS] Failed to read metadata', { error });
      return null;
    }
  }
}
