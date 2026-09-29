import { getBlobByHash, isBlobAllowedForShare } from '../blobs';
import { BoundedReadError } from '../storage/boundedRead';

// Conservative per-request budget for video grading, including base64 and prompt overhead.
export const VIDEO_INLINE_LIMIT_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = Math.floor((VIDEO_INLINE_LIMIT_BYTES - 1) / 4) * 3;
const TRUSTED_VIDEO_REQUIRED =
  'Video grading requires a trusted blob from this evaluation. The blob must have a video MIME type. Legacy storage references and external URLs are unsupported.';

export interface VideoRef {
  blobRef?: { hash?: string; mimeType?: string; sizeBytes?: number };
  storageRef?: { key?: string };
  url?: string;
}

export async function resolveVideoBytes(
  video: VideoRef,
  evalId?: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const hash =
    video.blobRef?.hash ||
    (video.url?.startsWith('promptfoo://blob/')
      ? video.url.slice('promptfoo://blob/'.length)
      : undefined);
  // Sharing and grading both send local bytes elsewhere. Require the same trusted provenance.
  if (!hash || !evalId || !(await isBlobAllowedForShare(hash, evalId))) {
    throw new Error(TRUSTED_VIDEO_REQUIRED);
  }
  if ((video.blobRef?.sizeBytes ?? 0) > MAX_VIDEO_BYTES) {
    throw new BoundedReadError('too-large');
  }
  const blob = await getBlobByHash(hash, MAX_VIDEO_BYTES);
  if (!/^video\/[a-z0-9.+-]+$/i.test(blob.metadata.mimeType)) {
    throw new Error(TRUSTED_VIDEO_REQUIRED);
  }
  return { buffer: blob.data, mimeType: blob.metadata.mimeType };
}

export function videoResolutionErrorMessage(error: unknown): string {
  return error instanceof BoundedReadError ? error.message : TRUSTED_VIDEO_REQUIRED;
}
