/**
 * Request Validation Middleware
 *
 * Validates incoming requests (params, query, body) against Zod schemas.
 * Returns 400 Bad Request if validation fails.
 *
 * Usage:
 *   router.post(
 *     '/email',
 *     validateRequest({ body: UpdateUserEmailRequestSchema }),
 *     async (req: ValidatedRequest<unknown, unknown, UpdateUserEmailRequest>, res) => {
 *       const { email } = req.body; // Fully typed!
 *     }
 *   );
 */

import { ZodError, type ZodSchema } from 'zod';
import { fromError } from 'zod-validation-error';
import type { NextFunction, Request, Response } from 'express';
import { sendError, HttpStatus } from './apiResponse';

/**
 * Schemas for validating different parts of the request.
 */
export interface ValidationSchemas {
  /** Validate URL parameters (e.g., /users/:id) */
  params?: ZodSchema;
  /** Validate query string parameters */
  query?: ZodSchema;
  /** Validate request body */
  body?: ZodSchema;
}

/**
 * Express middleware that validates request data against Zod schemas.
 *
 * @param schemas - Object containing schemas for params, query, and/or body
 * @returns Express middleware function
 */
export function validateRequest(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        sendError(res, HttpStatus.BAD_REQUEST, fromError(error).message);
        return;
      }
      // Re-throw unexpected errors
      next(error);
    }
  };
}

/**
 * Type helper for route handlers with validated request data.
 *
 * Usage:
 *   async (req: ValidatedRequest<{ id: string }, unknown, { email: string }>, res) => {
 *     const { id } = req.params;    // typed as string
 *     const { email } = req.body;   // typed as string
 *   }
 */
export type ValidatedRequest<TParams = unknown, TQuery = unknown, TBody = unknown> = Request<
  TParams,
  unknown,
  TBody,
  TQuery
>;
