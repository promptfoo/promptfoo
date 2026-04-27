import { z } from 'zod';

// GET /api/media/:type/:filename

export const MediaParamsSchema = z.object({
  type: z.enum(['audio', 'image', 'video']),
  filename: z.string().regex(/^[a-f0-9]{12}\.[a-z0-9]+$/i, 'Invalid media filename'),
});

export type MediaParams = z.infer<typeof MediaParamsSchema>;

export const MediaBinaryResponseSchema = z.instanceof(Uint8Array);

export type MediaBinaryResponse = z.infer<typeof MediaBinaryResponseSchema>;

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
    url: z.string().nullable(),
  }),
});

export type MediaInfoResponse = z.infer<typeof MediaInfoResponseSchema>;

/** Grouped schemas for server-side validation. */
export const MediaSchemas = {
  Params: MediaParamsSchema,
  Stats: {
    Response: MediaStatsResponseSchema,
  },
  Info: {
    Params: MediaParamsSchema,
    Response: MediaInfoResponseSchema,
  },
  Get: {
    Params: MediaParamsSchema,
    BinaryResponse: MediaBinaryResponseSchema,
  },
} as const;
