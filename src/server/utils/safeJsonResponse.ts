import { sendError } from './errors';
import type { Response } from 'express';

const JSON_SERIALIZATION_LIMIT_ERROR_RE =
  /Invalid string length|Cannot create a string longer than|ERR_STRING_TOO_LONG|Maximum call stack size exceeded/i;

const DEFAULT_TOO_LARGE_MESSAGE = 'Response payload is too large to serialize';

type JsonResponseLogger = {
  warn: (message: string, context: Record<string, unknown>) => void;
};

function isJsonSerializationLimitError(error: unknown): error is RangeError {
  return error instanceof RangeError && JSON_SERIALIZATION_LIMIT_ERROR_RE.test(error.message);
}

/**
 * Serialize a JSON response before applying success-only headers. V8
 * serialization-limit errors become a standard 413 response; other errors are
 * rethrown so callers do not lose useful failures.
 *
 * @param res - Express response to write to.
 * @param payload - Value to serialize and send.
 * @param options.beforeSend - Invoked immediately before a successful body is
 *   sent, so a 413 response does not inherit download headers.
 * @param options.evalId - Optional eval id included in the oversized-payload log.
 * @param options.logger - Optional logger used to warn when the 413 guard fires.
 * @param options.tooLargeMessage - Client-facing message for the 413 response.
 */
export function sendJsonResponse<T>(
  res: Response,
  payload: T,
  {
    beforeSend,
    evalId,
    logger,
    tooLargeMessage = DEFAULT_TOO_LARGE_MESSAGE,
  }: {
    beforeSend?: () => void;
    evalId?: string;
    logger?: JsonResponseLogger;
    tooLargeMessage?: string;
  } = {},
): void {
  let body: string | undefined;
  try {
    body = JSON.stringify(payload);
  } catch (error) {
    if (!isJsonSerializationLimitError(error)) {
      throw error;
    }

    logger?.warn('[sendJsonResponse] JSON serialization hit an engine limit; returning 413', {
      error,
      evalId,
    });

    sendError(res, 413, tooLargeMessage);
    return;
  }

  beforeSend?.();
  res.type('application/json');
  res.send(body);
}
