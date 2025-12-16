import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import logger from '../logger';
import { getConfigDirectoryPath } from '../util/config/manage';
import { BLOB_SCHEME, DEFAULT_FILESYSTEM_SUBDIR } from './constants';
import type { BlobMetadata, BlobRef, BlobStorageProvider, BlobStoreResult, StoredBlob } from './types';

interface FilesystemProviderConfig {
  basePath?: string;
}

function computeHash(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function buildUri(hash: string): string {
  return `${BLOB_SCHEME}${hash}`;
}

export class FilesystemBlobStorageProvider implements BlobStorageProvider {
  readonly providerId = 'filesystem';
  private readonly basePath: string;
  private readonly hashIndexPath: string;
  private hashIndex: Map<string, string> = new Map();

  constructor(config?: FilesystemProviderConfig) {
    const defaultBase = path.join(getConfigDirectoryPath(true), DEFAULT_FILESYSTEM_SUBDIR);
    this.basePath = config?.basePath || defaultBase;
    this.hashIndexPath = path.join(this.basePath, 'hash-index.json');
    this.ensureDirectory();
    this.loadHashIndex();
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
      logger.debug('[BlobFS] Created blob directory', { basePath: this.basePath });
    }
  }

  private loadHashIndex(): void {
    try {
      if (fs.existsSync(this.hashIndexPath)) {
        const data = fs.readFileSync(this.hashIndexPath, 'utf8');
        this.hashIndex = new Map(Object.entries(JSON.parse(data)));
      }
    } catch (error) {
      logger.warn('[BlobFS] Failed to load hash index, starting empty', { error });
      this.hashIndex = new Map();
    }
  }

  private saveHashIndex(): void {
    try {
      const payload = JSON.stringify(Object.fromEntries(this.hashIndex), null, 2);
      fs.writeFileSync(this.hashIndexPath, payload, 'utf8');
    } catch (error) {
      logger.warn('[BlobFS] Failed to save hash index', { error });
    }
  }

  private hashToPath(hash: string): string {
    const dir = path.join(this.basePath, hash.slice(0, 2), hash.slice(2, 4));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, hash);
  }

  private metadataPath(filePath: string): string {
    return `${filePath}.meta.json`;
  }

  async store(data: Buffer, mimeType: string): Promise<BlobStoreResult> {
    const hash = computeHash(data);
    const existingKey = this.hashIndex.get(hash);
    if (existingKey && (await this.exists(hash))) {
      const meta = this.readMetadata(existingKey);
      const ref = this.buildRef(hash, mimeType, data.length, meta?.provider ?? this.providerId);
      return { ref, deduplicated: true };
    }

    const filePath = this.hashToPath(hash);
    fs.writeFileSync(filePath, data);

    const metadata: BlobMetadata = {
      mimeType,
      sizeBytes: data.length,
      createdAt: new Date().toISOString(),
      provider: this.providerId,
      key: filePath,
    };
    fs.writeFileSync(this.metadataPath(filePath), JSON.stringify(metadata, null, 2));
    this.hashIndex.set(hash, filePath);
    this.saveHashIndex();

    return {
      ref: this.buildRef(hash, mimeType, data.length, this.providerId),
      deduplicated: false,
    };
  }

  async getByHash(hash: string): Promise<StoredBlob> {
    const filePath = this.hashIndex.get(hash) || this.hashToPath(hash);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Blob not found: ${hash}`);
    }
    const data = fs.readFileSync(filePath);
    const metadata = this.readMetadata(filePath) || {
      mimeType: 'application/octet-stream',
      sizeBytes: data.length,
      createdAt: new Date().toISOString(),
      provider: this.providerId,
      key: filePath,
    };
    return { data, metadata };
  }

  async exists(hash: string): Promise<boolean> {
    const filePath = this.hashIndex.get(hash);
    if (!filePath) {
      return false;
    }
    return fs.existsSync(filePath);
  }

  async deleteByHash(hash: string): Promise<void> {
    const filePath = this.hashIndex.get(hash);
    if (!filePath) {
      return;
    }
    this.hashIndex.delete(hash);
    this.saveHashIndex();
    const metaPath = this.metadataPath(filePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    if (fs.existsSync(metaPath)) {
      fs.unlinkSync(metaPath);
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
    const metaPath = this.metadataPath(filePath);
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
