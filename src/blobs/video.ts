import { BoundedReadError } from './boundedRead';
import { getBlobByHash, isBlobAllowedForShare } from './index';

const TRUSTED_VIDEO_REQUIRED =
  'Video grading requires a trusted blob from this evaluation result. The blob must have a video MIME type. Legacy storage references and external URLs are unsupported.';

export interface VideoRef {
  blobRef?: { hash?: string; mimeType?: string; sizeBytes?: number };
  storageRef?: { key?: string };
  url?: string;
}

export async function resolveVideoBytes(
  video: VideoRef,
  maxBytes: number,
  result?: { evaluationId?: string; testIdx?: number; promptIdx?: number },
): Promise<{ buffer: Buffer; mimeType: string }> {
  const hash =
    video.blobRef?.hash ||
    (video.url?.startsWith('promptfoo://blob/')
      ? video.url.slice('promptfoo://blob/'.length)
      : undefined);
  // Sharing and grading both send local bytes elsewhere. Require the same trusted provenance.
  const { evaluationId, testIdx, promptIdx } = result ?? {};
  if (
    typeof hash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(hash) ||
    !evaluationId ||
    testIdx === undefined ||
    !Number.isSafeInteger(testIdx) ||
    testIdx < 0 ||
    promptIdx === undefined ||
    !Number.isSafeInteger(promptIdx) ||
    promptIdx < 0 ||
    !(await isBlobAllowedForShare(hash, evaluationId, { testIdx, promptIdx }))
  ) {
    throw new Error(TRUSTED_VIDEO_REQUIRED);
  }
  if ((video.blobRef?.sizeBytes ?? 0) > maxBytes) {
    throw new BoundedReadError('too-large');
  }
  const blob = await getBlobByHash(hash, maxBytes);
  if (!/^video\/[a-z0-9.+-]+$/i.test(blob.metadata.mimeType)) {
    throw new Error(TRUSTED_VIDEO_REQUIRED);
  }
  return { buffer: blob.data, mimeType: blob.metadata.mimeType };
}

export function videoResolutionErrorMessage(error: unknown): string {
  return error instanceof BoundedReadError
    ? new BoundedReadError(error.code).message
    : TRUSTED_VIDEO_REQUIRED;
}
