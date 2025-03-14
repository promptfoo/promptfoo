import { METADATA_PREFIX } from '@promptfoo/constants';
import { type MediaMetadata } from '@promptfoo/types';

// Define the MediaType type
export type MediaType = 'audio' | 'video' | 'image' | 'unknown';

/**
 * Detects the type of media from the content and metadata
 */
export function detectMediaType(content: string | ArrayBuffer, filename?: string): MediaType {
  console.log(`MediaRenderer: Detecting media type for ${filename || 'content'}`);

  // Early validation
  if (!content) {
    console.warn('MediaRenderer: Empty content provided for type detection');
    return 'unknown';
  }

  // Handle data URLs directly
  if (typeof content === 'string' && content.startsWith('data:')) {
    if (content.startsWith('data:image/')) {
      console.log('MediaRenderer: Detected image from data URL');
      return 'image';
    }
    if (content.startsWith('data:audio/')) {
      console.log('MediaRenderer: Detected audio from data URL');
      return 'audio';
    }
    if (content.startsWith('data:video/')) {
      console.log('MediaRenderer: Detected video from data URL');
      return 'video';
    }
    console.log('MediaRenderer: Detected data URL but unknown type');
  }

  // Check if filename has a known extension
  if (filename) {
    const lowerFilename = filename.toLowerCase();

    // Check for image extensions
    if (
      lowerFilename.endsWith('.png') ||
      lowerFilename.endsWith('.jpg') ||
      lowerFilename.endsWith('.jpeg') ||
      lowerFilename.endsWith('.gif') ||
      lowerFilename.endsWith('.webp') ||
      lowerFilename.endsWith('.svg')
    ) {
      console.log(`MediaRenderer: Detected image type from filename: ${filename}`);
      return 'image';
    }

    // Check for audio extensions
    if (
      lowerFilename.endsWith('.mp3') ||
      lowerFilename.endsWith('.wav') ||
      lowerFilename.endsWith('.ogg') ||
      lowerFilename.endsWith('.m4a') ||
      lowerFilename.endsWith('.flac') ||
      lowerFilename.endsWith('.aac')
    ) {
      console.log(`MediaRenderer: Detected audio type from filename: ${filename}`);
      return 'audio';
    }

    // Check for video extensions
    if (
      lowerFilename.endsWith('.mp4') ||
      lowerFilename.endsWith('.webm') ||
      lowerFilename.endsWith('.avi') ||
      lowerFilename.endsWith('.mov')
    ) {
      console.log(`MediaRenderer: Detected video type from filename: ${filename}`);
      return 'video';
    }

    // Check if filename contains audio or audio_
    if (
      lowerFilename.includes('audio') ||
      lowerFilename.includes('sound') ||
      lowerFilename.includes('voice') ||
      lowerFilename.includes('speech')
    ) {
      console.log(`MediaRenderer: Detected audio type from filename keyword: ${filename}`);
      return 'audio';
    }
  }

  if (typeof content === 'string') {
    // Check if it's already a data URL
    if (content.startsWith('data:')) {
      if (content.startsWith('data:image/')) {
        console.log('MediaRenderer: Detected image from data URL');
        return 'image';
      }
      if (content.startsWith('data:audio/')) {
        console.log('MediaRenderer: Detected audio from data URL');
        return 'audio';
      }
      if (content.startsWith('data:video/')) {
        console.log('MediaRenderer: Detected video from data URL');
        return 'video';
      }
    }

    // Handle very short content
    if (content.length < 10) {
      console.warn('MediaRenderer: Content too short for reliable type detection', {
        contentLength: content.length,
        contentSample: content,
      });
      return 'unknown';
    }

    // Check for common audio file signatures (WAV, MP3, FLAC, etc.)
    // Match case-insensitive at beginning for Base64 data that might be slightly corrupted
    const contentStart = content.substring(0, 100).toUpperCase();

    // WAV files typically start with "RIFF" or "UklGR" (base64 encoded)
    if (
      contentStart.startsWith('RIFF') ||
      contentStart.startsWith('UKIGR') ||
      contentStart.indexOf('RIFF') < 10 ||
      contentStart.indexOf('UKIGR') < 10
    ) {
      console.log('MediaRenderer: Detected WAV file from signature');
      return 'audio';
    }

    // MP3 files often start with "ID3" or "SUQz" (base64 encoded)
    if (
      contentStart.startsWith('ID3') ||
      contentStart.startsWith('SUQZ') ||
      contentStart.indexOf('ID3') < 10 ||
      contentStart.indexOf('SUQZ') < 10 ||
      // Additional check for SUQz pattern which is common in MP3 files
      contentStart.includes('SUQ') ||
      content.startsWith('SUQ')
    ) {
      console.log('MediaRenderer: Detected MP3 file from signature');
      return 'audio';
    }

    // FLAC files start with "fLaC" or "ZkxhQw" (base64 encoded)
    if (contentStart.includes('FLAC') || contentStart.includes('ZKXHQW')) {
      console.log('MediaRenderer: Detected FLAC file from signature');
      return 'audio';
    }

    // OGG files start with "OggS" or "T2dnR" (base64 encoded)
    if (contentStart.includes('OGGS') || contentStart.includes('T2DNR')) {
      console.log('MediaRenderer: Detected OGG file from signature');
      return 'audio';
    }

    // Try to detect from content keywords
    const contentSample = content.substring(0, 500).toLowerCase();

    if (
      contentSample.includes('audio') ||
      contentSample.includes('wav') ||
      contentSample.includes('mp3') ||
      contentSample.includes('ogg') ||
      contentSample.includes('flac') ||
      contentSample.includes('sound') ||
      contentSample.includes('voice')
    ) {
      console.log('MediaRenderer: Detected audio from content keywords');
      return 'audio';
    }

    // If content is likely base64 and starts with certain patterns, it's often audio
    if (
      content.length > 100 &&
      content.match(/^[A-Za-z0-9+/=]{100,}$/) &&
      (content.startsWith('SUQz') || // MP3
        content.startsWith('UklGR') || // WAV
        content.startsWith('/+M') || // Common in audio files
        content.startsWith('GkXf'))
    ) {
      // WebM audio
      console.log('MediaRenderer: Detected likely audio from base64 pattern');
      return 'audio';
    }
  }

  // Check if we have additional information about the content
  console.log(
    'MediaRenderer: Could not detect specific type, showing first 20 chars of content:',
    typeof content === 'string' ? content.substring(0, 20) : 'non-string content',
  );

  // Return unknown if we really can't determine the type
  return 'unknown';
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
    // Log for debugging
    const mediaMetadata = metadata[metaKey] as MediaMetadata;
    console.log('MediaRenderer: Found metadata for variable', {
      varName,
      mediaType: mediaMetadata.type,
      mimeType: mediaMetadata.mime,
      filename: mediaMetadata.filename,
    });

    // Return the metadata object that should match the MediaMetadata interface
    return mediaMetadata;
  }

  return null;
}

