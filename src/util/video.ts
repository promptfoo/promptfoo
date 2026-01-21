/**
 * Video resolution utilities for the video-rubric assertion.
 *
 * This module provides functions to resolve video data from various sources:
 * - Blob storage (blobRef) - used by Google Veo, Bedrock Luma Ray, Nova Reel
 * - Media storage (storageRef) - used by OpenAI Sora, Azure video
 * - S3 URLs - used as fallback by Bedrock providers
 */

import logger from '../logger';
import { retrieveMedia } from '../storage';
import { fetchWithProxy } from './fetch/index';

import type { BlobRef } from '../blobs/types';

/**
 * Maximum video size (in bytes) that can be sent inline to Gemini.
 * Videos larger than this require the File API (not yet supported).
 */
export const VIDEO_INLINE_LIMIT_BYTES = 20 * 1024 * 1024; // 20MB

export interface VideoRef {
  blobRef?: BlobRef;
  storageRef?: { key?: string };
  url?: string;
}

export interface ResolvedVideo {
  buffer: Buffer;
  mimeType: string;
}

/**
 * Resolves video data from various storage mechanisms.
 *
 * Priority order:
 * 1. blobRef - blob storage (most common for modern providers)
 * 2. storageRef - media file storage (Sora, Azure)
 * 3. url - S3/HTTPS URL fallback
 */
export async function resolveVideoBytes(video: VideoRef): Promise<ResolvedVideo> {
  // Try blob storage first (Veo, Luma Ray, Nova Reel)
  if (video.blobRef?.hash) {
    logger.debug('[VideoRubric] Resolving video from blob storage', {
      hash: video.blobRef.hash,
      mimeType: video.blobRef.mimeType,
    });
    const { getBlobByHash } = await import('../blobs');
    const blob = await getBlobByHash(video.blobRef.hash);
    return {
      buffer: blob.data,
      mimeType: blob.metadata.mimeType || 'video/mp4',
    };
  }

  // Try media storage (Sora, Azure)
  if (video.storageRef?.key) {
    logger.debug('[VideoRubric] Resolving video from media storage', {
      key: video.storageRef.key,
    });
    const buffer = await retrieveMedia(video.storageRef.key);
    // Extract format from key (e.g., "video/abc123.mp4" -> "mp4")
    const format = video.storageRef.key.split('.').pop() || 'mp4';
    return {
      buffer,
      mimeType: `video/${format}`,
    };
  }

  // Try URL (S3 or HTTPS)
  if (video.url) {
    // Check if it's a blob URI (promptfoo://blob/<hash>)
    if (video.url.startsWith('promptfoo://blob/')) {
      const hash = video.url.replace('promptfoo://blob/', '');
      logger.debug('[VideoRubric] Resolving video from blob URI', { hash });
      const { getBlobByHash } = await import('../blobs');
      const blob = await getBlobByHash(hash);
      return {
        buffer: blob.data,
        mimeType: blob.metadata.mimeType || 'video/mp4',
      };
    }

    // Check if it's a storageRef URL (storageRef:video/abc123.mp4)
    if (video.url.startsWith('storageRef:')) {
      const key = video.url.replace('storageRef:', '');
      logger.debug('[VideoRubric] Resolving video from storageRef URL', { key });
      const buffer = await retrieveMedia(key);
      const format = key.split('.').pop() || 'mp4';
      return {
        buffer,
        mimeType: `video/${format}`,
      };
    }

    // Download from URL (S3 or HTTPS)
    logger.debug('[VideoRubric] Downloading video from URL', { url: video.url });
    return downloadVideoFromUrl(video.url);
  }

  throw new Error(
    '[VideoRubric] No valid video source found. Expected blobRef, storageRef, or url.',
  );
}

/**
 * Downloads video from a URL (S3 presigned URL or HTTPS).
 */
async function downloadVideoFromUrl(url: string): Promise<ResolvedVideo> {
  // For S3 URLs, we can use fetchWithProxy which works with presigned S3 URLs
  const response = await fetchWithProxy(url);

  if (!response.ok) {
    throw new Error(
      `[VideoRubric] Failed to download video from URL: ${response.status} ${response.statusText}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Get mime type from response headers or default to mp4
  const contentType = response.headers.get('content-type') || 'video/mp4';

  return {
    buffer,
    mimeType: contentType,
  };
}

/**
 * Converts video buffer to base64 for inline embedding in Gemini requests.
 */
export function videoToBase64(buffer: Buffer): string {
  return buffer.toString('base64');
}

/**
 * Gets the appropriate MIME type for a video format.
 */
export function getVideoMimeType(format?: string): string {
  const formatMap: Record<string, string> = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
  };
  return formatMap[format?.toLowerCase() || 'mp4'] || 'video/mp4';
}

/**
 * Checks if a video size is within the inline limit for Gemini.
 * Videos under 20MB can be sent inline; larger videos need the File API.
 */
export function isWithinInlineLimit(buffer: Buffer): boolean {
  return buffer.length < VIDEO_INLINE_LIMIT_BYTES;
}
