import { z } from 'zod';
import logger from '../../logger';
import { ErrorResponseSchema } from '../../types/api/common';
import type { Response } from 'express';

const MAX_CAUSE_DEPTH = 4;

/**
 * Build a logger-safe context object from an unknown error value.
 *
 * Most logger paths serialize context with `JSON.stringify`-equivalent
 * routines, which drop `name`/`message`/`stack` from `Error` instances
 * because those properties are non-enumerable. Extract them explicitly so
 * stack traces survive logging.
 *
 * Walk `cause` chains so a wrapped error doesn't re-introduce the same
 * non-enumerable-fields bug at the next level. A depth cap prevents
 * runaway cycles (`err.cause = err`) from blowing the stack or making
 * the logger payload pathological.
 */
function toLogContext(error: unknown): Record<string, unknown> {
  return { error: serializeError(error, 0, new Set()) };
}

function serializeError(value: unknown, depth: number, seen: Set<unknown>): unknown {
  if (!(value instanceof Error)) {
    return value;
  }
  if (seen.has(value) || depth >= MAX_CAUSE_DEPTH) {
    return { name: value.name, message: value.message };
  }
  seen.add(value);
  // Spread enumerable own props first so subclass diagnostics (Node
  // SystemError `code`/`errno`/`syscall`/`path`, AWS SDK `$metadata`/`$fault`,
  // node-fetch `code`, custom provider metadata) reach the log. Then overlay
  // the four standard non-enumerable Error fields so they always win even if
  // a subclass shadowed them as enumerable.
  return {
    ...value,
    name: value.name,
    message: value.message,
    stack: value.stack,
    ...(value.cause === undefined ? {} : { cause: serializeError(value.cause, depth + 1, seen) }),
  };
}

/**
 * Reply with a parsed `ErrorResponseSchema` envelope, falling back to a
 * hand-built `{ error }` object if parsing throws (e.g. a future schema
 * tightening that rejects the input). Otherwise a parse failure inside
 * this canonical funnel would propagate, escape the caller's try/catch,
 * and land in Express's default error handler — leaving the client with
 * an empty 500 and no JSON body.
 */
function safeRespond(res: Response, status: number, body: { error: string; details?: unknown }) {
  let parsed: unknown;
  try {
    parsed = ErrorResponseSchema.parse(body);
  } catch (parseError) {
    logger.error('ErrorResponseSchema.parse failed; sending hand-built envelope', {
      parseError: serializeError(parseError, 0, new Set()),
    });
    parsed = { error: body.error };
  }
  res.status(status).json(parsed);
}

/**
 * Send a standardized error response.
 *
 * The wire shape is `{ error: string }` (with optional `details`/
 * `suggestion`/`success` permitted by `ErrorResponseSchema.passthrough()`,
 * but this helper only emits `error`). `internalError` is logged but
 * never returned to the client.
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
  safeRespond(res, status, { error: publicMessage });
}

/**
 * Reply with a 400 from a Zod safeParse error.
 *
 * The human-readable message goes in `error` (formatted via
 * `z.prettifyError`) so existing clients keep working. The structured Zod
 * issue array is also exposed in `details` for clients that want to map
 * errors back to fields programmatically. Zod core issues only contain
 * paths, codes, and type names — never the user-supplied input value —
 * so this is safe to expose. If a project schema ever uses a `.refine`
 * whose message interpolates the failing input, that custom message
 * would also reach the wire via this field; audit such schemas before
 * adding.
 */
export function replyValidationError(res: Response, error: z.ZodError): void {
  safeRespond(res, 400, {
    error: z.prettifyError(error),
    details: { issues: error.issues },
  });
}
