import { z } from 'zod';
import { EvalResultsFilterMode } from '../index';
import { EmailSchema, MessageResponseSchema } from './common';

/** Eval ID parameter schema. */
export const EvalIdParamSchema = z.object({
  id: z.string().min(1),
});

/** Eval ID with stricter validation for metadata endpoints. */
export const EvalIdStrictParamSchema = z.object({
  id: z.string().min(3).max(128),
});

export type EvalIdParam = z.infer<typeof EvalIdParamSchema>;

// PATCH /api/evals/:id/author

export const UpdateEvalAuthorParamsSchema = EvalIdParamSchema;

export const UpdateEvalAuthorRequestSchema = z.object({
  author: EmailSchema,
});

export const UpdateEvalAuthorResponseSchema = MessageResponseSchema;

export type UpdateEvalAuthorParams = z.infer<typeof UpdateEvalAuthorParamsSchema>;
export type UpdateEvalAuthorRequest = z.infer<typeof UpdateEvalAuthorRequestSchema>;
export type UpdateEvalAuthorResponse = z.infer<typeof UpdateEvalAuthorResponseSchema>;

// GET /api/evals/:id/metadata/keys

export const GetMetadataKeysParamsSchema = EvalIdStrictParamSchema;

export const GetMetadataKeysQuerySchema = z.object({
  comparisonEvalIds: z.array(z.string()).optional(),
});

export const GetMetadataKeysResponseSchema = z.object({
  keys: z.array(z.string()),
});

export type GetMetadataKeysParams = z.infer<typeof GetMetadataKeysParamsSchema>;
export type GetMetadataKeysQuery = z.infer<typeof GetMetadataKeysQuerySchema>;
export type GetMetadataKeysResponse = z.infer<typeof GetMetadataKeysResponseSchema>;

// GET /api/evals/:id/metadata/values

export const GetMetadataValuesParamsSchema = EvalIdStrictParamSchema;

export const GetMetadataValuesQuerySchema = z.object({
  key: z.string().min(1),
});

export const GetMetadataValuesResponseSchema = z.object({
  values: z.array(z.string()),
});

export type GetMetadataValuesParams = z.infer<typeof GetMetadataValuesParamsSchema>;
export type GetMetadataValuesQuery = z.infer<typeof GetMetadataValuesQuerySchema>;
export type GetMetadataValuesResponse = z.infer<typeof GetMetadataValuesResponseSchema>;

// POST /api/evals/:id/copy

export const CopyEvalParamsSchema = EvalIdParamSchema;

export const CopyEvalRequestSchema = z.object({
  description: z.string().optional(),
});

export const CopyEvalResponseSchema = z.object({
  id: z.string(),
  distinctTestCount: z.number(),
});

export type CopyEvalParams = z.infer<typeof CopyEvalParamsSchema>;
export type CopyEvalRequest = z.infer<typeof CopyEvalRequestSchema>;
export type CopyEvalResponse = z.infer<typeof CopyEvalResponseSchema>;

// GET /api/evals/:id/table

/** Query parameters for eval table endpoint. */
export const EvalTableQuerySchema = z.object({
  format: z.string().optional(),
  limit: z.coerce.number().positive().prefault(50),
  offset: z.coerce.number().nonnegative().prefault(0),
  filterMode: EvalResultsFilterMode.prefault('all'),
  search: z.string().prefault(''),
  filter: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v ? [v] : []))
    .prefault([]),
  comparisonEvalIds: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v ? [v] : []))
    .prefault([]),
});

export type EvalTableQuery = z.infer<typeof EvalTableQuerySchema>;

/** Grouped schemas for server-side validation. */
export const EvalSchemas = {
  UpdateAuthor: {
    Params: UpdateEvalAuthorParamsSchema,
    Request: UpdateEvalAuthorRequestSchema,
    Response: UpdateEvalAuthorResponseSchema,
  },
  MetadataKeys: {
    Params: GetMetadataKeysParamsSchema,
    Query: GetMetadataKeysQuerySchema,
    Response: GetMetadataKeysResponseSchema,
  },
  MetadataValues: {
    Params: GetMetadataValuesParamsSchema,
    Query: GetMetadataValuesQuerySchema,
    Response: GetMetadataValuesResponseSchema,
  },
  Copy: {
    Params: CopyEvalParamsSchema,
    Request: CopyEvalRequestSchema,
    Response: CopyEvalResponseSchema,
  },
  Table: {
    Query: EvalTableQuerySchema,
  },
} as const;
