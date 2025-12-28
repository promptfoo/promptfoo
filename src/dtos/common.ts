/**
 * Common DTO schemas shared across all API endpoints.
 *
 * These schemas define the standard response formats and utility types
 * used throughout the API.
 */
import { z } from 'zod';

// =============================================================================
// Pagination
// =============================================================================

/**
 * Standard pagination query parameters.
 * Used by list endpoints.
 */
export const PaginationParamsSchema = z.object({
  limit: z.coerce.number().int().positive().default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});
export type PaginationParams = z.infer<typeof PaginationParamsSchema>;


/**
 * Full API error response with optional success flag and details.
 * Use when endpoints may return { success: false, error, details }.
 * For simpler { error } responses, use SimpleErrorResponseSchema.
 */
export const ApiErrorResponseSchema = z.object({
  success: z.literal(false).optional(),
  error: z.string(),
  details: z.unknown().optional(),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

/**
 * Standard message response.
 * Used by mutation endpoints that return a confirmation message.
 */
export const MessageResponseSchema = z.object({
  message: z.string(),
});
export type MessageResponse = z.infer<typeof MessageResponseSchema>;

/**
 * Standard success with message response.
 */
export const SuccessMessageResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
export type SuccessMessageResponse = z.infer<typeof SuccessMessageResponseSchema>;

// =============================================================================
// Common Field Schemas
// =============================================================================

/**
 * Email schema with validation.
 */
export const EmailSchema = z.string().email();

/**
 * UUID schema.
 */
export const UuidSchema = z.string().uuid();

/**
 * ISO timestamp schema.
 */
export const TimestampSchema = z.string().datetime();

/**
 * Unix timestamp (milliseconds) schema.
 */
export const UnixTimestampSchema = z.number().int().nonnegative();

/**
 * Standard timestamps for database records.
 * createdAt/updatedAt are Unix epoch milliseconds.
 */
export const TimestampsSchema = z.object({
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Timestamps = z.infer<typeof TimestampsSchema>;

/** Simple error response: { error: string } */
export const SimpleErrorResponseSchema = z.object({
  error: z.string(),
});
export type SimpleErrorResponse = z.infer<typeof SimpleErrorResponseSchema>;

