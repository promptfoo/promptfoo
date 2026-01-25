import type { Response } from 'express';

/**
 * Get headers for file downloads as a plain object.
 * Compatible with both Express and Hono.
 * @param fileName Name of the file being downloaded
 * @param contentType MIME type of the file
 * @returns Headers object for download response
 */
export function getDownloadHeaders(fileName: string, contentType: string): Record<string, string> {
  return {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  };
}

/**
 * Set appropriate headers for file downloads on Express Response.
 * @param res Express response object
 * @param fileName Name of the file being downloaded
 * @param contentType MIME type of the file
 * @deprecated Use getDownloadHeaders() for Hono compatibility
 */
export function setDownloadHeaders(res: Response, fileName: string, contentType: string): void {
  const headers = getDownloadHeaders(fileName, contentType);
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
}
