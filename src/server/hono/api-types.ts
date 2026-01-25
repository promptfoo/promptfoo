/**
 * API Types - Shareable types between client and server
 *
 * Usage (server):
 *   import type { UserEmailResponse, ApiResult } from './api-types';
 *
 * Usage (client):
 *   import type { UserEmailResponse, ApiResult } from '@promptfoo/server/hono/api-types';
 *
 * These types are derived from Zod schemas in apiSchemas.ts and provide
 * TypeScript types for API request/response payloads.
 */

import { z } from 'zod';
import { ApiSchemas } from '../apiSchemas';

// =============================================================================
// Generic API Response Types
// =============================================================================

/**
 * Standard success response wrapper
 */
export interface ApiSuccess<T> {
  data: T;
  error?: never;
}

/**
 * Standard error response wrapper
 */
export interface ApiError {
  error: string;
  data?: never;
  details?: Record<string, unknown>;
}

/**
 * Union type for API responses - either success or error
 */
export type ApiResult<T> = ApiSuccess<T> | ApiError;

/**
 * Type guard for checking if response is successful
 */
export function isApiSuccess<T>(result: ApiResult<T>): result is ApiSuccess<T> {
  return 'data' in result && result.error === undefined;
}

/**
 * Type guard for checking if response is an error
 */
export function isApiError<T>(result: ApiResult<T>): result is ApiError {
  return 'error' in result && typeof result.error === 'string';
}

// =============================================================================
// User API Types
// =============================================================================

/** GET /api/user/email response */
export type UserEmailResponse = z.infer<typeof ApiSchemas.User.Get.Response>;

/** GET /api/user/id response */
export type UserIdResponse = z.infer<typeof ApiSchemas.User.GetId.Response>;

/** POST /api/user/email request */
export type UserEmailUpdateRequest = z.infer<typeof ApiSchemas.User.Update.Request>;

/** POST /api/user/email response */
export type UserEmailUpdateResponse = z.infer<typeof ApiSchemas.User.Update.Response>;

/** GET /api/user/email/status response */
export type UserEmailStatusResponse = z.infer<typeof ApiSchemas.User.EmailStatus.Response>;

/** Email status enum values */
export type EmailStatus = UserEmailStatusResponse['status'];

// =============================================================================
// Eval API Types
// =============================================================================

/** Params for /api/eval/:id routes */
export type EvalIdParams = z.infer<typeof ApiSchemas.Eval.UpdateAuthor.Params>;

/** PATCH /api/eval/:id/author request */
export type EvalUpdateAuthorRequest = z.infer<typeof ApiSchemas.Eval.UpdateAuthor.Request>;

/** PATCH /api/eval/:id/author response */
export type EvalUpdateAuthorResponse = z.infer<typeof ApiSchemas.Eval.UpdateAuthor.Response>;

/** GET /api/eval/:id/metadata-keys params */
export type EvalMetadataKeysParams = z.infer<typeof ApiSchemas.Eval.MetadataKeys.Params>;

/** GET /api/eval/:id/metadata-keys query */
export type EvalMetadataKeysQuery = z.infer<typeof ApiSchemas.Eval.MetadataKeys.Query>;

/** GET /api/eval/:id/metadata-keys response */
export type EvalMetadataKeysResponse = z.infer<typeof ApiSchemas.Eval.MetadataKeys.Response>;

/** GET /api/eval/:id/metadata-values params */
export type EvalMetadataValuesParams = z.infer<typeof ApiSchemas.Eval.MetadataValues.Params>;

/** GET /api/eval/:id/metadata-values query */
export type EvalMetadataValuesQuery = z.infer<typeof ApiSchemas.Eval.MetadataValues.Query>;

/** GET /api/eval/:id/metadata-values response */
export type EvalMetadataValuesResponse = z.infer<typeof ApiSchemas.Eval.MetadataValues.Response>;

/** POST /api/eval/:id/copy params */
export type EvalCopyParams = z.infer<typeof ApiSchemas.Eval.Copy.Params>;

/** POST /api/eval/:id/copy request */
export type EvalCopyRequest = z.infer<typeof ApiSchemas.Eval.Copy.Request>;

/** POST /api/eval/:id/copy response */
export type EvalCopyResponse = z.infer<typeof ApiSchemas.Eval.Copy.Response>;

// =============================================================================
// Re-export Zod schemas for runtime validation
// =============================================================================
export { ApiSchemas };
