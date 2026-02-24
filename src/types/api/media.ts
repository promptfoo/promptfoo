import { z } from 'zod';

// GET /api/media/:type/:filename

export const MediaParamsSchema = z.object({
  type: z.enum(['audio', 'image', 'video']),
  filename: z.string().regex(/^[a-f0-9]{12}\.[a-z0-9]+$/i, 'Invalid media filename'),
});

export type MediaParams = z.infer<typeof MediaParamsSchema>;

/** Grouped schemas for server-side validation. */
export const MediaSchemas = {
  Params: MediaParamsSchema,
} as const;
