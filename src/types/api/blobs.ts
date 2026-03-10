import { z } from 'zod';

// Shared regex for SHA-256 blob hashes
const BLOB_HASH_REGEX = /^[a-f0-9]{64}$/i;

// GET /api/blobs/:hash

export const GetBlobParamsSchema = z.object({
  hash: z.string().regex(BLOB_HASH_REGEX, 'Invalid blob hash'),
});

export type GetBlobParams = z.infer<typeof GetBlobParamsSchema>;

// GET /api/blobs/library

export const MediaLibraryQuerySchema = z.object({
  type: z.enum(['image', 'video', 'audio', 'other']).optional(),
  evalId: z.string().min(1).max(128).optional(),
  hash: z.string().regex(BLOB_HASH_REGEX, 'Invalid blob hash').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
  sortField: z.enum(['createdAt', 'sizeBytes']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type MediaLibraryQuery = z.infer<typeof MediaLibraryQuerySchema>;

const GraderResultSchema = z.object({
  name: z.string(),
  pass: z.boolean(),
  score: z.number(),
  reason: z.string().optional(),
});

const MediaItemContextSchema = z.object({
  evalId: z.string(),
  evalDescription: z.string().optional(),
  testIdx: z.number().optional(),
  promptIdx: z.number().optional(),
  location: z.string().optional(),
  provider: z.string().optional(),
  prompt: z.string().optional(),
  pass: z.boolean().optional(),
  score: z.number().optional(),
  variables: z.record(z.string(), z.string()).optional(),
  graderResults: z.array(GraderResultSchema).optional(),
  latencyMs: z.number().optional(),
  cost: z.number().optional(),
});

const MediaItemSchema = z.object({
  hash: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  kind: z.enum(['image', 'video', 'audio', 'other']),
  createdAt: z.string(),
  url: z.string(),
  context: MediaItemContextSchema,
});

export const MediaLibraryResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(MediaItemSchema),
    total: z.number(),
    hasMore: z.boolean(),
    blobStorageEnabled: z.boolean().optional(),
  }),
});

export type MediaLibraryResponse = z.infer<typeof MediaLibraryResponseSchema>;

// GET /api/blobs/library/evals

export const MediaLibraryEvalsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(501).default(500),
  search: z.string().max(200).optional(),
});

export type MediaLibraryEvalsQuery = z.infer<typeof MediaLibraryEvalsQuerySchema>;

const EvalOptionSchema = z.object({
  evalId: z.string(),
  description: z.string(),
  createdAt: z.string().optional(),
});

export const MediaLibraryEvalsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(EvalOptionSchema),
});

export type MediaLibraryEvalsResponse = z.infer<typeof MediaLibraryEvalsResponseSchema>;

/** Grouped schemas for server-side validation. */
export const BlobsSchemas = {
  Get: {
    Params: GetBlobParamsSchema,
  },
  Library: {
    Query: MediaLibraryQuerySchema,
    Response: MediaLibraryResponseSchema,
  },
  LibraryEvals: {
    Query: MediaLibraryEvalsQuerySchema,
    Response: MediaLibraryEvalsResponseSchema,
  },
} as const;
