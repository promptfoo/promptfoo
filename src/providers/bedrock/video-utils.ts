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
 * @param imagePath - Either a file:// URL or base64 encoded image data
 * @returns Object with either data (base64 string) or error message
 */
export function loadImageData(imagePath: string): ImageLoadResult {
  if (imagePath.startsWith('file://')) {
    const filePath = imagePath.slice(7);
    const resolvedPath = path.resolve(filePath);
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
  if (lowerPath.startsWith('ivborw')) {
    return 'png';
  }

  const extension = path.extname(imagePath.startsWith('file://') ? imagePath.slice(7) : imagePath);
  if (extension.toLowerCase() === '.png') {
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
