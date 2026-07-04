import type { Response } from 'express';

/**
 * Matches the `RangeError`s V8 throws from `JSON.stringify` when a payload
 * cannot be serialized because it hits an engine limit: the maximum string
 * length (~512MB, "Invalid string length") or the maximum call-stack depth for
 * an extremely deep payload. These are the failure modes behind issue #7649,
 * where `GET /eval/:id/table` crashed for very large evals (e.g. base64 images
 * or huge per-cell prompts).
 */
const JSON_SERIALIZATION_LIMIT_ERROR_RE =
  /Invalid string length|Cannot create a string longer than|ERR_STRING_TOO_LONG|Maximum call stack size exceeded/i;

export const DEFAULT_TOO_LARGE_MESSAGE = 'Response payload is too large to serialize';

type JsonResponseLogger = {
  warn: (message: string, context: Record<string, unknown>) => void;
};

/**
 * Returns true when `error` is a `RangeError` that `JSON.stringify` throws for a
 * payload that exceeds V8's serialization limits (maximum string length or
 * maximum call-stack depth). Other errors — including circular-reference
 * `TypeError`s — are intentionally not matched so they surface normally.
 */
export function isJsonSerializationLimitError(error: unknown): error is RangeError {
  return error instanceof RangeError && JSON_SERIALIZATION_LIMIT_ERROR_RE.test(error.message);
}

/**
 * Serializes `payload` and sends it as `application/json`, guarding against the
 * `RangeError` `JSON.stringify` throws when a response would exceed V8's maximum
 * string length (issue #7649).
 *
 * This is a size *guard*, not a trimmer: every payload that fits is sent in full
 * and byte-for-byte identical to `res.json(payload)`, so the public response
 * contract is preserved. A payload that cannot be serialized fails loudly with
 * HTTP 413 and a clear error message rather than throwing an unhandled
 * `RangeError` — and, crucially, without silently stripping or corrupting the
 * body into something that no longer matches the response contract.
 *
 * @param res - Express response to write to.
 * @param payload - Value to serialize and send.
 * @param options.beforeSend - Invoked immediately before a successful body is
 *   sent (e.g. to set download headers). It is intentionally *not* called on the
 *   413 path, so error responses do not inherit success-only headers.
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
  let body: string;
  try {
    body = JSON.stringify(payload);
  } catch (error) {
    if (!isJsonSerializationLimitError(error)) {
      throw error;
    }

    logger?.warn(
      '[sendJsonResponse] Response exceeded the maximum JSON string length; returning 413',
      { error, evalId },
    );

    res.status(413);
    res.type('application/json');
    res.send(JSON.stringify({ error: tooLargeMessage }));
    return;
  }

  beforeSend?.();
  res.type('application/json');
  res.send(body);
}
