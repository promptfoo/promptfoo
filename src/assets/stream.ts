/**
 * Streaming utilities for handling large assets
 * Allows processing large files without loading them entirely into memory
 */

import * as fs from 'fs';
import * as crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { Transform, Readable } from 'stream';
import * as zlib from 'zlib';
import logger from '../logger';
import { isCompressibleMimeType } from './compression';

export interface StreamingSaveOptions {
  evalId: string;
  resultId: string;
  type: 'image' | 'audio' | 'text' | 'json';
  mimeType: string;
  filePath: string;
  compress?: boolean;
}

export interface StreamingLoadOptions {
  filePath: string;
  compressed: boolean;
  start?: number;
  end?: number;
}

/**
 * Create a hash transform stream that calculates hash while passing data through
 */
export function createHashStream(): Transform & { getHash: () => string } {
  const hash = crypto.createHash('sha256');
  let finalHash: string | null = null;
  
  const transform = new Transform({
    transform(chunk, encoding, callback) {
      hash.update(chunk);
      this.push(chunk);
      callback();
    },
    flush(callback) {
      finalHash = hash.digest('hex');
      callback();
    },
  });
  
  // Type-safe method to get the final hash
  const hashTransform = Object.assign(transform, {
    getHash: () => {
      if (finalHash === null) {
        throw new Error('Hash not yet calculated - stream not finished');
      }
      return finalHash;
    }
  });
  
  return hashTransform;
}

/**
 * Create a size counting transform stream
 */
export function createSizeCounterStream(): Transform & { getSize: () => number } {
  let size = 0;
  
  const transform = new Transform({
    transform(chunk, encoding, callback) {
      size += chunk.length;
      this.push(chunk);
      callback();
    },
  });
  
  const sizeTransform = Object.assign(transform, {
    getSize: () => size
  });
  
  return sizeTransform;
}

/**
 * Save a large file using streaming with optional compression
 */
export async function streamingSave(
  sourceStream: Readable,
  destPath: string,
  options: {
    compress?: boolean;
    mimeType?: string;
  } = {}
): Promise<{
  hash: string;
  size: number;
  originalSize: number;
  compressed: boolean;
}> {
  const tempPath = `${destPath}.tmp`;
  const hashStream = createHashStream();
  const sizeCounter = createSizeCounterStream();
  const originalSizeCounter = createSizeCounterStream();
  
  try {
    const writeStream = fs.createWriteStream(tempPath);
    
    // Determine if we should compress
    const shouldCompress = !!(options.compress !== false && 
                            options.mimeType && 
                            isCompressibleMimeType(options.mimeType));
    
    if (shouldCompress) {
      // Pipeline: source -> originalSizeCounter -> gzip -> hashStream -> sizeCounter -> file
      await pipeline(
        sourceStream,
        originalSizeCounter,
        zlib.createGzip({ level: zlib.constants.Z_BEST_COMPRESSION }),
        hashStream,
        sizeCounter,
        writeStream
      );
    } else {
      // Pipeline: source -> hashStream -> sizeCounter -> file
      await pipeline(
        sourceStream,
        hashStream,
        sizeCounter,
        writeStream
      );
    }
    
    // Atomic rename
    await fs.promises.rename(tempPath, destPath);
    
    const result = {
      hash: hashStream.getHash(),
      size: sizeCounter.getSize(),
      originalSize: shouldCompress ? originalSizeCounter.getSize() : sizeCounter.getSize(),
      compressed: shouldCompress,
    };
    
    logger.debug(`Streaming save completed: ${destPath}`, {
      size: result.size,
      originalSize: result.originalSize,
      compressed: result.compressed,
    });
    
    return result;
  } catch (error) {
    // Clean up temp file on error
    try {
      await fs.promises.unlink(tempPath);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Load a large file using streaming with optional decompression and range support
 */
export function streamingLoad(
  filePath: string,
  options: StreamingLoadOptions
): Readable {
  const { compressed, start, end } = options;
  
  // Create read stream with optional range
  const readOptions: any = {};
  if (start !== undefined) {
    readOptions.start = start;
  }
  if (end !== undefined) {
    readOptions.end = end;
  }
  
  const readStream = fs.createReadStream(filePath, readOptions);
  
  // If compressed, pipe through decompression
  if (compressed) {
    const gunzipStream = zlib.createGunzip();
    readStream.pipe(gunzipStream);
    
    // Handle errors on both streams
    readStream.on('error', (error) => {
      gunzipStream.destroy(error);
    });
    
    return gunzipStream;
  }
  
  return readStream;
}

/**
 * Calculate hash of a file using streaming (doesn't load entire file into memory)
 */
export async function calculateFileHash(filePath: string): Promise<string> {
  const hashStream = createHashStream();
  const readStream = fs.createReadStream(filePath);
  
  await pipeline(readStream, hashStream);
  
  return hashStream.getHash();
}

/**
 * Get file size without loading it
 */
export async function getFileSize(filePath: string): Promise<number> {
  const stats = await fs.promises.stat(filePath);
  return stats.size;
}

/**
 * Stream copy with progress callback
 */
export async function streamCopyWithProgress(
  sourcePath: string,
  destPath: string,
  onProgress?: (bytesProcessed: number, totalBytes: number) => void
): Promise<void> {
  const totalSize = await getFileSize(sourcePath);
  let processedBytes = 0;
  
  const progressStream = new Transform({
    transform(chunk, encoding, callback) {
      processedBytes += chunk.length;
      if (onProgress) {
        onProgress(processedBytes, totalSize);
      }
      this.push(chunk);
      callback();
    },
  });
  
  const readStream = fs.createReadStream(sourcePath);
  const writeStream = fs.createWriteStream(destPath);
  
  await pipeline(readStream, progressStream, writeStream);
}

/**
 * Check if a file should use streaming based on size
 */
export async function shouldUseStreaming(
  filePath: string,
  threshold: number = 10 * 1024 * 1024 // 10MB default
): Promise<boolean> {
  try {
    const size = await getFileSize(filePath);
    return size > threshold;
  } catch (error) {
    return false;
  }
}

/**
 * Create a chunked upload stream that splits large files into chunks
 */
export function createChunkedStream(
  chunkSize: number = 1024 * 1024 // 1MB chunks
): Transform & { getChunks: () => Buffer[] } {
  const chunks: Buffer[] = [];
  let currentChunk = Buffer.alloc(0);
  
  const transform = new Transform({
    transform(chunk: Buffer, encoding, callback) {
      let remaining = chunk;
      
      while (remaining.length > 0) {
        const spaceInCurrentChunk = chunkSize - currentChunk.length;
        const toAdd = remaining.slice(0, spaceInCurrentChunk);
        
        currentChunk = Buffer.concat([currentChunk, toAdd]);
        remaining = remaining.slice(spaceInCurrentChunk);
        
        if (currentChunk.length === chunkSize) {
          chunks.push(currentChunk);
          this.push(currentChunk);
          currentChunk = Buffer.alloc(0);
        }
      }
      
      callback();
    },
    flush(callback) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        this.push(currentChunk);
      }
      callback();
    },
  });
  
  const chunkedTransform = Object.assign(transform, {
    getChunks: () => chunks
  });
  
  return chunkedTransform;
}