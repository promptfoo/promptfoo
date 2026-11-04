import { STATUS_CODES } from 'node:http';

import type { ErrorRequestHandler } from 'express';

function isErrorStatus(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 400 && value < 600;
}

function copyErrorHeaders(original: unknown) {
  const copied: Record<string, string | number | string[]> = Object.create(null);
  if (original && typeof original === 'object') {
    for (const [key, value] of Object.entries(original)) {
      if (typeof value === 'string' || typeof value === 'number') {
        copied[key] = value;
      } else if (Array.isArray(value)) {
        const values = Array.from(value);
        if (values.every((item) => typeof item === 'string')) {
          copied[key] = values;
        }
      }
    }
  }
  return copied;
}

/** Keep MCP's error transport independent of the view server. */
export function createMcpErrorHandler(
  logError: (publicMessage: string, diagnostic: string) => void,
): ErrorRequestHandler {
  return (error: unknown, _req, res, next) => {
    let text = 'Error: Unable to format HTTP error';
    let status: number | undefined;
    let headers: Record<string, string | number | string[]> | undefined;

    try {
      const original = error as
        | {
            stack?: unknown;
            toString?: unknown;
            status?: unknown;
            statusCode?: unknown;
            headers?: unknown;
          }
        | null
        | undefined;
      let rendered = original?.stack;
      if (!rendered) {
        const stringify = original?.toString;
        rendered = typeof stringify === 'function' ? stringify.call(error) : undefined;
      }
      if (typeof rendered === 'string') {
        text = rendered;
      }

      const originalStatus = original?.status;
      const candidateStatus = isErrorStatus(originalStatus) ? originalStatus : original?.statusCode;
      if (isErrorStatus(candidateStatus)) {
        status = candidateStatus;
        headers = copyErrorHeaders(original?.headers);
      }
    } catch {
      // An accessor/formatter failure must not introduce another raw error object.
      text = 'Error: Unable to format HTTP error';
    }

    if (res.headersSent) {
      // finalhandler owns socket cleanup. Non-enumerable response metadata is not
      // part of its default console inspection; no original error is retained.
      const forwarded = new Error(text);
      Object.defineProperties(forwarded, {
        name: { value: '' },
        stack: { value: text },
        status: { value: status },
        headers: { value: headers },
      });
      next(forwarded);
      return;
    }

    const responseStatus = status ?? (isErrorStatus(res.statusCode) ? res.statusCode : 500);
    for (const [name, value] of Object.entries(headers ?? {})) {
      res.setHeader(name, value);
    }
    // These headers describe the discarded body, not the replacement JSON.
    for (const name of [
      'Content-Encoding',
      'Content-Language',
      'Content-Range',
      'Content-Length',
    ]) {
      res.removeHeader(name);
    }
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type('json');
    const publicMessage = STATUS_CODES[responseStatus] ?? 'Request failed';
    logError(publicMessage, text);
    res.status(responseStatus).json({ error: publicMessage });
  };
}
