import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { randomUUID } from 'crypto';

import { getEnvBool, getEnvInt } from '../envars';
import logger from '../logger';
import { getConfigDirectoryPath } from '../util/config/manage';
import { AssetDeduplicator } from './dedup';
import { FileLock } from '../util/lock';
import { validateMimeType, detectMimeType } from '../util/mimeTypes';
import { compressIfBeneficial, decompressIfNeeded, isCompressibleMimeType } from './compression';
import { streamingSave, streamingLoad, shouldUseStreaming } from './stream';
import type { Readable } from 'stream';
import { PassThrough } from 'stream';
import { AssetMetrics } from './metrics';
import { isValidEvalId, isValidResultId, isValidAssetId } from '../util/ids';

export interface AssetMetadata {
  id: string;
  type: 'image' | 'audio' | 'text' | 'json';
  mimeType: string;
  size: number;
  hash: string;
  createdAt: number;
  dedupedFrom?: string; // Path to original asset if this is a deduplicated reference
  compressed?: boolean; // Whether the asset is compressed
  originalSize?: number; // Original size before compression
  compressionRatio?: number; // Compression ratio achieved
}

export interface AssetStoreOptions {
  baseDir?: string;
  maxFileSize?: number;
  enableMetrics?: boolean;
}

export class AssetStore {
  private readonly baseDir: string;
  private readonly maxFileSize: number;
  private readonly deduplicator: AssetDeduplicator;
  private readonly dedupEnabled: boolean;
  private dedupInitialized: boolean = false;
  private dedupInitPromise: Promise<void> | null = null;
  private readonly lock: FileLock;
  private readonly streamThreshold: number;
  private metrics: AssetMetrics | null = null;
  private readonly enableMetrics: boolean;

  constructor(options: AssetStoreOptions = {}) {
    this.baseDir = options.baseDir || path.join(getConfigDirectoryPath(), 'assets');
    this.maxFileSize =
      options.maxFileSize || getEnvInt('PROMPTFOO_MAX_ASSET_SIZE', 50 * 1024 * 1024); // 50MB default
    this.deduplicator = new AssetDeduplicator(this.baseDir);
    this.dedupEnabled = getEnvBool('PROMPTFOO_ASSET_DEDUPLICATION', true);
    this.lock = new FileLock(this.baseDir);
    this.streamThreshold = getEnvInt('PROMPTFOO_STREAM_THRESHOLD', 10 * 1024 * 1024); // 10MB default
    this.enableMetrics = options.enableMetrics ?? getEnvBool('PROMPTFOO_ASSET_METRICS', true);
    
    if (this.enableMetrics) {
      this.metrics = AssetMetrics.getInstance();
    }

    // Initialize deduplicator asynchronously
    if (this.dedupEnabled) {
      this.dedupInitPromise = this.deduplicator
        .initialize()
        .then(() => {
          this.dedupInitialized = true;
        })
        .catch((err) => {
          logger.warn('Failed to initialize deduplicator:', err);
          this.dedupInitialized = false;
        });
    }
  }

  private async ensureDedupInitialized(): Promise<void> {
    if (this.dedupEnabled && this.dedupInitPromise && !this.dedupInitialized) {
      await this.dedupInitPromise;
    }
  }

