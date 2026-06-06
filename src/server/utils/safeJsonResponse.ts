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
  error: (message: string, context: Record<string, unknown>) => void;
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

  function stripValue(current: unknown): unknown {
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
        const stripped = current.map(stripValue);
        seen.delete(current);
        return stripped;
      }

      const toJSON = (current as { toJSON?: () => unknown }).toJSON;
      if (typeof toJSON === 'function') {
        const stripped = stripValue(toJSON.call(current));
        seen.delete(current);
        return stripped;
      }

      const stripped: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(current)) {
        stripped[key] = stripValue(child);
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
    maxStringLength = DEFAULT_OVERSIZED_STRING_LIMIT,
    stripOversizedStringsOnRangeError = false,
    tooLargeMessage = 'Response payload is too large to serialize',
  }: {
    beforeSend?: () => void;
    evalId?: string;
    logger?: JsonResponseLogger;
    maxStringLength?: number;
    stripOversizedStringsOnRangeError?: boolean;
    tooLargeMessage?: string;
  } = {},
): void {
  try {
    const body = JSON.stringify(payload);
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
      stripOversizedStringsOnRangeError,
    });

    if (!stripOversizedStringsOnRangeError) {
      sendTooLargeResponse(res, tooLargeMessage);
      return;
    }

    const stats: OversizedStringStats = { oversizedStrings: 0, omittedCharacters: 0 };
    const strippedPayload = stripOversizedStrings(payload, { maxStringLength, stats });

    try {
      const body = JSON.stringify(strippedPayload);
      res.setHeader('X-Promptfoo-Response-Truncated', 'true');
      res.setHeader('X-Promptfoo-Truncated-Fields', String(stats.oversizedStrings));
      beforeSend?.();
      sendSerializedJson(res, body);
    } catch (fallbackError) {
      if (!isJsonStringLengthError(fallbackError)) {
        throw fallbackError;
      }

      logger?.error('[sendJsonResponse] Stripped JSON payload is still too large', {
        error: fallbackError,
        evalId,
        oversizedStrings: stats.oversizedStrings,
        omittedCharacters: stats.omittedCharacters,
      });
      sendTooLargeResponse(res, tooLargeMessage);
    }
  }
}
