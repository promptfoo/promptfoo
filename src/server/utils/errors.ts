import { z } from 'zod';
import logger from '../../logger';
import { ErrorResponseSchema } from '../../types/api/common';
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
  res.status(status).json(ErrorResponseSchema.parse({ error: publicMessage }));
}

/** Reply with a 400 from a Zod safeParse error, formatted via `z.prettifyError`. */
export function replyValidationError(res: Response, error: z.ZodError): void {
  res.status(400).json(ErrorResponseSchema.parse({ error: z.prettifyError(error) }));
}