  async save(
    data: Buffer,
    type: 'image' | 'audio' | 'text' | 'json',
    mimeType: string,
    evalId: string,
    resultId: string,
  ): Promise<AssetMetadata> {
    // Ensure deduplicator is initialized before proceeding
    await this.ensureDedupInitialized();

    // Validate size
    if (data.length > this.maxFileSize) {
      throw new Error(`Asset too large: ${data.length} bytes (max: ${this.maxFileSize} bytes)`);
    }

    // Validate IDs (basic security check)
    if (!isValidEvalId(evalId) || !isValidResultId(resultId)) {
      throw new Error('Invalid evalId or resultId format');
    }

    // Validate MIME type
    const mimeValidation = validateMimeType(mimeType, type);
    if (!mimeValidation.valid) {
      throw new Error(mimeValidation.error);
    }
    const normalizedMimeType = mimeValidation.normalized!;

    // Optionally detect MIME type from content and warn if mismatch
    const detectedMimeType = detectMimeType(data);
    if (detectedMimeType && detectedMimeType !== normalizedMimeType) {
      logger.warn(
        `MIME type mismatch: declared ${normalizedMimeType}, detected ${detectedMimeType}`
      );
    }

    // Create directory structure: assets/{evalId}/{resultId}/
    const dir = path.join(this.baseDir, evalId, resultId);
    await fs.mkdir(dir, { recursive: true });

    // Calculate hash first for deduplication
    const hash = crypto.createHash('sha256').update(data).digest('hex');

    // Check for existing asset with same hash if deduplication is enabled
    if (this.dedupEnabled) {
      const existing = await this.deduplicator.findExisting(hash);
      if (existing) {
        // Asset already exists, create a reference instead of duplicating
        logger.debug(`Found duplicate asset with hash ${hash}, creating reference`);

        // Create new metadata pointing to existing asset
        const id = randomUUID();
        const metadata: AssetMetadata = {
          id,
          type,
          mimeType: normalizedMimeType,
          size: data.length,
          hash,
          createdAt: Date.now(),
          dedupedFrom: `${existing.evalId}/${existing.resultId}/${existing.assetId}`,
        };

        // Only save metadata, not the file
        const metaPath = path.join(dir, `${id}.json`);
        await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));

        // Add to deduplication index
        await this.deduplicator.addEntry({
          hash,
          evalId,
          resultId,
          assetId: id,
          size: data.length,
          type,
          mimeType: normalizedMimeType,
        });
        await this.deduplicator.save();

        logger.debug(`Asset deduplicated: ${id} -> ${existing.assetId}`);
        return metadata;
      }
    }

    // Try to compress the data if beneficial
    const compressionResult = await compressIfBeneficial(data, normalizedMimeType);
    const dataToSave = compressionResult.data;
    
    // No duplicate found, save normally
    const id = randomUUID();
    const metadata: AssetMetadata = {
      id,
      type,
      mimeType: normalizedMimeType,
      size: dataToSave.length,
      hash,
      createdAt: Date.now(),
      compressed: compressionResult.compressed,
      originalSize: compressionResult.originalSize,
      compressionRatio: compressionResult.compressionRatio,
    };

    // Save file and metadata atomically with lock protection
    const filePath = path.join(dir, id);
    const metaPath = `${filePath}.json`;
    const lockKey = `${evalId}-${resultId}-${hash}`;

    return await this.lock.withLock(lockKey, async () => {
      // Double-check for duplicates after acquiring lock
      if (this.dedupEnabled) {
        const existing = await this.deduplicator.findExisting(hash);
        if (existing) {
          // Another process created it while we were waiting for the lock
          const dedupMetadata: AssetMetadata = {
            id,
            type,
            mimeType: normalizedMimeType,
            size: data.length,
            hash,
            createdAt: Date.now(),
            dedupedFrom: `${existing.evalId}/${existing.resultId}/${existing.assetId}`,
          };
          const dedupMetaPath = path.join(dir, `${id}.json`);
          await fs.writeFile(dedupMetaPath, JSON.stringify(dedupMetadata, null, 2));
          
          logger.debug(`Asset deduplicated during lock: ${id} -> ${existing.assetId}`);
          return dedupMetadata;
        }
      }

      try {
        // Write to temp files first
        await fs.writeFile(`${filePath}.tmp`, dataToSave);
        await fs.writeFile(`${metaPath}.tmp`, JSON.stringify(metadata, null, 2));

        // Atomic rename
        await fs.rename(`${filePath}.tmp`, filePath);
        await fs.rename(`${metaPath}.tmp`, metaPath);

        // Add to deduplication index
        if (this.dedupEnabled) {
          await this.deduplicator.addEntry({
            hash,
            evalId,
            resultId,
            assetId: id,
            size: compressionResult.originalSize, // Use original size for dedup tracking
            type,
            mimeType: normalizedMimeType,
          });
          await this.deduplicator.save();
        }

        logger.debug(`Asset saved: ${id} (${type}, ${data.length} bytes)`);
        
        // Record metrics if enabled
        if (this.metrics) {
          this.metrics.recordSave(true, metadata.size);
        }
        
        return metadata;
      } catch (error) {
        // Clean up temp files on error
        await this.cleanupTempFiles(filePath, metaPath);
        
        // Record failed save in metrics
        if (this.metrics) {
          this.metrics.recordSave(false, undefined, error as Error);
        }
        
        throw error;
      }
    });
  }

  async load(evalId: string, resultId: string, assetId: string): Promise<Buffer> {
    // Validate IDs
    if (!isValidEvalId(evalId) || !isValidResultId(resultId) || !isValidAssetId(assetId)) {
      throw new Error('Invalid ID format');
    }

    // First check if this is a deduplicated asset
    const metadata = await this.getMetadata(evalId, resultId, assetId);

    if (metadata.dedupedFrom) {
      // This is a deduplicated reference, load the original
      const [origEvalId, origResultId, origAssetId] = metadata.dedupedFrom.split('/');
      logger.debug(`Loading deduplicated asset from ${metadata.dedupedFrom}`);
      return this.load(origEvalId, origResultId, origAssetId);
    }

    const filePath = path.join(this.baseDir, evalId, resultId, assetId);

    // Security check - ensure path doesn't escape base directory
    if (!this.isPathSafe(filePath)) {
      throw new Error('Invalid asset path');
    }

    try {
      const data = await fs.readFile(filePath);
      
      // Decompress if needed
      let result: Buffer;
      if (metadata.compressed) {
        result = await decompressIfNeeded(data, true);
      } else {
        result = data;
      }
      
      // Record successful load in metrics
      if (this.metrics) {
        this.metrics.recordLoad(true);
      }
      
      return result;
    } catch (error: any) {
      // Record failed load in metrics
      if (this.metrics) {
        this.metrics.recordLoad(false, error);
      }
      
      if (error.code === 'ENOENT') {
        throw new Error('Asset not found');
      }
      throw error;
    }
  }

  async getMetadata(evalId: string, resultId: string, assetId: string): Promise<AssetMetadata> {
    // Validate IDs
    if (!isValidEvalId(evalId) || !isValidResultId(resultId) || !isValidAssetId(assetId)) {
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

  async cleanupLocks(): Promise<void> {
    await this.lock.cleanup();
  }

  async getDedupStats(): Promise<{
    enabled: boolean;
    totalAssets: number;
    uniqueAssets: number;
    duplicateBytes: number;
    savingsPercent: number;
  }> {
    if (!this.dedupEnabled) {
      return {
        enabled: false,
        totalAssets: 0,
        uniqueAssets: 0,
        duplicateBytes: 0,
        savingsPercent: 0,
      };
    }

    const stats = this.deduplicator.getStats();
    const totalBytes =
      stats.totalAssets *
      (stats.duplicateBytes / Math.max(1, stats.totalAssets - stats.uniqueAssets));
    const savingsPercent = totalBytes > 0 ? (stats.duplicateBytes / totalBytes) * 100 : 0;

    return {
      enabled: true,
      ...stats,
      savingsPercent,
    };
  }

  async rebuildDedupIndex(): Promise<void> {
    if (!this.dedupEnabled) {
      throw new Error('Deduplication is not enabled');
    }
    await this.deduplicator.rebuild(this.baseDir);
  }

  /**
   * Save a large file using streaming (for files above stream threshold)
   */
  async saveStream(
    sourceStream: Readable,
    type: 'image' | 'audio' | 'text' | 'json',
    mimeType: string,
    evalId: string,
    resultId: string,
  ): Promise<AssetMetadata> {
    // Validate IDs
    if (!isValidEvalId(evalId) || !isValidResultId(resultId)) {
      throw new Error('Invalid evalId or resultId format');
    }

    // Validate MIME type
    const mimeValidation = validateMimeType(mimeType, type);
    if (!mimeValidation.valid) {
      throw new Error(mimeValidation.error);
    }
    const normalizedMimeType = mimeValidation.normalized!;

    // Create directory structure
    const dir = path.join(this.baseDir, evalId, resultId);
    await fs.mkdir(dir, { recursive: true });

    const id = randomUUID();
    const filePath = path.join(dir, id);
    const metaPath = `${filePath}.json`;

    try {
      // Save using streaming with compression if beneficial
      const saveResult = await streamingSave(sourceStream, filePath, {
        compress: isCompressibleMimeType(normalizedMimeType),
        mimeType: normalizedMimeType,
      });

      // Check size limit
      if (saveResult.originalSize > this.maxFileSize) {
        // Clean up the file
        await fs.unlink(filePath).catch(() => {});
        throw new Error(`Asset too large: ${saveResult.originalSize} bytes (max: ${this.maxFileSize} bytes)`);
      }

      const metadata: AssetMetadata = {
        id,
        type,
        mimeType: normalizedMimeType,
        size: saveResult.size,
        hash: saveResult.hash,
        createdAt: Date.now(),
        compressed: saveResult.compressed,
        originalSize: saveResult.originalSize,
        compressionRatio: saveResult.compressed ? saveResult.size / saveResult.originalSize : undefined,
      };

      // Save metadata
      await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));

      // Add to deduplication index if enabled
      if (this.dedupEnabled) {
        await this.ensureDedupInitialized();
        await this.deduplicator.addEntry({
          hash: saveResult.hash,
          evalId,
          resultId,
          assetId: id,
          size: saveResult.originalSize,
          type,
          mimeType: normalizedMimeType,
        });
        await this.deduplicator.save();
      }

      logger.debug(`Asset saved via streaming: ${id} (${type}, ${saveResult.originalSize} bytes)`);
      return metadata;
    } catch (error) {
      // Clean up on error
      await fs.unlink(filePath).catch(() => {});
      await fs.unlink(metaPath).catch(() => {});
      throw error;
    }
  }

  /**
   * Load a large file using streaming
   */
  loadStream(evalId: string, resultId: string, assetId: string): Readable {
    // Validate IDs
    if (!isValidEvalId(evalId) || !isValidResultId(resultId) || !isValidAssetId(assetId)) {
      throw new Error('Invalid ID format');
    }

    const filePath = path.join(this.baseDir, evalId, resultId, assetId);

    // Security check
    if (!this.isPathSafe(filePath)) {
      throw new Error('Invalid asset path');
    }

    // We need to check metadata first to see if it's compressed or deduplicated
    // For now, return a stream that handles this asynchronously
    const self = this;
    
    // Create a PassThrough stream that we'll pipe the actual data through
    const outputStream = new PassThrough();

    // Handle metadata lookup and streaming asynchronously
    (async () => {
      try {
        const metadata = await self.getMetadata(evalId, resultId, assetId);

        if (metadata.dedupedFrom) {
          // Handle deduplicated assets
          const [origEvalId, origResultId, origAssetId] = metadata.dedupedFrom.split('/');
          logger.debug(`Loading deduplicated asset stream from ${metadata.dedupedFrom}`);
          
          // Recursively get the stream for the original asset
          const originalStream = self.loadStream(origEvalId, origResultId, origAssetId);
          originalStream.pipe(outputStream);
          originalStream.on('error', (err) => outputStream.destroy(err));
        } else {
          // Load the actual file
          const stream = streamingLoad(filePath, {
            filePath,
            compressed: metadata.compressed || false,
          });
          
          stream.pipe(outputStream);
          stream.on('error', (err) => outputStream.destroy(err));
        }
      } catch (error) {
        outputStream.destroy(error instanceof Error ? error : new Error(String(error)));
      }
    })();

    return outputStream;
  }

  /**
   * Save a file from disk using streaming if it's large enough
   */
  async saveFromFile(
    filePath: string,
    type: 'image' | 'audio' | 'text' | 'json',
    mimeType: string,
    evalId: string,
    resultId: string,
  ): Promise<AssetMetadata> {
    const useStreaming = await shouldUseStreaming(filePath, this.streamThreshold);

    if (useStreaming) {
      logger.debug(`Using streaming save for large file: ${filePath}`);
      const stream = createReadStream(filePath);
      return this.saveStream(stream, type, mimeType, evalId, resultId);
    } else {
      // Use regular save for smaller files
      const data = await fs.readFile(filePath);
      return this.save(data, type, mimeType, evalId, resultId);
    }
  }

  /**
   * Get the stream threshold in bytes
   */
  getStreamThreshold(): number {
    return this.streamThreshold;
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
