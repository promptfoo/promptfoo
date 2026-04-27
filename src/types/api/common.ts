import { z } from 'zod';

/** Standard email validation schema. */
export const EmailSchema = z.string().email();

/** Response containing a single message field. */
export const MessageResponseSchema = z.object({
  message: z.string(),
});

export type MessageResponse = z.infer<typeof MessageResponseSchema>;

/** Response containing a success flag and optional message. */
export const SuccessResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string().optional(),
  })
  .passthrough();

export type SuccessResponse = z.infer<typeof SuccessResponseSchema>;

/** Shared API error shape. Routes may add endpoint-specific fields. */
export const ErrorResponseSchema = z
  .object({
    error: z.string(),
    details: z.unknown().optional(),
    suggestion: z.string().optional(),
    success: z.literal(false).optional(),
  })
  .passthrough();

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const BooleanQueryParamSchema = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => value === true || value === 'true');

/** Generic object payload for endpoints with intentionally open data. */
export const JsonObjectSchema = z.record(z.string(), z.unknown());

/** Timestamp that can be either an ISO string or Unix epoch number. */
export const TimestampSchema = z.union([z.string(), z.number()]);
