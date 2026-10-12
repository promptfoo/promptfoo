import { STATUS_CODES } from 'node:http';

import { z } from 'zod';
import logger from '../../logger';
import { ErrorResponseSchema } from '../../types/api/common';
import type { NextFunction, Request, Response } from 'express';

const MAX_CAUSE_DEPTH = 4;

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
    logger.error(publicMessage, { error: serializeError(internalError, 0, new Set()) });
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

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
  const candidate = typeof status === 'number' ? status : statusCode;
  return typeof candidate === 'number' &&
    Number.isInteger(candidate) &&
    candidate >= 400 &&
    candidate <= 599
    ? candidate
    : undefined;
}

// Set by a static file handler for the file it meant to send.
const REPRESENTATION_HEADERS = [
  'Content-Type',
  'Content-Encoding',
  'Content-Language',
  'Content-Range',
  'ETag',
  'Last-Modified',
];

/**
 * Drop the headers of a response that will not be sent, then apply the ones the error
 * asks for, such as `Content-Range` on a 416. `res.json` keeps an existing content type,
 * so without this the JSON body could go out labelled as the file's type.
 */
function resetResponseHeaders(res: Response, error: unknown): void {
  for (const header of REPRESENTATION_HEADERS) {
    res.removeHeader(header);
  }
  const headers =
    typeof error === 'object' && error !== null ? (error as { headers?: unknown }).headers : null;
  if (typeof headers === 'object' && headers !== null) {
    for (const [name, value] of Object.entries(headers)) {
      if (typeof value === 'string' || typeof value === 'number') {
        res.setHeader(name, value);
      }
    }
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

/**
 * Terminal Express error handler. Register it after every route.
 *
 * Without one, Express's own handler answers, and unless `NODE_ENV` is `production` it
 * writes the stack trace into the response. Errors arrive here from body parsing
 * (malformed or oversized JSON), from `res.sendFile`, and from any route that throws or
 * rejects.
 */
export function handleRequestError(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    // The response has started, so only Express can end it, by closing the connection.
    next(error);
    return;
  }
  const status = getErrorStatus(error) ?? 500;
  resetResponseHeaders(res, error);
  if (status >= 500) {
    sendError(res, status, 'Internal server error', error);
    return;
  }
  // The request was at fault. Its error message can quote the request body, so reply
  // with the status text alone.
  sendError(res, status, STATUS_CODES[status] ?? 'Bad Request');
}
