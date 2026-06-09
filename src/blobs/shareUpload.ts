import logger from '../logger';
import { collectBlobHashes } from './blobRefs';
import { getBlobByHash, isBlobAllowedForShare } from './index';
import { uploadBlobRemote } from './remoteUpload';

export type RemoteBlobUploadCache = Map<string, Promise<boolean>>;

interface ShareBlobUploadContext {
  localEvalId: string;
  remoteEvalId: string;
  promptIdx?: number;
  testIdx?: number;
}

export function createRemoteBlobUploadCache(): RemoteBlobUploadCache {
  return new Map();
}

async function uploadBlobForShare(
  hash: string,
  cache: RemoteBlobUploadCache,
  context: ShareBlobUploadContext,
): Promise<boolean> {
  const existing = cache.get(hash);
  if (existing) {
    return existing;
  }

  const isAllowed = await isBlobAllowedForShare(hash, context.localEvalId);
  if (!isAllowed) {
    logger.warn('[Share] Skipping blob reference that is not authorized for this eval', {
      evalId: context.localEvalId,
      hash,
    });
    return false;
  }

  const pendingUpload = cache.get(hash);
  if (pendingUpload) {
    return pendingUpload;
  }

  const upload = (async () => {
    try {
      const blob = await getBlobByHash(hash);
      const result = await uploadBlobRemote(blob.data, blob.metadata.mimeType, {
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
      logger.warn('[Share] Failed to upload referenced blob; shared media may be unavailable', {
        error: error instanceof Error ? error.message : String(error),
        evalId: context.remoteEvalId,
        hash,
      });
      return false;
    }
  })();

  cache.set(hash, upload);
  return upload;
}

export async function uploadBlobRefsForShare(
  value: unknown,
  cache: RemoteBlobUploadCache,
  context: ShareBlobUploadContext,
): Promise<void> {
  const hashes = collectBlobHashes(value);
  await Promise.all(Array.from(hashes, (hash) => uploadBlobForShare(hash, cache, context)));
}
