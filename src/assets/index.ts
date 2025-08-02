import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { randomUUID } from 'crypto';

import { getEnvBool, getEnvInt } from '../envars';
import logger from '../logger';
import { getConfigDirectoryPath } from '../util/config/manage';

export interface AssetMetadata {
  id: string;
  type: 'image' | 'audio';
  mimeType: string;
  size: number;
  hash: string;
  createdAt: number;
}

export interface AssetStoreOptions {
  baseDir?: string;
  maxFileSize?: number;
}

export class AssetStore {
  private readonly baseDir: string;
  private readonly maxFileSize: number;

  constructor(options: AssetStoreOptions = {}) {
    this.baseDir = options.baseDir || path.join(getConfigDirectoryPath(), 'assets');
    this.maxFileSize = options.maxFileSize || getEnvInt('PROMPTFOO_MAX_ASSET_SIZE', 50 * 1024 * 1024); // 50MB default
  }

  async save(
    data: Buffer,
    type: 'image' | 'audio',
    mimeType: string,
    evalId: string,
    resultId: string,
  ): Promise<AssetMetadata> {
    // Validate size
    if (data.length > this.maxFileSize) {
      throw new Error(
        `Asset too large: ${data.length} bytes (max: ${this.maxFileSize} bytes)`,
      );
    }

    // Validate IDs (basic security check)
    if (!this.isValidId(evalId) || !this.isValidId(resultId)) {
      throw new Error('Invalid evalId or resultId format');
    }

    // Create directory structure: assets/{evalId}/{resultId}/
    const dir = path.join(this.baseDir, evalId, resultId);
    await fs.mkdir(dir, { recursive: true });

    // Generate metadata
    const id = randomUUID();
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    const metadata: AssetMetadata = {
      id,
      type,
      mimeType,
      size: data.length,
      hash,
      createdAt: Date.now(),
    };

    // Save file and metadata atomically
    const filePath = path.join(dir, id);
    const metaPath = `${filePath}.json`;

    try {
      // Write to temp files first
      await fs.writeFile(`${filePath}.tmp`, data);
      await fs.writeFile(`${metaPath}.tmp`, JSON.stringify(metadata, null, 2));

      // Atomic rename
      await fs.rename(`${filePath}.tmp`, filePath);
      await fs.rename(`${metaPath}.tmp`, metaPath);

      logger.debug(`Asset saved: ${id} (${type}, ${data.length} bytes)`);
      return metadata;
    } catch (error) {
      // Clean up temp files on error
      await this.cleanupTempFiles(filePath, metaPath);
      throw error;
    }
  }

  async load(evalId: string, resultId: string, assetId: string): Promise<Buffer> {
    // Validate IDs
    if (!this.isValidId(evalId) || !this.isValidId(resultId) || !this.isValidId(assetId)) {
      throw new Error('Invalid ID format');
    }

    const filePath = path.join(this.baseDir, evalId, resultId, assetId);

    // Security check - ensure path doesn't escape base directory
    if (!this.isPathSafe(filePath)) {
      throw new Error('Invalid asset path');
    }

    try {
      return await fs.readFile(filePath);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error('Asset not found');
      }
      throw error;
    }
  }

  async getMetadata(evalId: string, resultId: string, assetId: string): Promise<AssetMetadata> {
    // Validate IDs
    if (!this.isValidId(evalId) || !this.isValidId(resultId) || !this.isValidId(assetId)) {
      throw new Error('Invalid ID format');
    }

    const metaPath = path.join(this.baseDir, evalId, resultId, `${assetId}.json`);

    if (!this.isPathSafe(metaPath)) {
      throw new Error('Invalid asset path');
    }

    try {
      const data = await fs.readFile(metaPath, 'utf-8');
      return JSON.parse(data);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error('Asset metadata not found');
      }
      throw error;
    }
  }

  async exists(evalId: string, resultId: string, assetId: string): Promise<boolean> {
    try {
      await this.getMetadata(evalId, resultId, assetId);
      return true;
    } catch {
      return false;
    }
  }

  getAssetPath(evalId: string, resultId: string, assetId: string): string {
    return path.join(this.baseDir, evalId, resultId, assetId);
  }

  private isValidId(id: string): boolean {
    // Simple validation - alphanumeric, hyphens, and underscores only
    // This prevents path traversal attacks
    return /^[a-zA-Z0-9_-]+$/.test(id);
  }

  private isPathSafe(requestedPath: string): boolean {
    const resolved = path.resolve(requestedPath);
    const baseResolved = path.resolve(this.baseDir);
    return resolved.startsWith(baseResolved);
  }

  private async cleanupTempFiles(filePath: string, metaPath: string): Promise<void> {
    try {
      await fs.unlink(`${filePath}.tmp`).catch(() => {});
      await fs.unlink(`${metaPath}.tmp`).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Global instance with lazy initialization
let assetStore: AssetStore | null = null;

export function getAssetStore(): AssetStore {
  if (!assetStore) {
    assetStore = new AssetStore();
  }
  return assetStore;
}

// Check if asset storage is enabled
export function isAssetStorageEnabled(): boolean {
  return getEnvBool('PROMPTFOO_USE_ASSET_STORAGE', false);
}