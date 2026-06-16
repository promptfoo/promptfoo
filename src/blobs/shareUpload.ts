import logger from '../logger';
import { BLOB_SCAN_MAX_DEPTH, BLOB_SCAN_MAX_STRING_LENGTH, collectBlobHashes } from './blobRefs';
import { getShareAuthorizedBlob } from './index';
import {
  type RemoteBlobUploadTarget,
  uploadBlobRemote,
  uploadBlobToRemoteTarget,
} from './remoteUpload';

export type RemoteBlobUploadCache = Map<string, Promise<boolean>>;
export type ShareBlobUploader = (
  buffer: Buffer,
  mimeType: string,
  context?: Parameters<typeof uploadBlobRemote>[2],
) => ReturnType<typeof uploadBlobRemote>;

interface ShareBlobUploadContext {
  localEvalId: string;
  remoteEvalId: string;
  promptIdx?: number;
  testIdx?: number;
}

export function createShareBlobUploader(target: RemoteBlobUploadTarget): ShareBlobUploader {
  return (buffer, mimeType, context) => uploadBlobToRemoteTarget(buffer, mimeType, context, target);
}

export function createRemoteBlobUploadCache(): RemoteBlobUploadCache {
  return new Map();
}

async function uploadAuthorizedBlob(
  hash: string,
  context: ShareBlobUploadContext,
  uploader: ShareBlobUploader,
): Promise<boolean> {
  try {
    const blob = await getShareAuthorizedBlob(hash, context.localEvalId);
    if (!blob) {
      return false;
    }

    const result = await uploader(blob.data, blob.metadata.mimeType, {
      evalId: context.remoteEvalId,
      promptIdx: context.promptIdx,
      testIdx: context.testIdx,
      location: 'share',
      kind: blob.metadata.mimeType.split('/', 1)[0],
    });

    if (!result) {
      logger.warn('[Share] Failed to upload referenced blob; shared media may be unavailable', {
        evalId: context.remoteEvalId,
        hash,
      });
      return false;
    }

    return true;
  } catch (error) {
    // Fail closed but keep the share alive: an authorization or upload error skips
    // this blob rather than aborting (and rolling back) the whole share.
    logger.warn('[Share] Failed to upload referenced blob; shared media may be unavailable', {
      error: error instanceof Error ? error.message : String(error),
      evalId: context.remoteEvalId,
      hash,
    });
    return false;
  }
}

function uploadBlobForShare(
  hash: string,
  cache: RemoteBlobUploadCache,
  context: ShareBlobUploadContext,
  uploader: ShareBlobUploader,
): Promise<boolean> {
  let pending = cache.get(hash);
  if (!pending) {
    // Cache the whole authorize-and-upload flow synchronously so concurrent and
    // repeated references to the same hash share one authorization check and one upload.
    pending = uploadAuthorizedBlob(hash, context, uploader);
    cache.set(hash, pending);
  }
  return pending;
}

export async function uploadBlobRefsForShare(
  value: unknown,
  cache: RemoteBlobUploadCache,
  context: ShareBlobUploadContext,
  uploader: ShareBlobUploader = uploadBlobRemote,
): Promise<void> {
  const hashes = collectBlobHashes(value, {
    maxDepth: BLOB_SCAN_MAX_DEPTH,
    maxStringLength: BLOB_SCAN_MAX_STRING_LENGTH,
  });
  await Promise.all(
    Array.from(hashes, (hash) => uploadBlobForShare(hash, cache, context, uploader)),
  );
}
