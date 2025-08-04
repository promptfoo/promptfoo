import * as path from 'path';
import type { Express, Request, Response } from 'express';

import { getAssetStore } from '../../assets';
import { isAssetStorageEnabled } from '../../assets';
import { AssetMetrics } from '../../assets/metrics';
import logger from '../../logger';
import { getConfigDirectoryPath } from '../../util/config/manage';
import { isValidEvalId, isValidResultId, isValidAssetId } from '../../util/ids';

export function setupAssetRoutes(app: Express): void {
  const assetStore = getAssetStore();

  // Serve individual assets
  app.get(
    '/api/eval/:evalId/result/:resultId/asset/:assetId',
    async (req: Request, res: Response) => {
      // Check if asset storage is enabled
      if (!isAssetStorageEnabled()) {
        return res.status(404).json({ error: 'Asset storage is not enabled' });
      }

      const { evalId, resultId, assetId } = req.params;

      // Validate UUIDs
      if (!isValidEvalId(evalId) || !isValidResultId(resultId) || !isValidAssetId(assetId)) {
        return res.status(400).json({ error: 'Invalid ID format' });
      }

      try {
        // Get metadata first to set proper headers
        const metadata = await assetStore.getMetadata(evalId, resultId, assetId);

        // Set appropriate headers
        res.set({
          'Content-Type': metadata.mimeType,
          'Content-Length': metadata.size.toString(),
          'Cache-Control': 'private, max-age=3600', // 1 hour cache
          'X-Asset-Hash': metadata.hash,
          'X-Asset-Type': metadata.type,
        });

        // Check if this is a deduplicated asset
        let actualPath: string;
        if (metadata.dedupedFrom) {
          // This is a deduplicated reference, resolve to the original file
          const [origEvalId, origResultId, origAssetId] = metadata.dedupedFrom.split('/');
          actualPath = path.join(
            getConfigDirectoryPath(),
            'assets',
            origEvalId,
            origResultId,
            origAssetId,
          );
          logger.debug(`Serving deduplicated asset from ${metadata.dedupedFrom}`);
        } else {
          // Normal asset path
          actualPath = path.join(getConfigDirectoryPath(), 'assets', evalId, resultId, assetId);
        }

        // Use Express's sendFile for efficient streaming
        res.sendFile(actualPath, (err) => {
          if (err) {
            logger.error('Error serving asset:', err);
            if (!res.headersSent) {
              res.status(404).json({ error: 'Asset not found' });
            }
          }
        });
      } catch (error) {
        logger.error('Asset serving error:', error);

        if ((error as any).message === 'Asset metadata not found') {
          res.status(404).json({ error: 'Asset not found' });
        } else {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    },
  );

  // Asset metrics endpoint
  app.get('/api/assets/metrics', async (req: Request, res: Response) => {
    if (!isAssetStorageEnabled()) {
      return res.status(404).json({ error: 'Asset storage is not enabled' });
    }

    const metrics = AssetMetrics.getInstance().getMetrics();
    res.json(metrics);
  });

  // Health check endpoint for asset storage
  app.get('/api/health/assets', async (req: Request, res: Response) => {
    const health = {
      enabled: isAssetStorageEnabled(),
      status: 'unknown',
      metrics: null as any,
    };

    if (!health.enabled) {
      return res.json({ ...health, status: 'disabled' });
    }

    try {
      // Get metrics
      health.metrics = AssetMetrics.getInstance().getMetrics();

      // Check if we can write (simple test)
      const testId = `health-check-${Date.now()}`;
      const testData = Buffer.from('health check test');

      try {
        const metadata = await assetStore.save(testData, 'image', 'image/png', 'health', testId);

        // Try to read it back
        await assetStore.load('health', testId, metadata.id);

        // Clean up - best effort
        const fs = await import('fs/promises');
        const testPath = path.join(getConfigDirectoryPath(), 'assets', 'health', testId);
        await fs.rm(testPath, { recursive: true, force: true }).catch(() => {});

        health.status = 'healthy';
      } catch (error) {
        logger.error('Asset health check write test failed:', error);
        health.status = 'degraded';
      }

      const statusCode = health.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error) {
      logger.error('Asset health check failed:', error);
      res.status(503).json({
        ...health,
        status: 'error',
        error: (error as Error).message,
      });
    }
  });
}
