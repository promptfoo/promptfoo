import { z } from 'zod';
import logger from '../../logger';
import { ErrorResponseSchema } from '../../types/api/common';
import type { Response } from 'express';

/**
 * Build a logger-safe context object from an unknown error value.
 *
 * The default logger object-context serializer goes through `JSON.stringify`,
 * which drops `name`, `message`, and `stack` from `Error` instances because they
 * are non-enumerable. Extract them explicitly so `logger.error` retains the stack.
 */
function toLogContext(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(error.cause === undefined ? {} : { cause: error.cause }),
      },
    };
  }
  return { error };
}

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
  if (internalError !== undefined) {
    logger.error(publicMessage, toLogContext(internalError));
  }
  res.status(status).json(ErrorResponseSchema.parse({ error: publicMessage }));
}

/**
 * Reply with a 400 from a Zod safeParse error.
 *
 * The human-readable message goes in `error` (formatted via `z.prettifyError`)
 * so existing clients keep working. The structured Zod issue array is also
 * exposed in `details` for clients that want to map errors back to fields
 * programmatically.
 */
export function replyValidationError(res: Response, error: z.ZodError): void {
  res.status(400).json(
    ErrorResponseSchema.parse({
      error: z.prettifyError(error),
      details: { issues: error.issues },
    }),
  );
}
