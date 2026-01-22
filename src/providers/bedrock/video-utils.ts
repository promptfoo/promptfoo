/**
 * Shared utilities for Bedrock video providers (Nova Reel, Luma Ray).
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Result from loading image data.
 */
export interface ImageLoadResult {
  data?: string;
  error?: string;
}

/**
 * Supported image formats for video generation.
 */
export type ImageFormat = 'png' | 'jpeg';

/**
 * Load image data from file:// path or return as-is if base64.
 *
 * Includes path traversal protection for file:// paths.
 *
 * @param imagePath - Either a file:// URL or base64 encoded image data
 * @returns Object with either data (base64 string) or error message
 */
export function loadImageData(imagePath: string): ImageLoadResult {
  if (imagePath.startsWith('file://')) {
    const filePath = imagePath.slice(7);
    // Resolve to absolute path and validate no path traversal
    const resolvedPath = path.resolve(filePath);
    if (filePath.includes('..') && resolvedPath !== path.resolve(path.normalize(filePath))) {
      return { error: `Invalid image path (path traversal detected): ${filePath}` };
    }
    if (!fs.existsSync(resolvedPath)) {
      return { error: `Image file not found: ${resolvedPath}` };
    }
    return { data: fs.readFileSync(resolvedPath).toString('base64') };
  }
  // Assume it's already base64
  return { data: imagePath };
}

/**
 * Detect image format from path or base64 data.
 *
 * Detection methods:
 * - File extension (.png, .jpg, .jpeg)
 * - Base64 PNG magic bytes (starts with 'iVBORw')
 *
 * @param imagePath - File path or base64 encoded image
 * @returns Detected format ('png' or 'jpeg')
 */
export function detectImageFormat(imagePath: string): ImageFormat {
  const lowerPath = imagePath.toLowerCase();
  // Check file extension or PNG base64 magic bytes
  if (lowerPath.includes('.png') || lowerPath.startsWith('ivborw')) {
    return 'png';
  }
  return 'jpeg';
}

/**
 * Get MIME type string for an image format.
 */
export function getImageMimeType(format: ImageFormat): 'image/png' | 'image/jpeg' {
  return format === 'png' ? 'image/png' : 'image/jpeg';
}
