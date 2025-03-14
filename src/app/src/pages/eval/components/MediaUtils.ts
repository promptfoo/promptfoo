import { METADATA_PREFIX } from '@promptfoo/constants';
import { type MediaMetadata } from '@promptfoo/types';

// Define the MediaType type
export type MediaType = 'audio' | 'video' | 'image' | 'unknown';

// Define lookup tables for media type patterns
const MEDIA_TYPE_MAPPINGS = {
  image: {
    dataUrlPattern: /^data:image\//,
    extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'],
    keywords: ['image', 'picture', 'photo']
  },
  audio: {
    dataUrlPattern: /^data:audio\//,
    extensions: ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'],
    keywords: ['audio', 'sound', 'voice', 'speech', 'wav', 'mp3', 'ogg', 'flac'],
    signatures: {
      raw: ['RIFF', 'ID3', 'OggS', 'fLaC'],
      base64: ['UklGR', 'SUQz', 'T2dnR', 'ZkxhQw']
    }
  },
  video: {
    dataUrlPattern: /^data:video\//,
    extensions: ['.mp4', '.webm', '.avi', '.mov'],
    keywords: ['video', 'movie', 'clip']
  }
};

/**
 * Detects the type of media from the content and metadata
 */
export function detectMediaType(content: string | ArrayBuffer, filename?: string): MediaType {
  // Early validation
  if (!content) {
    return 'unknown';
  }

  // Handle data URLs directly
  if (typeof content === 'string' && content.startsWith('data:')) {
    for (const [type, mapping] of Object.entries(MEDIA_TYPE_MAPPINGS)) {
      if (mapping.dataUrlPattern.test(content)) {
        return type as MediaType;
      }
    }
  }

  // Check if filename has a known extension
  if (filename) {
    const lowerFilename = filename.toLowerCase();
    
    for (const [type, mapping] of Object.entries(MEDIA_TYPE_MAPPINGS)) {
      // Check extensions
      if (mapping.extensions.some(ext => lowerFilename.endsWith(ext))) {
        return type as MediaType;
      }
      
      // Check keywords in filename
      if (mapping.keywords && mapping.keywords.some(keyword => lowerFilename.includes(keyword))) {
        return type as MediaType;
      }
    }
  }

  if (typeof content === 'string') {
    // Handle very short content
    if (content.length < 10) {
      return 'unknown';
    }

    // Check for file signatures in content
    const contentStart = content.substring(0, 100).toUpperCase();
    
    // Check for audio signatures
    const audioSignatures = MEDIA_TYPE_MAPPINGS.audio.signatures;
    if (audioSignatures) {
      // Check raw signatures
      if (audioSignatures.raw.some(sig => 
        contentStart.startsWith(sig) || contentStart.indexOf(sig) < 10)) {
        return 'audio';
      }
      
      // Check base64 signatures
      if (audioSignatures.base64.some(sig => 
        contentStart.startsWith(sig) || contentStart.indexOf(sig) < 10 || contentStart.includes(sig))) {
        return 'audio';
      }
    }

    // Special case for MP3 files with SUQ pattern
    if (contentStart.includes('SUQ') || content.startsWith('SUQ')) {
      return 'audio';
    }

    // Check for content keywords in a sample of the content
    const contentSample = content.substring(0, 500).toLowerCase();
    
    for (const [type, mapping] of Object.entries(MEDIA_TYPE_MAPPINGS)) {
      if (mapping.keywords && mapping.keywords.some(keyword => contentSample.includes(keyword))) {
        return type as MediaType;
      }
    }

    // If content is likely base64 and starts with certain patterns, it's often audio
    if (
      content.length > 100 &&
      content.match(/^[A-Za-z0-9+/=]{100,}$/) &&
      (content.startsWith('SUQz') || // MP3
        content.startsWith('UklGR') || // WAV
        content.startsWith('/+M') || // Common in audio files
        content.startsWith('GkXf'))    // WebM audio
    ) {
      return 'audio';
    }
  }

  // Return unknown if we really can't determine the type
  return 'unknown';
}

/**
 * Helper to check if a string is likely base64 encoded
 */
export function isBase64(str: string): boolean {
  // Quick check for base64 pattern
  const base64Regex = /^[A-Za-z0-9+/=]+$/;
  return base64Regex.test(str) && str.length % 4 === 0;
}

/**
 * Finds media metadata for a base64-encoded media file.
 * Uses the METADATA_PREFIX to look for corresponding metadata in output.metadata.
 */
export function findMediaMetadata(
  metadata: Record<string, any> | undefined,
  varName: string,
): MediaMetadata | null {
  if (!metadata) {
    return null;
  }

  // The metadata key will be in the format: __meta_varName
  const metaKey = `${METADATA_PREFIX}${varName}`;

  // Check if this metadata key exists
  if (metadata[metaKey] && typeof metadata[metaKey] === 'object') {
    return metadata[metaKey] as MediaMetadata;
  }

  return null;
}

/**
 * Gets a data URL from content and metadata
 */
export function getDataUrl(content: string, metadata?: MediaMetadata | null): string {
  if (!content) {
    throw new Error('Empty content provided');
  }

  // If it's already a data URL, return it as is
  if (typeof content === 'string' && content.startsWith('data:')) {
    return content;
  }

  // Handle non-string content (shouldn't normally happen)
  if (typeof content !== 'string') {
    throw new Error('Invalid content format: non-string content provided');
  }

  // If content is not base64 encoded or is very short, try to encode it
  if ((content.length < 10 || !isBase64(content)) && // If the content is clearly not base64, we might need to encode it
    content.length < 1000 && !isBase64(content)) {
      try {
        // Try to encode as base64 if it's plaintext
        content = btoa(content);
      } catch {
        // Continue with original content
      }
    }

  // Detect if content is a WAV file by looking for signatures
  const isWavFile = content.startsWith('RIFF') || content.startsWith('UklGR');

  // Detect if content is an MP3 file by looking for signatures
  const isMp3File = content.startsWith('ID3') || content.startsWith('SUQz');

  // If we have metadata with a MIME type, use it
  if (metadata?.mime) {
    return `data:${metadata.mime};base64,${content}`;
  }

  // If it's a detected audio file without metadata, use the appropriate MIME type
  if (isWavFile) {
    return `data:audio/wav;base64,${content}`;
  }

  if (isMp3File) {
    return `data:audio/mpeg;base64,${content}`;
  }

  // Otherwise try to determine from the content
  const mediaType = detectMediaType(content, metadata?.filename);

  // Default MIME types based on detected media type
  switch (mediaType) {
    case 'audio':
      // Use format from metadata extension if available
      if (metadata?.extension) {
        return `data:audio/${metadata.extension};base64,${content}`;
      }
      return `data:audio/wav;base64,${content}`;
    case 'video':
      return `data:video/mp4;base64,${content}`;
    case 'image':
      return `data:image/jpeg;base64,${content}`;
    default:
      return `data:image/jpeg;base64,${content}`;
  }
}
