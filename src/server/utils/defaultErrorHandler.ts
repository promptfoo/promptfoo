import { createHttpErrorHandler } from '../../util/httpErrorHandler';
import { sendError } from './errors';
import type { ErrorRequestHandler } from 'express';

const handleError = createHttpErrorHandler(sendError);

export const defaultErrorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (error instanceof URIError && !res.headersSent) {
    res.setHeader('Cache-Control', 'private, no-store');
  }
  return handleError(error, req, res, next);
};
