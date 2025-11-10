import type { Response } from 'express';

/**
 * Set appropriate headers for file downloads
 * @param res Express response object
 * @param fileName Name of the file being downloaded
 * @param contentType MIME type of the file
 * @param contentLength Optional content length for download progress
 */
export function setDownloadHeaders(res: Response, fileName: string, contentType: string): void {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}
