/**
 * Media serving routes for the local web UI.
 *
 * Serves media files stored in the local filesystem storage.
 */

import { Hono } from 'hono';

import logger from '../../../logger';
import { getMediaStorage, mediaExists, retrieveMedia } from '../../../storage';

export const mediaRouter = new Hono();

const ALLOWED_MEDIA_TYPES = new Set(['audio', 'image', 'video']);
const MEDIA_FILENAME_REGEX = /^[a-f0-9]{12}\.[a-z0-9]+$/i;

function isValidMediaKey(type: string, filename: string): boolean {
  return ALLOWED_MEDIA_TYPES.has(type) && MEDIA_FILENAME_REGEX.test(filename);
}

/**
 * Get storage stats
 * Must be defined BEFORE wildcard routes
 */
mediaRouter.get('/stats', async (c) => {
  try {
    const storage = getMediaStorage();

    // LocalFileSystemProvider has a getStats method
    if ('getStats' in storage && typeof storage.getStats === 'function') {
      const stats = await storage.getStats();
      return c.json({
        success: true,
        data: {
          providerId: storage.providerId,
          ...stats,
        },
      });
    } else {
      return c.json({
        success: true,
        data: {
          providerId: storage.providerId,
        },
      });
    }
  } catch (error) {
    logger.error('[Media API] Error getting storage stats', { error });
    return c.json({ error: 'Failed to get storage stats' }, 500);
  }
});

/**
 * Get info about a media file
 * Path format: /info/audio/abc123.mp3
 */
mediaRouter.get('/info/:type/:filename', async (c) => {
  try {
    const type = c.req.param('type');
    const filename = c.req.param('filename');
    if (!isValidMediaKey(type, filename)) {
      return c.json({ error: 'Invalid media key' }, 400);
    }
    const key = `${type}/${filename}`;

    const exists = await mediaExists(key);
    if (!exists) {
      return c.json({ error: 'Media not found' }, 404);
    }

    const storage = getMediaStorage();
    const url = await storage.getUrl(key);

    return c.json({
      success: true,
      data: {
        key,
        exists: true,
        url,
      },
    });
  } catch (error) {
    logger.error('[Media API] Error getting media info', { error });
    return c.json({ error: 'Failed to get media info' }, 500);
  }
});

/**
 * Serve a media file by key
 *
 * GET /api/media/:type/:filename
 *
 * The key is constructed from type + filename, e.g., "audio/abc123.mp3"
 */
mediaRouter.get('/:type/:filename', async (c) => {
  try {
    const type = c.req.param('type');
    const filename = c.req.param('filename');
    if (!isValidMediaKey(type, filename)) {
      return c.json({ error: 'Invalid media key' }, 400);
    }
    const key = `${type}/${filename}`;

    logger.debug(`[Media API] Serving media: ${key}`);

    const exists = await mediaExists(key);
    if (!exists) {
      return c.json({ error: 'Media not found' }, 404);
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

    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': contentType,
        'Content-Length': data.length.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    logger.error('[Media API] Error serving media', { error });
    return c.json({ error: 'Failed to serve media' }, 500);
  }
});

export default mediaRouter;
