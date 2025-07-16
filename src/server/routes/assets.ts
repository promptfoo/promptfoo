import { Router } from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { getAssetPath } from '../../util/assetStorage';
import logger from '../../logger';

export const assetsRouter = Router();

// Serve assets with proper MIME types and cache headers
assetsRouter.get('/:filename', (req: Request, res: Response): void => {
  const { filename } = req.params;
  
  // Basic security check - filename should only contain alphanumeric, dash, dot
  if (!/^[a-zA-Z0-9\-_.]+$/.test(filename)) {
    logger.warn(`Invalid asset filename requested: ${filename}`);
    res.status(400).send('Invalid filename');
    return;
  }
  
  const assetPath = getAssetPath(filename);
  
  if (!assetPath) {
    logger.debug(`Asset not found: ${filename}`);
    res.status(404).send('Asset not found');
    return;
  }
  
  // Set cache headers (assets are immutable by UUID)
  res.set({
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  });
  
  // Send the file - ensure absolute path
  const absolutePath = path.resolve(assetPath);
  logger.debug(`Attempting to serve asset from: ${absolutePath}`);
  
  res.sendFile(absolutePath, (err) => {
    if (err) {
      logger.error(`Error sending asset ${filename} from ${absolutePath}: ${err}`);
      if (!res.headersSent) {
        res.status(500).send('Error sending file');
      }
    } else {
      logger.debug(`Successfully served asset: ${filename}`);
    }
  });
}); 