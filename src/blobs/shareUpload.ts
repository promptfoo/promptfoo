import logger from '../logger';
import { collectBlobHashes } from './blobRefs';
import { getBlobByHash } from './index';
import { uploadBlobRemote } from './remoteUpload';

export type RemoteBlobUploadCache = Map<string, Promise<boolean>>;

interface ShareBlobUploadContext {
  evalId: string;
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

  const upload = (async () => {
    try {
      const blob = await getBlobByHash(hash);
      const result = await uploadBlobRemote(blob.data, blob.metadata.mimeType, {
        ...context,
        location: 'share',
        kind: blob.metadata.mimeType.split('/', 1)[0],
      });

      if (!result) {
        logger.warn('[Share] Failed to upload referenced blob; shared media may be unavailable', {
          evalId: context.evalId,
          hash,
        });
        return false;
      }

      return true;
    } catch (error) {
      logger.warn('[Share] Failed to upload referenced blob; shared media may be unavailable', {
        error: error instanceof Error ? error.message : String(error),
        evalId: context.evalId,
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
