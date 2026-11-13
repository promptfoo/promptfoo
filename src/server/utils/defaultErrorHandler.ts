import { createHttpErrorHandler } from '../../util/httpErrorHandler';
import { sendError } from './errors';
import type { ErrorRequestHandler } from 'express';

export const defaultErrorHandler: ErrorRequestHandler = createHttpErrorHandler(sendError);
