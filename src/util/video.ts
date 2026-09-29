import { getBlobByHash } from '../blobs';
import { retrieveMedia } from '../storage';
import { BoundedReadError } from '../storage/boundedRead';

// Conservative per-request budget for video grading, including base64 and prompt overhead.
export const VIDEO_INLINE_LIMIT_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = Math.floor((VIDEO_INLINE_LIMIT_BYTES - 1) / 4) * 3;

export interface VideoRef {
  blobRef?: { hash?: string; mimeType?: string; sizeBytes?: number };
  storageRef?: { key?: string };
  url?: string;
}

export async function resolveVideoBytes(
  video: VideoRef,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const hash =
    video.blobRef?.hash ||
    (video.url?.startsWith('promptfoo://blob/')
      ? video.url.slice('promptfoo://blob/'.length)
      : undefined);
  if (hash) {
    if ((video.blobRef?.sizeBytes ?? 0) > MAX_VIDEO_BYTES) {
      throw new BoundedReadError('too-large');
    }
    const blob = await getBlobByHash(hash, MAX_VIDEO_BYTES);
    return {
      buffer: blob.data,
      mimeType: blob.metadata.mimeType || video.blobRef?.mimeType || 'video/mp4',
    };
  }
  const key =
    video.storageRef?.key ||
    (video.url?.startsWith('storageRef:') ? video.url.slice('storageRef:'.length) : undefined);
  if (key) {
    return {
      buffer: await retrieveMedia(key, MAX_VIDEO_BYTES),
      mimeType: getVideoMimeType(key.split('.').pop()),
    };
  }
  throw new Error('Video grading requires a managed blob or media storage reference');
}

export function getVideoMimeType(format?: string): string {
  const formats: Record<string, string> = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    avi: 'video/avi',
    mkv: 'video/x-matroska',
  };
  return formats[format?.toLowerCase() || 'mp4'] || 'video/mp4';
}

export function videoResolutionErrorMessage(error: unknown): string {
  return error instanceof BoundedReadError ? error.message : 'Failed to resolve managed video';
}
