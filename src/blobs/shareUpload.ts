import logger from '../logger';
import { BLOB_SCAN_MAX_DEPTH, BLOB_SCAN_MAX_STRING_LENGTH, collectBlobHashes } from './blobRefs';
import { getShareAuthorizedBlob } from './index';
import { type RemoteBlobUploadTarget, uploadBlobRemote } from './remoteUpload';

export class RemoteBlobUploadCache extends Map<string, Promise<boolean>> {
  readonly resultContexts = new Map<string, ShareBlobUploadContext[]>();
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

// Key uploads by result-row coordinates, not just by hash: the remote records the
// (promptIdx, testIdx) of each upload, so a blob referenced from multiple rows must
// upload once per row to preserve each row's provenance. Re-uploading the same bytes
// per row is intentional — the remote dedupes storage by content. Use `?? null` (not
// `||`) so a falsy index 0 (the first row of every eval) stays distinct from a
// coordinate-less reference.
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
    // Cache the whole authorize-and-upload flow synchronously so concurrent and
    // repeated references that share a cache key (same blob, same row coordinates)
    // reuse one authorization check and one upload without collapsing row provenance.
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
): void {
  const hashes = collectBlobHashes(value, {
    maxDepth: BLOB_SCAN_MAX_DEPTH,
    maxStringLength: BLOB_SCAN_MAX_STRING_LENGTH,
  });
  for (const hash of hashes) {
    const contexts = cache.resultContexts.get(hash) ?? [];
    const key = getUploadCacheKey(hash, context);
    if (!contexts.some((candidate) => getUploadCacheKey(hash, candidate) === key)) {
      contexts.push(context);
      cache.resultContexts.set(hash, contexts);
    }
  }
}

export async function uploadRecordedResultBlobRefsForShare(
  cache: RemoteBlobUploadCache,
  target?: RemoteBlobUploadTarget,
): Promise<void> {
  for (const [hash, contexts] of cache.resultContexts) {
    for (const context of contexts) {
      await uploadBlobForShare(hash, cache, context, target);
    }
  }
}

export async function uploadTraceBlobRefsForShare(
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
    const contexts = cache.resultContexts.get(hash);
    for (const uploadContext of contexts?.length ? contexts : [context]) {
      await uploadBlobForShare(hash, cache, uploadContext, target);
    }
  }
}
