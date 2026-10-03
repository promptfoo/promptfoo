import async from 'async';
import logger from '../logger';
import { BLOB_SCAN_MAX_DEPTH, BLOB_SCAN_MAX_STRING_LENGTH, collectBlobHashes } from './blobRefs';
import { getShareAuthorizedBlob } from './index';
import { type RemoteBlobUploadTarget, uploadBlobRemote } from './remoteUpload';

export class RemoteBlobUploadCache extends Map<string, Promise<boolean>> {
  readonly resultContexts = new Map<
    string,
    Map<string, ShareBlobUploadContext & { needsUpload: boolean }>
  >();
}
interface ShareBlobUploadContext {
  localEvalId: string;
  remoteEvalId: string;
  promptIdx?: number;
  testIdx?: number;
}

export function createRemoteBlobUploadCache(): RemoteBlobUploadCache {
  return new RemoteBlobUploadCache();
}

// Upload once per result row; the receiver deduplicates bytes while retaining row ownership.
// Index 0 must stay distinct from a reference without coordinates.
function getUploadCacheKey(hash: string, context: ShareBlobUploadContext): string {
  return JSON.stringify({
    hash,
    remoteEvalId: context.remoteEvalId,
    promptIdx: context.promptIdx ?? null,
    testIdx: context.testIdx ?? null,
  });
}

async function uploadAuthorizedBlob(
  hash: string,
  context: ShareBlobUploadContext,
  target?: RemoteBlobUploadTarget,
): Promise<boolean> {
  try {
    const blob = await getShareAuthorizedBlob(hash, context.localEvalId);
    if (!blob) {
      return false;
    }

    const remoteContext = {
      evalId: context.remoteEvalId,
      promptIdx: context.promptIdx,
      testIdx: context.testIdx,
      location: 'share',
      kind: blob.metadata.mimeType.split('/', 1)[0],
    };
    const result = target
      ? await uploadBlobRemote(blob.data, blob.metadata.mimeType, remoteContext, target)
      : await uploadBlobRemote(blob.data, blob.metadata.mimeType, remoteContext);

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
  target?: RemoteBlobUploadTarget,
): Promise<boolean> {
  const cacheKey = getUploadCacheKey(hash, context);
  let pending = cache.get(cacheKey);
  if (!pending) {
    // Concurrent references to the same row share one authorization check and upload.
    pending = uploadAuthorizedBlob(hash, context, target);
    cache.set(cacheKey, pending);
  }
  return pending;
}

export async function uploadBlobRefsForShare(
  value: unknown,
  cache: RemoteBlobUploadCache,
  context: ShareBlobUploadContext,
  target?: RemoteBlobUploadTarget,
): Promise<void> {
  const hashes = collectBlobHashes(value, {
    maxDepth: BLOB_SCAN_MAX_DEPTH,
    maxStringLength: BLOB_SCAN_MAX_STRING_LENGTH,
  });
  for (const hash of hashes) {
    await uploadBlobForShare(hash, cache, context, target);
  }
}

export function recordResultBlobRefsForShare(
  value: unknown,
  cache: RemoteBlobUploadCache,
  context: ShareBlobUploadContext,
  valueToUpload: unknown = value,
): void {
  const hashes = collectBlobHashes(value, {
    maxDepth: BLOB_SCAN_MAX_DEPTH,
    maxStringLength: BLOB_SCAN_MAX_STRING_LENGTH,
  });
  const uploadHashes =
    valueToUpload === value
      ? hashes
      : collectBlobHashes(valueToUpload, {
          maxDepth: BLOB_SCAN_MAX_DEPTH,
          maxStringLength: BLOB_SCAN_MAX_STRING_LENGTH,
        });
  for (const hash of hashes) {
    const contexts = cache.resultContexts.get(hash) ?? new Map();
    const key = getUploadCacheKey(hash, context);
    contexts.set(key, {
      ...context,
      needsUpload: uploadHashes.has(hash) || contexts.get(key)?.needsUpload === true,
    });
    cache.resultContexts.set(hash, contexts);
  }
}

export async function uploadRecordedResultBlobRefsForShare(
  cache: RemoteBlobUploadCache,
  target?: RemoteBlobUploadTarget,
): Promise<void> {
  const uploads = [...cache.resultContexts].flatMap(([hash, contexts]) =>
    [...contexts.values()]
      .filter((context) => context.needsUpload)
      .map((context) => ({ hash, context })),
  );
  await async.mapLimit(uploads, 4, async ({ hash, context }: (typeof uploads)[number]) =>
    uploadBlobForShare(hash, cache, context, target),
  );
}

export async function uploadTraceBlobRefsForShare(
  value: unknown,
  cache: RemoteBlobUploadCache,
  context: ShareBlobUploadContext,
  target?: RemoteBlobUploadTarget,
  uploadedResultHashes = new Set<string>(),
): Promise<void> {
  const hashes = collectBlobHashes(value, {
    maxDepth: BLOB_SCAN_MAX_DEPTH,
    maxStringLength: BLOB_SCAN_MAX_STRING_LENGTH,
  });
  const uploads = [...hashes].flatMap((hash) => {
    const contexts = cache.resultContexts.get(hash);
    if (contexts?.size) {
      // Result ownership is the same for every trace that references this blob.
      if (uploadedResultHashes.has(hash)) {
        return [];
      }
      uploadedResultHashes.add(hash);
    }
    return [...(contexts?.size ? contexts.values() : [context])].map((uploadContext) => ({
      hash,
      context: uploadContext,
    }));
  });
  await async.mapLimit(uploads, 4, async ({ hash, context }: (typeof uploads)[number]) =>
    uploadBlobForShare(hash, cache, context, target),
  );
}
