import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
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

  private hashToPath(hash: string, options?: { ensureDir?: boolean }): string {
    this.assertValidHash(hash);

    const dirRelative = path.join(hash.slice(0, 2), hash.slice(2, 4));
    const dirPath = this.resolvePathInBase(dirRelative);

    if (options?.ensureDir && !fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    const fileRelative = path.join(dirRelative, hash);
    return this.resolvePathInBase(fileRelative);
  }

  private metadataPath(filePath: string): string {
    return `${filePath}.meta.json`;
  }

  async store(data: Buffer, mimeType: string): Promise<BlobStoreResult> {
    const hash = computeHash(data);
    const filePath = this.hashToPath(hash, { ensureDir: true });

    if (fs.existsSync(filePath)) {
      const meta = this.readMetadata(filePath);
      const ref = this.buildRef(
        hash,
        meta?.mimeType ?? mimeType,
        meta?.sizeBytes ?? data.length,
        meta?.provider ?? this.providerId,
      );
      return { ref, deduplicated: true };
    }

    fs.writeFileSync(filePath, data);

    const metadata: BlobMetadata = {
      mimeType,
      sizeBytes: data.length,
      createdAt: new Date().toISOString(),
      provider: this.providerId,
      key: filePath,
    };
    fs.writeFileSync(this.metadataPath(filePath), JSON.stringify(metadata, null, 2));

    return {
      ref: this.buildRef(hash, mimeType, data.length, this.providerId),
      deduplicated: false,
    };
  }

  async getByHash(hash: string): Promise<StoredBlob> {
    const filePath = this.hashToPath(hash);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Blob not found: ${hash}`);
    }
    const data = fs.readFileSync(filePath);
    const metadata =
      this.readMetadata(filePath) ||
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
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  async deleteByHash(hash: string): Promise<void> {
    try {
      const filePath = this.hashToPath(hash);
      const metaPath = this.metadataPath(filePath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      if (fs.existsSync(metaPath)) {
        fs.unlinkSync(metaPath);
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

  private readMetadata(filePath: string): BlobMetadata | null {
    const safeFilePath = this.resolvePathInBase(filePath);
    const metaPath = this.metadataPath(safeFilePath);
    if (!fs.existsSync(metaPath)) {
      return null;
    }
    try {
      const raw = fs.readFileSync(metaPath, 'utf8');
      return JSON.parse(raw) as BlobMetadata;
    } catch (error) {
      logger.warn('[BlobFS] Failed to read metadata', { error });
      return null;
    }
  }
}
