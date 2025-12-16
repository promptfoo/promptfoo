import express from 'express';
import fs from 'fs';
import path from 'path';
import { getConfigDirectoryPath } from '../../util/config/manage';
import logger from '../../logger';
import type { Request, Response } from 'express';

const router = express.Router();

/**
 * MIME types for video output assets
 */
const MIME_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  webp: 'image/webp',
  jpg: 'image/jpeg',
};

/**
 * Allowed filenames to prevent directory traversal attacks.
 * Only these specific files can be served from video output directories.
 */
const ALLOWED_VIDEO_FILES = new Set(['video.mp4', 'thumbnail.webp', 'spritesheet.jpg']);

/**
 * UUID v4 regex pattern for validation
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Serve video output files from ~/.promptfoo/output/video/{uuid}/{filename}
 *
 * Security measures:
 * - UUID format validation to prevent directory traversal
 * - Filename allowlist to prevent arbitrary file access
 * - Proper MIME type headers
 * - Support for HTTP range requests for video streaming
 *
 * @route GET /api/output/video/:uuid/:filename
 */
router.get('/video/:uuid/:filename', (req: Request, res: Response): void => {
  const { uuid, filename } = req.params;

  // Validate UUID format (prevent directory traversal)
  if (!UUID_REGEX.test(uuid)) {
    logger.warn('[Output Route] Invalid UUID in video request', { uuid });
    res.status(400).json({ error: 'Invalid UUID format' });
    return;
  }

  // Validate filename against allowlist
  if (!ALLOWED_VIDEO_FILES.has(filename)) {
    logger.warn('[Output Route] Invalid filename in video request', { filename });
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }

  const outputDir = getConfigDirectoryPath();
  const videoOutputDir = path.resolve(outputDir, 'output', 'video');
  const filePath = path.resolve(videoOutputDir, uuid, filename);

  // Additional path traversal protection: ensure resolved path is within expected directory
  if (!filePath.startsWith(videoOutputDir + path.sep)) {
    logger.warn('[Output Route] Path traversal attempt detected', { uuid, filename, filePath });
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    logger.debug('[Output Route] Video file not found', { filePath });
    res.status(404).json({ error: 'File not found' });
    return;
  }

  // Get file stats for Content-Length
  const stat = fs.statSync(filePath);

  // Determine MIME type from file extension
  const ext = path.extname(filename).slice(1);
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

  // Support HTTP range requests for video streaming/seeking
  const range = req.headers.range;
  if (range && ext === 'mp4') {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': mimeType,
    });

    const stream = fs.createReadStream(filePath, { start, end });
    stream.pipe(res);
  } else {
    // Standard file response for non-range requests
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': mimeType,
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

export { router as outputRouter };
