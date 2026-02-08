import { eq } from 'drizzle-orm';
import express from 'express';
import { getBlobByHash, getBlobUrl } from '../../blobs';
import { isBlobStorageEnabled } from '../../blobs/extractor';
import { getDb } from '../../database';
import { blobAssetsTable, blobReferencesTable } from '../../database/tables';
import logger from '../../logger';
import type { Request, Response } from 'express';

export const blobsRouter = express.Router();

const BLOB_HASH_REGEX = /^[a-f0-9]{64}$/i;
// Strict MIME type validation to prevent header injection attacks
// Only allow: type/subtype where both are alphanumeric with dash/underscore/plus
// Periods are NOT allowed to prevent attacks like "audio/wav.html" being interpreted as HTML
const SAFE_MIME_TYPE_REGEX = /^[a-z]+\/[a-z0-9_+-]+$/i;

blobsRouter.get('/:hash', async (req: Request, res: Response): Promise<void> => {
  if (!isBlobStorageEnabled()) {
    res.status(404).json({ error: 'Blob storage disabled' });
    return;
  }

  const hash = req.params.hash as string;
  if (!BLOB_HASH_REGEX.test(hash)) {
    res.status(400).json({ error: 'Invalid blob hash' });
    return;
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
    res.status(404).json({ error: 'Blob not found' });
    return;
  }

  // Security: Check that a reference exists for this blob
  // NOTE: In the OSS version, this is a local-only server with no user authentication.
  // For multi-tenant deployments (e.g., Promptfoo Cloud), additional authorization is needed:
  // - Verify the requesting user has access to the evaluation (reference.evalId)
  // - Check user/team ownership before serving the blob
  // - Implement proper session/token-based authentication
  const reference = db
    .select({ evalId: blobReferencesTable.evalId })
    .from(blobReferencesTable)
    .where(eq(blobReferencesTable.blobHash, hash))
    .get();

  if (!reference) {
    logger.warn('[BlobRoute] Missing reference for blob access', { hash });
    res.status(403).json({ error: 'Not authorized to access this blob' });
    return;
  }

  try {
    const presigned = await getBlobUrl(hash);
    if (presigned) {
      res.redirect(302, presigned);
      return;
    }

    const blob = await getBlobByHash(hash);

    // Validate MIME type before setting header to prevent injection attacks
    const mimeType = blob.metadata.mimeType || asset.mimeType;
    if (SAFE_MIME_TYPE_REGEX.test(mimeType)) {
      res.setHeader('Content-Type', mimeType);
    } else {
      logger.warn('[BlobRoute] Invalid MIME type, using fallback', { mimeType, hash });
      res.setHeader('Content-Type', 'application/octet-stream');
    }
    res.setHeader('Content-Length', (blob.metadata.sizeBytes ?? asset.sizeBytes).toString());
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Accept-Ranges', 'none');
    res.send(blob.data);
  } catch (error) {
    logger.error('[BlobRoute] Failed to serve blob', { error, hash });
    res.status(404).json({ error: 'Blob not found' });
  }
});