/**
 * Gets a data URL from content and metadata
 */
export function getDataUrl(content: string, metadata?: MediaMetadata | null): string {
  if (!content) {
    console.error('MediaRenderer.getDataUrl: Empty content provided');
    throw new Error('Empty content provided');
  }

  console.log('MediaRenderer.getDataUrl:', {
    contentLength: content?.length,
    hasMetadata: !!metadata,
    mimeType: metadata?.mime,
    filename: metadata?.filename,
    contentStart:
      typeof content === 'string' && content.length > 0
        ? content.substring(0, 20)
        : 'empty content',
  });

  // If it's already a data URL, return it as is
  if (typeof content === 'string' && content.startsWith('data:')) {
    console.log('MediaRenderer: Content is already a data URL, returning as is');
    return content;
  }

  // Helper function to check if a string is likely base64 encoded
  function isBase64(str: string): boolean {
    // Quick check for base64 pattern
    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    return base64Regex.test(str) && str.length % 4 === 0;
  }

  // Handle non-string content (shouldn't normally happen)
  if (typeof content !== 'string') {
    console.error('MediaRenderer: Non-string content provided', { contentType: typeof content });
    throw new Error('Invalid content format: non-string content provided');
  }

  // If content is not base64 encoded or is very short, log a warning
  if (content.length < 10 || !isBase64(content)) {
    console.warn('MediaRenderer: Content does not appear to be valid base64', {
      contentSample: content.substring(0, 30),
      length: content.length,
    });

    // If the content is clearly not base64, we might need to encode it
    if (content.length < 1000 && !isBase64(content)) {
      try {
        // Try to encode as base64 if it's plaintext
        console.log('MediaRenderer: Attempting to encode content as base64');
        content = btoa(content);
      } catch (e) {
        console.warn('MediaRenderer: Failed to encode content as base64', e);
        // Continue with original content
      }
    }
  }

  // Detect if content is a WAV file by looking for signatures
  const isWavFile = content.startsWith('RIFF') || content.startsWith('UklGR');

  // Detect if content is an MP3 file by looking for signatures
  const isMp3File = content.startsWith('ID3') || content.startsWith('SUQz');

  // If we have metadata with a MIME type, use it
  if (metadata?.mime) {
    console.log(`MediaRenderer: Using MIME type from metadata: ${metadata.mime}`);
    return `data:${metadata.mime};base64,${content}`;
  }

  // If it's a detected audio file without metadata, use the appropriate MIME type
  if (isWavFile) {
    console.log('MediaRenderer: Using audio/wav MIME type based on WAV file signature');
    return `data:audio/wav;base64,${content}`;
  }

  if (isMp3File) {
    console.log('MediaRenderer: Using audio/mp3 MIME type based on MP3 file signature');
    return `data:audio/mpeg;base64,${content}`;
  }

  // Otherwise try to determine from the content
  const mediaType = detectMediaType(content, metadata?.filename);
  console.log(`MediaRenderer: Detected media type: ${mediaType}`);

  // Default MIME types based on detected media type
  switch (mediaType) {
    case 'audio':
      // Use format from metadata extension if available
      if (metadata?.extension) {
        console.log(`MediaRenderer: Using audio format from extension: ${metadata.extension}`);
        return `data:audio/${metadata.extension};base64,${content}`;
      }
      return `data:audio/wav;base64,${content}`;
    case 'video':
      return `data:video/mp4;base64,${content}`;
    case 'image':
      return `data:image/jpeg;base64,${content}`;
    default:
      console.warn('MediaRenderer: Unknown media type, defaulting to image/jpeg');
      return `data:image/jpeg;base64,${content}`;
  }
}
