import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import logger from '../logger';
import { getConfigDirectoryPath } from '../util/config/manage';
import { sha256 } from '../util/createHash';
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

function buildUri(hash: string): string {
  return `${BLOB_SCHEME}${hash}`;
}

async function publishFile(source: string, destination: string): Promise<void> {
  for (let retry = 0; ; retry++) {
    try {
      await fsPromises.rename(source, destination);
      return;
    } catch (error) {
      if (
        process.platform !== 'win32' ||
        retry === 5 ||
        !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException)?.code ?? '')
      ) {
        throw error;
      }
      // Windows can briefly lock a competing writer's destination. Keep replacement atomic.
      await sleep(50 * (retry + 1));
    }
  }
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

  getFilePath(hash: string): string {
    this.assertValidHash(hash);

    const dirRelative = path.join(hash.slice(0, 2), hash.slice(2, 4));
    const fileRelative = path.join(dirRelative, hash);
    return this.resolvePathInBase(fileRelative);
  }

  private metadataPath(filePath: string): string {
    return `${filePath}.meta.json`;
  }

  async store(data: Buffer, mimeType: string): Promise<BlobStoreResult> {
    const hash = sha256(data);
    const filePath = this.getFilePath(hash);
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });

    // Check if file already exists (deduplication)
    try {
      await fsPromises.access(filePath);
      const meta = await this.readMetadata(filePath);
      if (meta && typeof meta.mimeType === 'string' && meta.mimeType.length > 0) {
        const ref = this.buildRef(
          hash,
          meta.mimeType,
          meta.sizeBytes ?? data.length,
          meta.provider ?? this.providerId,
        );
        return { ref, deduplicated: true };
      }
      // A concurrent delete may remove metadata before staged bytes are published.
      // Republish incomplete blobs instead of making missing metadata permanent.
    } catch {
      // File doesn't exist, proceed with storing
    }

    const metadata: BlobMetadata = {
      mimeType,
      sizeBytes: data.length,
      createdAt: new Date().toISOString(),
      provider: this.providerId,
      key: filePath,
    };
    // Stage complete bytes and metadata before publishing either file.
    // Each writer owns a staging directory on the same filesystem, including across processes.
    const stagingDir = await fsPromises.mkdtemp(`${filePath}.`);
    try {
      const stagedData = path.join(stagingDir, 'data');
      const stagedMetadata = path.join(stagingDir, 'metadata.json');
      await fsPromises.writeFile(stagedData, data, { flag: 'wx' });
      await fsPromises.writeFile(stagedMetadata, JSON.stringify(metadata, null, 2), {
        flag: 'wx',
      });
      // Publish complete bytes first: a failed data rename must not change another writer's MIME.
      await publishFile(stagedData, filePath);
      await publishFile(stagedMetadata, this.metadataPath(filePath));
    } finally {
      try {
        await fsPromises.rm(stagingDir, { recursive: true, force: true });
      } catch (error) {
        // Never mask the original write error or remove another writer's published files.
        logger.warn('[BlobFS] Failed to remove staging directory', { error });
      }
    }

    return {
      ref: this.buildRef(hash, mimeType, data.length, this.providerId),
      deduplicated: false,
    };
  }

  async getByHash(hash: string): Promise<StoredBlob> {
    const filePath = this.getFilePath(hash);

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
      const filePath = this.getFilePath(hash);
      await fsPromises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async deleteByHash(hash: string): Promise<void> {
    let filePath: string;
    try {
      filePath = this.getFilePath(hash);
    } catch {
      // Invalid hashes and path traversal attempts remain a no-op.
      return;
    }

    for (const targetPath of [filePath, this.metadataPath(filePath)]) {
      try {
        await fsPromises.unlink(targetPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
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
