/**
 * DTOs for blob storage endpoints.
 *
 * The blob endpoint primarily serves binary data directly or redirects to presigned URLs.
 * Error responses use the common SimpleErrorResponse format.
 */
import { z } from 'zod';

/**
 * Request parameters for GET /api/blobs/:hash
 */
export const GetBlobParamsSchema = z.object({
  hash: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, 'Invalid blob hash format (expected 64 hex characters)'),
});
export type GetBlobParams = z.infer<typeof GetBlobParamsSchema>;

// Note: Successful responses are either:
// - 302 redirect to presigned URL
// - Binary data with Content-Type header
// Error responses use SimpleErrorResponseSchema from common.ts
