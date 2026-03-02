import { z } from 'zod';

// GET /api/blobs/:hash

export const GetBlobParamsSchema = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/i, 'Invalid blob hash'),
});

export type GetBlobParams = z.infer<typeof GetBlobParamsSchema>;

/** Grouped schemas for server-side validation. */
export const BlobsSchemas = {
  Get: {
    Params: GetBlobParamsSchema,
  },
} as const;
