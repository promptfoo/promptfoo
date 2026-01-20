/**
 * Media serving routes for the local web UI.
 *
 * Serves media files stored in the local filesystem storage.
 */

import express from 'express';
import logger from '../../logger';
import { getMediaStorage, mediaExists, retrieveMedia } from '../../storage';
import type { Request, Response } from 'express';

export const mediaRouter = express.Router();

const ALLOWED_MEDIA_TYPES = new Set(['audio', 'image', 'video']);
const MEDIA_FILENAME_REGEX = /^[a-f0-9]{12}\.[a-z0-9]+$/i;

function isValidMediaKey(type: string, filename: string): boolean {
  return ALLOWED_MEDIA_TYPES.has(type) && MEDIA_FILENAME_REGEX.test(filename);
}

/**
 * Get storage stats
 * Must be defined BEFORE wildcard routes
 */
mediaRouter.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const storage = getMediaStorage();

    // LocalFileSystemProvider has a getStats method
    if ('getStats' in storage && typeof storage.getStats === 'function') {
      const stats = await storage.getStats();
      res.json({
        success: true,
        data: {
          providerId: storage.providerId,
          ...stats,
        },
      });
    } else {
      res.json({
        success: true,
        data: {
          providerId: storage.providerId,
        },
      });
    }
  } catch (error) {
    logger.error('[Media API] Error getting storage stats', { error });
    res.status(500).json({ error: 'Failed to get storage stats' });
  }
});

/**
 * Get info about a media file
 * Path format: /info/audio/abc123.mp3
 */
mediaRouter.get('/info/:type/:filename', async (req: Request, res: Response): Promise<void> => {
  try {
    const type = req.params.type as string;
    const filename = req.params.filename as string;
    if (!isValidMediaKey(type, filename)) {
      res.status(400).json({ error: 'Invalid media key' });
      return;
    }
    const key = `${type}/${filename}`;

    const exists = await mediaExists(key);
    if (!exists) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }

    const storage = getMediaStorage();
    const url = await storage.getUrl(key);

    res.json({
      success: true,
      data: {
        key,
        exists: true,
        url,
      },
    });
  } catch (error) {
    logger.error('[Media API] Error getting media info', { error });
    res.status(500).json({ error: 'Failed to get media info' });
  }
});

/**
 * Serve a media file by key
 *
 * GET /api/media/:type/:filename
 *
 * The key is constructed from type + filename, e.g., "audio/abc123.mp3"
 */
mediaRouter.get('/:type/:filename', async (req: Request, res: Response): Promise<void> => {
  try {
    const type = req.params.type as string;
    const filename = req.params.filename as string;
    if (!isValidMediaKey(type, filename)) {
      res.status(400).json({ error: 'Invalid media key' });
      return;
    }
    const key = `${type}/${filename}`;

    logger.debug(`[Media API] Serving media: ${key}`);

    const exists = await mediaExists(key);
    if (!exists) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }

    const data = await retrieveMedia(key);

    // Determine content type from filename
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    const contentTypes: Record<string, string> = {
      wav: 'audio/wav',
      mp3: 'audio/mpeg',
      ogg: 'audio/ogg',
      webm: 'audio/webm',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      mp4: 'video/mp4',
      ogv: 'video/ogg',
    };

    const contentType = contentTypes[extension] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', data.length);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year cache (content-addressed)
    res.send(data);
  } catch (error) {
    logger.error('[Media API] Error serving media', { error });
    res.status(500).json({ error: 'Failed to serve media' });
  }
});
