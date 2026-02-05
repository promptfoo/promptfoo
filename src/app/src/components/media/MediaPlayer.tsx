/**
 * Reusable media player components that handle both storage refs and base64 data.
 *
 * Usage:
 *   import { AudioPlayer, ImageDisplay, VideoPlayer } from '@app/components/media';
 *
 *   // Automatically handles storageRef:xxx or base64 data
 *   <AudioPlayer data={audioData} format="mp3" />
 *   <ImageDisplay data={imageData} format="png" />
 *   <VideoPlayer data={videoData} format="mp4" />
 *
 * How it works:
 * - For storage refs: Uses direct URL `/api/media/:key` (server handles serving or redirecting)
 * - For base64 data: Creates data URL inline
 *
 * This approach works for:
 * - OSS (local): Server serves files directly from ~/.promptfoo/media/
 * - On-prem: Server redirects to customer's S3/GCS presigned URL
 * - Cloud: Server redirects to Promptfoo's storage presigned URL
 */

import React from 'react';

import {
  resolveAudioUrlSync,
  resolveImageUrlSync,
  resolveVideoUrlSync,
} from '@app/utils/mediaStorage';

interface MediaPlayerProps {
  /** The media data - either a storageRef:xxx string or base64 data */
  data: string;
  /** Format/extension (e.g., 'mp3', 'wav', 'png', 'mp4') */
  format?: string;
  /** Optional style override */
  style?: React.CSSProperties;
  /** Optional test ID for testing */
  testId?: string;
}

interface AudioPlayerProps extends MediaPlayerProps {
  /** Optional transcript to display below the player */
  transcript?: string;
}

/**
 * Audio player that handles both storage refs and base64 data.
 *
 * For storage refs, it uses a direct URL that the browser can stream.
 * The server will either serve the file directly (OSS) or redirect to
 * a presigned URL (cloud/on-prem).
 */
export function AudioPlayer({ data, format = 'mp3', style, testId, transcript }: AudioPlayerProps) {
  const audioUrl = resolveAudioUrlSync(data, format);

  if (!audioUrl) {
    return <span className="text-xs text-destructive">Failed to load audio</span>;
  }

  return (
    <div className="audio-output">
      <audio
        controls
        style={style || { width: '100%', maxWidth: '500px' }}
        data-testid={testId || 'audio-player'}
      >
        <source src={audioUrl} type={`audio/${format}`} />
        Your browser does not support the audio element.
      </audio>
      {transcript && (
        <div className="transcript" style={{ marginTop: '4px', fontSize: '0.875rem' }}>
          <strong>Transcript:</strong> {transcript}
        </div>
      )}
    </div>
  );
}

/**
 * Image display that handles both storage refs and base64 data.
 */
export function ImageDisplay({
  data,
  format = 'png',
  style,
  testId,
  onClick,
  alt,
}: MediaPlayerProps & {
  onClick?: () => void;
  alt?: string;
}) {
  const imageUrl = resolveImageUrlSync(data, format);

  if (!imageUrl) {
    return <span className="text-xs text-destructive">Failed to load image</span>;
  }

  return (
    <img
      src={imageUrl}
      alt={alt || 'Media content'}
      style={
        style || {
          maxWidth: '100%',
          maxHeight: '300px',
          cursor: onClick ? 'pointer' : 'default',
        }
      }
      onClick={onClick}
      data-testid={testId || 'image-display'}
    />
  );
}

/**
 * Video player that handles both storage refs and base64 data.
 */
export function VideoPlayer({ data, format = 'mp4', style, testId }: MediaPlayerProps) {
  const videoUrl = resolveVideoUrlSync(data, format);

  if (!videoUrl) {
    return <span className="text-xs text-destructive">Failed to load video</span>;
  }

  return (
    <video
      controls
      style={style || { maxWidth: '100%', maxHeight: '300px' }}
      data-testid={testId || 'video-player'}
    >
      <source src={videoUrl} type={`video/${format}`} />
      Your browser does not support the video element.
    </video>
  );
}

export default { AudioPlayer, ImageDisplay, VideoPlayer };
