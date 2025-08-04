/**
 * MIME type validation utilities for asset storage
 */

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  'image/avif',
]);

export const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/webm',
  'audio/aac',
  'audio/flac',
  'audio/m4a',
  'audio/mp4',
  'audio/raw', // For raw PCM data
]);

export const ALLOWED_TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/html',
  'text/css',
  'text/javascript',
  'text/markdown',
  'text/csv',
  'text/xml',
]);

export const ALLOWED_JSON_MIME_TYPES = new Set([
  'application/json',
  'application/ld+json',
]);

export interface MimeTypeValidation {
  valid: boolean;
  normalized?: string;
  error?: string;
}

/**
 * Validates and normalizes MIME types for asset storage
 */
export function validateMimeType(
  mimeType: string,
  assetType: 'image' | 'audio' | 'text' | 'json'
): MimeTypeValidation {
  if (!mimeType || typeof mimeType !== 'string') {
    return {
      valid: false,
      error: 'MIME type is required',
    };
  }

  // Normalize MIME type (lowercase, trim)
  const normalized = mimeType.toLowerCase().trim();

  // Remove charset or other parameters if present
  const baseMimeType = normalized.split(';')[0].trim();

  // Check against allowed types
  let allowedTypes: Set<string>;
  switch (assetType) {
    case 'image':
      allowedTypes = ALLOWED_IMAGE_MIME_TYPES;
      break;
    case 'audio':
      allowedTypes = ALLOWED_AUDIO_MIME_TYPES;
      break;
    case 'text':
      allowedTypes = ALLOWED_TEXT_MIME_TYPES;
      break;
    case 'json':
      allowedTypes = ALLOWED_JSON_MIME_TYPES;
      break;
  }
  
  if (!allowedTypes.has(baseMimeType)) {
    return {
      valid: false,
      error: `Invalid ${assetType} MIME type: ${baseMimeType}. Allowed types: ${Array.from(allowedTypes).join(', ')}`,
    };
  }

  return {
    valid: true,
    normalized: baseMimeType,
  };
}

/**
 * Get file extension from MIME type
 */
export function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/bmp': '.bmp',
    'image/tiff': '.tiff',
    'image/avif': '.avif',
    'audio/wav': '.wav',
    'audio/wave': '.wav',
    'audio/x-wav': '.wav',
    'audio/mpeg': '.mp3',
    'audio/mp3': '.mp3',
    'audio/ogg': '.ogg',
    'audio/webm': '.webm',
    'audio/aac': '.aac',
    'audio/flac': '.flac',
    'audio/m4a': '.m4a',
    'audio/mp4': '.mp4',
    'audio/raw': '.raw',
  };

  return mimeToExt[mimeType.toLowerCase()] || '';
}

/**
 * Detect MIME type from file buffer (basic detection)
 */
export function detectMimeType(buffer: Buffer): string | null {
  if (buffer.length < 4) {
    return null;
  }

  // Check magic numbers
  const header = buffer.subarray(0, 16);
  
  // PNG
  if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) {
    return 'image/png';
  }
  
  // JPEG
  if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) {
    return 'image/jpeg';
  }
  
  // GIF
  if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) {
    return 'image/gif';
  }
  
  // WebP
  if (header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50) {
    return 'image/webp';
  }
  
  // WAV
  if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 &&
      header[8] === 0x57 && header[9] === 0x41 && header[10] === 0x56 && header[11] === 0x45) {
    return 'audio/wav';
  }
  
  // MP3
  if ((header[0] === 0xFF && (header[1] & 0xE0) === 0xE0) || 
      (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33)) {
    return 'audio/mpeg';
  }
  
  // OGG
  if (header[0] === 0x4F && header[1] === 0x67 && header[2] === 0x67 && header[3] === 0x53) {
    return 'audio/ogg';
  }
  
  // FLAC
  if (header[0] === 0x66 && header[1] === 0x4C && header[2] === 0x61 && header[3] === 0x43) {
    return 'audio/flac';
  }

  return null;
}