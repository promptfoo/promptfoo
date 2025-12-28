/**
 * Media API DTOs.
 *
 * These schemas define the request/response shapes for media-related endpoints.
 * Note: GET /api/media/:type/:filename returns binary data, not JSON.
 */
import { z } from 'zod';

// =============================================================================
// Common Media Types
// =============================================================================

/**
 * Allowed media types.
 */
export const MediaTypeSchema = z.enum(['audio', 'image', 'video']);
export type MediaType = z.infer<typeof MediaTypeSchema>;

/**
 * Media filename pattern (12 hex chars + extension).
 */
export const MediaFilenameSchema = z.string().regex(/^[a-f0-9]{12}\.[a-z0-9]+$/i, {
  message: 'Invalid media filename format',
});
export type MediaFilename = z.infer<typeof MediaFilenameSchema>;

// =============================================================================
// GET /api/media/stats
// =============================================================================

/**
 * Response for GET /api/media/stats
 * Note: Stats fields from LocalFileSystemProvider.getStats()
 */
export const GetMediaStatsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    providerId: z.string(),
    // Stats from LocalFileSystemProvider.getStats()
    fileCount: z.number().optional(),
    totalSizeBytes: z.number().optional(),
  }),
});
export type GetMediaStatsResponse = z.infer<typeof GetMediaStatsResponseSchema>;

// =============================================================================
// GET /api/media/info/:type/:filename
// =============================================================================

/**
 * Params for GET /api/media/info/:type/:filename
 */
export const GetMediaInfoParamsSchema = z.object({
  type: MediaTypeSchema,
  filename: MediaFilenameSchema,
});
export type GetMediaInfoParams = z.infer<typeof GetMediaInfoParamsSchema>;

/**
 * Response for GET /api/media/info/:type/:filename
 */
export const GetMediaInfoResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    key: z.string(),
    exists: z.literal(true),
    url: z.string(),
  }),
});
export type GetMediaInfoResponse = z.infer<typeof GetMediaInfoResponseSchema>;

// =============================================================================
// GET /api/media/:type/:filename
// =============================================================================

/**
 * Params for GET /api/media/:type/:filename
 * Note: This endpoint returns binary data, not JSON.
 */
export const GetMediaParamsSchema = z.object({
  type: MediaTypeSchema,
  filename: MediaFilenameSchema,
});
export type GetMediaParams = z.infer<typeof GetMediaParamsSchema>;
