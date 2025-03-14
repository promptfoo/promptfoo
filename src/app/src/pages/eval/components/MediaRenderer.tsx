import React from 'react';
import { type MediaMetadata } from '@promptfoo/types';
import { METADATA_PREFIX } from '@promptfoo/constants';

// Define the MediaType type
type MediaType = 'audio' | 'video' | 'image' | 'unknown';

export interface MediaRendererProps {
  content: string;
  metadata?: MediaMetadata | null;
  alt?: string;
  maxWidth?: number;
  maxHeight?: number;
  onImageClick?: (url: string) => void;
}

/**
 * Detects the type of media from the content and metadata
 */
export function detectMediaType(content: string | ArrayBuffer, filename?: string): MediaType {
  console.log(`MediaRenderer: Detecting media type for ${filename || 'content'}`);
  
  // Check if filename has a known extension
  if (filename) {
    const lowerFilename = filename.toLowerCase();
    
    // Check for image extensions
    if (lowerFilename.endsWith('.png') || lowerFilename.endsWith('.jpg') || 
        lowerFilename.endsWith('.jpeg') || lowerFilename.endsWith('.gif') || 
        lowerFilename.endsWith('.webp') || lowerFilename.endsWith('.svg')) {
      console.log(`MediaRenderer: Detected image type from filename: ${filename}`);
      return 'image';
    }
    
    // Check for audio extensions
    if (lowerFilename.endsWith('.mp3') || lowerFilename.endsWith('.wav') || 
        lowerFilename.endsWith('.ogg') || lowerFilename.endsWith('.m4a') || 
        lowerFilename.endsWith('.flac') || lowerFilename.endsWith('.aac')) {
      console.log(`MediaRenderer: Detected audio type from filename: ${filename}`);
      return 'audio';
    }
    
    // Check for video extensions
    if (lowerFilename.endsWith('.mp4') || lowerFilename.endsWith('.webm') || 
        lowerFilename.endsWith('.avi') || lowerFilename.endsWith('.mov')) {
      console.log(`MediaRenderer: Detected video type from filename: ${filename}`);
      return 'video';
    }
    
    // Check if filename contains audio or audio_
    if (lowerFilename.includes('audio') || lowerFilename.includes('sound') || 
        lowerFilename.includes('voice') || lowerFilename.includes('speech')) {
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
    
    // Check for common audio file signatures (WAV, MP3, FLAC, etc.)
    // WAV files typically start with "RIFF" or "UklGRg"
    if (content.startsWith('RIFF') || content.startsWith('UklGR')) {
      console.log('MediaRenderer: Detected WAV file from signature');
      return 'audio';
    }
    
    // MP3 files often start with "ID3" or "SUQz"
    if (content.startsWith('ID3') || content.startsWith('SUQz')) {
      console.log('MediaRenderer: Detected MP3 file from signature');
      return 'audio';
    }
    
    // FLAC files start with "fLaC" or "ZkxhQw"
    if (content.startsWith('fLaC') || content.startsWith('ZkxhQw')) {
      console.log('MediaRenderer: Detected FLAC file from signature');
      return 'audio';
    }
    
    // OGG files start with "OggS" or "T2dnR"
    if (content.startsWith('OggS') || content.startsWith('T2dnR')) {
      console.log('MediaRenderer: Detected OGG file from signature');
      return 'audio';
    }
    
    // Try to detect from content keywords
    const contentSample = content.substring(0, 100).toLowerCase();
    
    if (contentSample.includes('audio') || 
        contentSample.includes('wav') || 
        contentSample.includes('mp3') || 
        contentSample.includes('ogg') || 
        contentSample.includes('flac')) {
      console.log('MediaRenderer: Detected audio from content keywords');
      return 'audio';
    }
  }

  // Check if we have additional information about the content
  console.log('MediaRenderer: Could not detect specific type, showing first 20 chars of content:', 
    typeof content === 'string' ? content.substring(0, 20) : 'non-string content');

  // Default to image for backward compatibility
  return 'image';
}

/**
 * Finds media metadata for a base64-encoded media file.
 * Uses the METADATA_PREFIX to look for corresponding metadata in output.metadata.
 */
export function findMediaMetadata(
  metadata: Record<string, any> | undefined,
  varName: string
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
      filename: mediaMetadata.filename
    });
    
    // Return the metadata object that should match the MediaMetadata interface
    return mediaMetadata;
  }
  
  return null;
}

