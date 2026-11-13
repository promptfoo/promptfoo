import { createHttpErrorHandler } from '../../util/httpErrorHandler';
import type { ErrorRequestHandler } from 'express';

export function createMcpErrorHandler(
  logError: (message: string, diagnostic: string) => void,
): ErrorRequestHandler {
  return createHttpErrorHandler((res, status, message, diagnostic) => {
    logError(message, diagnostic);
    res.status(status).json({ error: message });
  });
}
