import React from 'react';
import { type MediaMetadata } from '@promptfoo/types';
import { detectMediaType, getDataUrl } from './MediaUtils';

export interface MediaRendererProps {
  content: string;
  metadata?: MediaMetadata | null;
  alt?: string;
  maxWidth?: number;
  maxHeight?: number;
  onImageClick?: (url: string) => void;
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
    contentStart:
      typeof content === 'string' && content?.length > 0
        ? content.substring(0, 30)
        : 'empty content',
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
        mimeType: metadata?.mime || 'audio/wav',
      });

      return (
        <div className="audio-output">
          <audio controls style={{ width: '100%' }} data-testid="audio-player">
            <source src={src} type={metadata?.mime || 'audio/wav'} />
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
            <source src={src} type={metadata?.mime || 'video/mp4'} />
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

    // If mediaType is unknown but we have metadata, try to use the metadata type
    if (mediaType === 'unknown' && metadata?.type) {
      if (metadata.type === 'audio') {
        console.log('MediaRenderer: Using audio type from metadata');
        return (
          <div className="audio-output">
            <audio controls style={{ width: '100%' }} data-testid="audio-player">
              <source src={src} type={metadata.mime || 'audio/wav'} />
              Your browser does not support the audio element.
            </audio>
            {metadata.transcript && (
              <div className="transcript">
                <strong>Transcript:</strong> {metadata.transcript}
              </div>
            )}
          </div>
        );
      } else if (metadata.type === 'video') {
        console.log('MediaRenderer: Using video type from metadata');
        return (
          <div className="video-output">
            <video controls style={{ width: '100%', maxHeight }} data-testid="video-player">
              <source src={src} type={metadata.mime || 'video/mp4'} />
              Your browser does not support the video element.
            </video>
          </div>
        );
      }
    }

    // Default to image for image media types or if we couldn't determine
    console.log('MediaRenderer: Rendering as image', {
      mediaType,
      src: src.substring(0, 50) + '...',
    });
    return (
      <img
        src={src}
        alt={alt}
        style={{
          maxWidth: maxWidth || '100%',
          maxHeight: maxHeight || 'auto',
          cursor: onImageClick ? 'pointer' : 'default',
        }}
        onClick={onImageClick ? () => onImageClick(src) : undefined}
      />
    );
  } catch (error) {
    console.error('MediaRenderer: Error generating data URL', error);
    return (
      <div className="error-message">
        <p>Error displaying media: {String(error)}</p>
        <details>
          <summary>Details</summary>
          <p>Media type: {mediaType}</p>
          <p>Content length: {content?.length || 0}</p>
          {metadata && (
            <>
              <p>MIME type: {metadata.mime || 'none'}</p>
              <p>Filename: {metadata.filename || 'none'}</p>
            </>
          )}
        </details>
      </div>
    );
  }
}

export default MediaRenderer;
