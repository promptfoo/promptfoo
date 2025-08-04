/**
 * Compression utilities for text-based assets
 * Automatically compresses and decompresses text-based content to save storage space
 */

import * as zlib from 'zlib';
import { promisify } from 'util';
import logger from '../logger';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// MIME types that benefit from compression
const COMPRESSIBLE_MIME_TYPES = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/x-javascript',
  'text/plain',
  'text/html',
  'text/css',
  'text/xml',
  'text/javascript',
  'text/markdown',
  'text/csv',
  'application/ld+json',
  'application/xhtml+xml',
  'application/x-yaml',
  'application/x-sh',
  'application/sql',
]);

// File extensions that are typically text-based
const COMPRESSIBLE_EXTENSIONS = new Set([
  '.json',
  '.txt',
  '.xml',
  '.html',
  '.css',
  '.js',
  '.ts',
  '.jsx',
  '.tsx',
  '.md',
  '.csv',
  '.yaml',
  '.yml',
  '.sh',
  '.sql',
  '.log',
]);

export interface CompressionResult {
  data: Buffer;
  compressed: boolean;
  originalSize: number;
  compressedSize?: number;
  compressionRatio?: number;
}

/**
 * Check if a MIME type is compressible
 */
export function isCompressibleMimeType(mimeType: string): boolean {
  // Remove charset or other parameters
  const baseMimeType = mimeType.split(';')[0].trim().toLowerCase();
  return COMPRESSIBLE_MIME_TYPES.has(baseMimeType);
}

/**
 * Check if a filename indicates compressible content
 */
export function isCompressibleFilename(filename: string): boolean {
  const lowerFilename = filename.toLowerCase();
  return Array.from(COMPRESSIBLE_EXTENSIONS).some(ext => lowerFilename.endsWith(ext));
}

/**
 * Compress data if it's text-based and would benefit from compression
 */
export async function compressIfBeneficial(
  data: Buffer,
  mimeType?: string,
  filename?: string,
  minCompressionRatio: number = 0.9
): Promise<CompressionResult> {
  const originalSize = data.length;
  
  // Skip small files (compression overhead not worth it)
  if (originalSize < 1024) {
    return {
      data,
      compressed: false,
      originalSize,
    };
  }
  
  // Check if content is compressible
  const isCompressible = 
    (mimeType && isCompressibleMimeType(mimeType)) ||
    (filename && isCompressibleFilename(filename));
  
  if (!isCompressible) {
    return {
      data,
      compressed: false,
      originalSize,
    };
  }
  
  try {
    // Try to compress
    const compressed = await gzip(data, {
      level: zlib.constants.Z_BEST_COMPRESSION,
    });
    
    const compressedSize = compressed.length;
    const compressionRatio = compressedSize / originalSize;
    
    // Only use compression if it actually saves space
    if (compressionRatio < minCompressionRatio) {
      logger.debug(
        `Compressed ${mimeType || filename || 'data'} from ${originalSize} to ${compressedSize} bytes (${(compressionRatio * 100).toFixed(1)}%)`
      );
      
      return {
        data: compressed,
        compressed: true,
        originalSize,
        compressedSize,
        compressionRatio,
      };
    } else {
      logger.debug(
        `Compression not beneficial for ${mimeType || filename || 'data'} (${(compressionRatio * 100).toFixed(1)}% of original)`
      );
      
      return {
        data,
        compressed: false,
        originalSize,
      };
    }
  } catch (error) {
    logger.warn('Compression failed, using original data:', error);
    return {
      data,
      compressed: false,
      originalSize,
    };
  }
}

/**
 * Decompress data if it was compressed
 */
export async function decompressIfNeeded(
  data: Buffer,
  isCompressed: boolean
): Promise<Buffer> {
  if (!isCompressed) {
    return data;
  }
  
  try {
    const decompressed = await gunzip(data);
    logger.debug(`Decompressed data from ${data.length} to ${decompressed.length} bytes`);
    return decompressed;
  } catch (error) {
    logger.error('Decompression failed:', error);
    throw new Error('Failed to decompress asset data');
  }
}

/**
 * Check if data is already gzip compressed
 */
export function isGzipped(data: Buffer): boolean {
  // Check for gzip magic numbers (1f 8b)
  return data.length > 2 && data[0] === 0x1f && data[1] === 0x8b;
}

/**
 * Get compression statistics for a set of assets
 */
export interface CompressionStats {
  totalAssets: number;
  compressedAssets: number;
  totalOriginalSize: number;
  totalCompressedSize: number;
  totalSavings: number;
  averageCompressionRatio: number;
}

export function calculateCompressionStats(results: CompressionResult[]): CompressionStats {
  let compressedAssets = 0;
  let totalOriginalSize = 0;
  let totalCompressedSize = 0;
  
  for (const result of results) {
    totalOriginalSize += result.originalSize;
    
    if (result.compressed && result.compressedSize) {
      compressedAssets++;
      totalCompressedSize += result.compressedSize;
    } else {
      totalCompressedSize += result.originalSize;
    }
  }
  
  const totalSavings = totalOriginalSize - totalCompressedSize;
  const averageCompressionRatio = totalOriginalSize > 0 
    ? totalCompressedSize / totalOriginalSize 
    : 1;
  
  return {
    totalAssets: results.length,
    compressedAssets,
    totalOriginalSize,
    totalCompressedSize,
    totalSavings,
    averageCompressionRatio,
  };
}