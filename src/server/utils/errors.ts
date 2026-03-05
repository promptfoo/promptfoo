import logger from '../../logger';
import type { Response } from 'express';

/**
 * Send a standardized error response.
 *
 * All error responses use the shape `{ error: string }`.
 * Internal details are logged but never exposed to the client.
 */
export function sendError(
  res: Response,
  status: number,
  publicMessage: string,
  internalError?: unknown,
): void {
  if (internalError) {
    logger.error(publicMessage, { error: internalError });
  }
  res.status(status).json({ error: publicMessage });
}
