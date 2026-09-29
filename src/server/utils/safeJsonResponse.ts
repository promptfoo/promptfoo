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
 * Serialize with Express's JSON settings before applying success-only headers.
 * Engine limits return 413; other serialization errors propagate.
 */
export function sendJsonResponse(
  res: Response,
  payload: unknown,
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
    body = JSON.stringify(payload, res.app.get('json replacer'), res.app.get('json spaces'));
    if (res.app.get('json escape') && typeof body === 'string') {
      body = body.replace(
        /[<>&]/g,
        (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
      );
    }
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