/**
 * Gets a data URL from content and metadata
 */
export function getDataUrl(
  content: string, 
  metadata?: MediaMetadata | null
): string {
  console.log('MediaRenderer.getDataUrl:', { 
    contentLength: content?.length,
    hasMetadata: !!metadata,
    mimeType: metadata?.mime,
    filename: metadata?.filename,
    contentStart: typeof content === 'string' ? content.substring(0, 20) : 'non-string content'
  });

  // Helper function to check if a string is likely base64 encoded
  function isBase64(str: string): boolean {
    // Quick check for base64 pattern
    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    return base64Regex.test(str) && str.length % 4 === 0;
  }

  // If it's already a data URL, return it
  if (typeof content === 'string' && content.startsWith('data:')) {
    console.log('MediaRenderer: Content is already a data URL');
    return content;
  }

  // If content is not base64 encoded or is very short, log a warning
  if (typeof content === 'string' && (content.length < 10 || !isBase64(content))) {
    console.warn('MediaRenderer: Content does not appear to be valid base64', { 
      contentSample: content.substring(0, 30),
      length: content.length
    });
  }

  // Detect if content is a WAV file by looking for signatures
  const isWavFile = typeof content === 'string' && 
    (content.startsWith('RIFF') || content.startsWith('UklGR'));
    
  // Detect if content is an MP3 file by looking for signatures
  const isMp3File = typeof content === 'string' && 
    (content.startsWith('ID3') || content.startsWith('SUQz'));

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
    default:
      return `data:image/jpeg;base64,${content}`;
  }
}

/**
 * A component that renders different types of media content (images, audio, video)
 * based on the content and metadata.
 */
function MediaRenderer({
  content,
  metadata,
  alt = 'Media content',
  maxWidth = 800,
  maxHeight = 600,
  onImageClick,
}: MediaRendererProps) {
  const mediaType = detectMediaType(content, metadata?.filename);
  
  // Log more details for debugging
  console.log('MediaRenderer: Rendering content with detected type', {
    mediaType,
    hasMetadata: !!metadata,
    mimeType: metadata?.mime,
    filename: metadata?.filename,
    contentLength: content?.length || 0,
    contentStart: typeof content === 'string' && content?.length > 0 ? content.substring(0, 30) : 'empty content'
  });

  // Basic validation
  if (!content || content.length === 0) {
    console.error('MediaRenderer: Empty content provided');
    return <div className="error-message">Error: No content to display</div>;
  }
  
  // Determine the correct data URL
  try {
    const src = getDataUrl(content, metadata);
    
    // Render audio player
    if (mediaType === 'audio') {
      console.log('MediaRenderer: Rendering audio player with source', { 
        srcLength: src?.length || 0,
        mimeType: metadata?.mime || 'audio/wav' 
      });
      
      return (
        <div className="audio-output">
          <audio controls style={{ width: '100%' }} data-testid="audio-player">
            <source
              src={src}
              type={metadata?.mime || 'audio/wav'}
            />
            Your browser does not support the audio element.
          </audio>
          {metadata && (
            <div className="media-info">
              <strong>File:</strong> {metadata.filename}
              {/* Display transcript if available in metadata */}
              {metadata.transcript && (
                <div className="transcript">
                  <strong>Transcript:</strong> {metadata.transcript}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
    
    // Render video player
    if (mediaType === 'video') {
      return (
        <div className="video-output">
          <video controls style={{ width: '100%', maxHeight }} data-testid="video-player">
            <source
              src={src}
              type={metadata?.mime || 'video/mp4'}
            />
            Your browser does not support the video element.
          </video>
          {metadata && (
            <div className="media-info">
              <strong>File:</strong> {metadata.filename}
            </div>
          )}
        </div>
      );
    }
    
    // Default to image for unknown or image media types
    return (
      <img
        src={src}
        alt={alt}
        style={{ 
          maxWidth: maxWidth || '100%', 
          maxHeight: maxHeight || 'auto', 
          cursor: onImageClick ? 'pointer' : 'default'
        }}
        onClick={onImageClick ? () => onImageClick(src) : undefined}
      />
    );
  } catch (error) {
    console.error('MediaRenderer: Error generating data URL', error);
    return <div className="error-message">Error displaying media: {String(error)}</div>;
  }
}

export default MediaRenderer; 