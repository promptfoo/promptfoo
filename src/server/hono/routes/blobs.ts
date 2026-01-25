import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { getBlobByHash, getBlobUrl } from '../../../blobs';
import { isBlobStorageEnabled } from '../../../blobs/extractor';
import { getDb } from '../../../database';
import { blobAssetsTable, blobReferencesTable } from '../../../database/tables';
import logger from '../../../logger';

export const blobsRouter = new Hono();

const BLOB_HASH_REGEX = /^[a-f0-9]{64}$/i;
// Strict MIME type validation to prevent header injection attacks
const SAFE_MIME_TYPE_REGEX = /^[a-z]+\/[a-z0-9_+-]+$/i;

blobsRouter.get('/:hash', async (c) => {
  if (!isBlobStorageEnabled()) {
    return c.json({ error: 'Blob storage disabled' }, 404);
  }

  const hash = c.req.param('hash');
  if (!BLOB_HASH_REGEX.test(hash)) {
    return c.json({ error: 'Invalid blob hash' }, 400);
  }

  const db = getDb();
  const asset = db
    .select({
      hash: blobAssetsTable.hash,
      mimeType: blobAssetsTable.mimeType,
      sizeBytes: blobAssetsTable.sizeBytes,
      provider: blobAssetsTable.provider,
    })
    .from(blobAssetsTable)
    .where(eq(blobAssetsTable.hash, hash))
    .get();

  if (!asset) {
    return c.json({ error: 'Blob not found' }, 404);
  }

  // Security: Check that a reference exists for this blob
  const reference = db
    .select({ evalId: blobReferencesTable.evalId })
    .from(blobReferencesTable)
    .where(eq(blobReferencesTable.blobHash, hash))
    .get();

  if (!reference) {
    logger.warn('[BlobRoute] Missing reference for blob access', { hash });
    return c.json({ error: 'Not authorized to access this blob' }, 403);
  }

  try {
    const presigned = await getBlobUrl(hash);
    if (presigned) {
      return c.redirect(presigned, 302);
    }

    const blob = await getBlobByHash(hash);

    // Validate MIME type before setting header to prevent injection attacks
    const mimeType = blob.metadata.mimeType || asset.mimeType;
    const safeMimeType = SAFE_MIME_TYPE_REGEX.test(mimeType)
      ? mimeType
      : 'application/octet-stream';

    if (!SAFE_MIME_TYPE_REGEX.test(mimeType)) {
      logger.warn('[BlobRoute] Invalid MIME type, using fallback', { mimeType, hash });
    }

    return new Response(new Uint8Array(blob.data), {
      headers: {
        'Content-Type': safeMimeType,
        'Content-Length': (blob.metadata.sizeBytes ?? asset.sizeBytes).toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Accept-Ranges': 'none',
      },
    });
  } catch (error) {
    logger.error('[BlobRoute] Failed to serve blob', { error, hash });
    return c.json({ error: 'Blob not found' }, 404);
  }
});

export default blobsRouter;
