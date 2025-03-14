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
 * Component to render audio content
 */
const AudioRenderer: React.FC<{
  src: string;
  metadata?: MediaMetadata | null;
  mimeType?: string;
}> = ({ src, metadata, mimeType = 'audio/wav' }) => (
  <div className="audio-output">
    <audio controls style={{ width: '100%' }} data-testid="audio-player">
      <source src={src} type={metadata?.mime || mimeType} />
      Your browser does not support the audio element.
    </audio>
    {metadata && (
      <div className="media-info">
        <strong>File:</strong> {metadata.filename}
        {metadata.transcript && (
          <div className="transcript">
            <strong>Transcript:</strong> {metadata.transcript}
          </div>
        )}
      </div>
    )}
  </div>
);

/**
 * Component to render video content
 */
const VideoRenderer: React.FC<{
  src: string;
  metadata?: MediaMetadata | null;
  maxHeight?: number;
  mimeType?: string;
}> = ({ src, metadata, maxHeight, mimeType = 'video/mp4' }) => (
  <div className="video-output">
    <video controls style={{ width: '100%', maxHeight }} data-testid="video-player">
      <source src={src} type={metadata?.mime || mimeType} />
      Your browser does not support the video element.
    </video>
    {metadata && (
      <div className="media-info">
        <strong>File:</strong> {metadata.filename}
      </div>
    )}
  </div>
);

/**
 * Component to render image content
 */
const ImageRenderer: React.FC<{
  src: string;
  alt: string;
  maxWidth?: number;
  maxHeight?: number;
  onImageClick?: (src: string) => void;
}> = ({ src, alt, maxWidth, maxHeight, onImageClick }) => (
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

/**
 * Component to render error states
 */
const ErrorDisplay: React.FC<{
  error: Error;
  mediaType: string;
  content: string;
  metadata?: MediaMetadata | null;
}> = ({ error, mediaType, content, metadata }) => (
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
  if (!content || content.length === 0) {
    return <div className="error-message">Error: No content to display</div>;
  }

  try {
    const mediaType = detectMediaType(content, metadata?.filename);
    const src = getDataUrl(content, metadata);

    // Check for audio
    if (mediaType === 'audio') {
      return <AudioRenderer src={src} metadata={metadata} />;
    }

    // Check for video
    if (mediaType === 'video') {
      return <VideoRenderer src={src} metadata={metadata} maxHeight={maxHeight} />;
    }

    // Handle unknown media type with metadata hints
    if (mediaType === 'unknown' && metadata?.type) {
      if (metadata.type === 'audio') {
        return <AudioRenderer src={src} metadata={metadata} />;
      } else if (metadata.type === 'video') {
        return <VideoRenderer src={src} metadata={metadata} maxHeight={maxHeight} />;
      }
    }

    // Default to image rendering
    return (
      <ImageRenderer 
        src={src} 
        alt={alt} 
        maxWidth={maxWidth} 
        maxHeight={maxHeight} 
        onImageClick={onImageClick} 
      />
    );
  } catch (error) {
    console.error('MediaRenderer: Error generating data URL', error);
    return (
      <ErrorDisplay 
        error={error as Error} 
        mediaType={detectMediaType(content, metadata?.filename)} 
        content={content} 
        metadata={metadata} 
      />
    );
  }
}

export default MediaRenderer;
