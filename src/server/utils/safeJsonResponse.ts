import type { Response } from 'express';

const JSON_STRING_LENGTH_ERROR_RE =
  /Invalid string length|Cannot create a string longer than|ERR_STRING_TOO_LONG/i;

export const DEFAULT_OVERSIZED_STRING_LIMIT = 100_000;

export type OversizedStringStats = {
  oversizedStrings: number;
  omittedCharacters: number;
};

type JsonResponseLogger = {
  warn: (message: string, context: Record<string, unknown>) => void;
};

export function isJsonStringLengthError(error: unknown): error is RangeError {
  return error instanceof RangeError && JSON_STRING_LENGTH_ERROR_RE.test(error.message);
}

function createOmittedStringPlaceholder(length: number): string {
  return `[content omitted: ${length} characters]`;
}

export function stripOversizedStrings<T>(
  value: T,
  {
    maxStringLength = DEFAULT_OVERSIZED_STRING_LIMIT,
    stats,
  }: {
    maxStringLength?: number;
    stats?: OversizedStringStats;
  } = {},
): T {
  const seen = new WeakSet<object>();

  function stripValue(current: unknown, depth = 0): unknown {
    if (depth > 512) {
      return '[content omitted: excessive nesting]';
    }
    if (typeof current === 'string') {
      if (current.length <= maxStringLength) {
        return current;
      }
      if (stats) {
        stats.oversizedStrings += 1;
        stats.omittedCharacters += current.length;
      }
      return createOmittedStringPlaceholder(current.length);
    }

    if (current && typeof current === 'object') {
      if (seen.has(current)) {
        return '[Circular Reference]';
      }
      seen.add(current);

      if (Array.isArray(current)) {
        const stripped = current.map((child) => stripValue(child, depth + 1));
        seen.delete(current);
        return stripped;
      }

      const toJSON = (current as { toJSON?: () => unknown }).toJSON;
      if (typeof toJSON === 'function') {
        const stripped = stripValue(toJSON.call(current), depth + 1);
        seen.delete(current);
        return stripped;
      }

      const stripped: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(current)) {
        stripped[key] = stripValue(child, depth + 1);
      }

      seen.delete(current);
      return stripped;
    }

    return current;
  }

  return stripValue(value) as T;
}

function sendSerializedJson(res: Response, body: string): void {
  res.type('application/json');
  res.send(body);
}

function sendTooLargeResponse(res: Response, publicMessage: string): void {
  res.status(413);
  sendSerializedJson(res, JSON.stringify({ error: publicMessage }));
}

export function sendJsonResponse<T>(
  res: Response,
  payload: T,
  {
    beforeSend,
    evalId,
    logger,
    retryPayload,
    tooLargeMessage = 'Response payload is too large to serialize',
  }: {
    beforeSend?: () => void;
    evalId?: string;
    logger?: JsonResponseLogger;
    retryPayload?: () => T;
    tooLargeMessage?: string;
  } = {},
): void {
  try {
    let body: string;
    try {
      body = JSON.stringify(payload);
    } catch (error) {
      if (!retryPayload || !isJsonStringLengthError(error)) {
        throw error;
      }
      body = JSON.stringify(retryPayload());
    }
    beforeSend?.();
    sendSerializedJson(res, body);
    return;
  } catch (error) {
    if (!isJsonStringLengthError(error)) {
      throw error;
    }

    logger?.warn('[sendJsonResponse] JSON payload exceeded V8 string length limit', {
      error,
      evalId,
    });

    sendTooLargeResponse(res, tooLargeMessage);
  }
}
