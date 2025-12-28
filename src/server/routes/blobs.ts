import { eq } from 'drizzle-orm';
import express from 'express';
import { getBlobByHash, getBlobUrl } from '../../blobs';
import { isBlobStorageEnabled } from '../../blobs/extractor';
import { getDb } from '../../database';
import { blobAssetsTable, blobReferencesTable } from '../../database/tables';
import { GetBlobParamsSchema } from '../../dtos/blobs.dto';
import logger from '../../logger';
import { HttpStatus, sendError } from '../middleware';
import type { Request, Response } from 'express';

export const blobsRouter = express.Router();

blobsRouter.get('/:hash', async (req: Request, res: Response): Promise<void> => {
  if (!isBlobStorageEnabled()) {
    sendError(res, HttpStatus.NOT_FOUND, 'Blob storage disabled');
    return;
  }

  const parsed = GetBlobParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    sendError(res, HttpStatus.BAD_REQUEST, 'Invalid blob hash');
    return;
  }
  const { hash } = parsed.data;

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
    sendError(res, HttpStatus.NOT_FOUND, 'Blob not found');
    return;
  }

  const reference = db
    .select({ evalId: blobReferencesTable.evalId })
    .from(blobReferencesTable)
    .where(eq(blobReferencesTable.blobHash, hash))
    .get();

  if (!reference) {
    logger.warn('[BlobRoute] Missing reference for blob access', { hash });
    sendError(res, HttpStatus.FORBIDDEN, 'Not authorized to access this blob');
    return;
  }

  try {
    const presigned = await getBlobUrl(hash);
    if (presigned) {
      res.redirect(302, presigned);
      return;
    }

    const blob = await getBlobByHash(hash);
    res.setHeader('Content-Type', blob.metadata.mimeType || asset.mimeType);
    res.setHeader('Content-Length', (blob.metadata.sizeBytes ?? asset.sizeBytes).toString());
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Accept-Ranges', 'none');
    res.send(blob.data);
  } catch (error) {
    logger.error('[BlobRoute] Failed to serve blob', { error, hash });
    sendError(res, HttpStatus.NOT_FOUND, 'Blob not found');
  }
});
