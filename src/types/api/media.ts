import { z } from 'zod';

// GET /api/media/:type/:filename

export const MediaParamsSchema = z.object({
  type: z.enum(['audio', 'image', 'video']),
  filename: z.string().regex(/^[a-f0-9]{12}\.[a-z0-9]+$/i, 'Invalid media filename'),
});

export type MediaParams = z.infer<typeof MediaParamsSchema>;

// GET /api/media/stats

export const MediaStatsResponseSchema = z.object({
  success: z.literal(true),
  data: z
    .object({
      providerId: z.string(),
    })
    .passthrough(),
});

export type MediaStatsResponse = z.infer<typeof MediaStatsResponseSchema>;

// GET /api/media/info/:type/:filename

export const MediaInfoResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    key: z.string(),
    exists: z.literal(true),
    url: z
      .string()
      .nullable()
      .describe('Storage provider URL; local providers may return a file:// URL'),
    apiUrl: z.string().describe('Root-relative API URL for fetching the media bytes'),
  }),
});

export type MediaInfoResponse = z.infer<typeof MediaInfoResponseSchema>;

/** Grouped schemas for server-side validation. */
export const MediaSchemas = {
  Stats: {
    Response: MediaStatsResponseSchema,
  },
  Info: {
    Params: MediaParamsSchema,
    Response: MediaInfoResponseSchema,
  },
  Get: {
    Params: MediaParamsSchema,
  },
} as const;
