/**
 * Eval API DTOs.
 */
import { z } from 'zod';
import { MessageResponseSchema } from './common';

// Common patterns
export const IdParamsSchema = z.object({ id: z.string() });
export type IdParams = z.infer<typeof IdParamsSchema>;

export const IdResponseSchema = z.object({ id: z.string() });
export type IdResponse = z.infer<typeof IdResponseSchema>;

// Enums
export const EvalJobStatusSchema = z.enum(['in-progress', 'complete', 'error']);
export type EvalJobStatus = z.infer<typeof EvalJobStatusSchema>;

export const EvalResultsFilterModeSchema = z.enum(['all', 'failures', 'errors', 'different']);
export type EvalResultsFilterMode = z.infer<typeof EvalResultsFilterModeSchema>;

/**
 * Token usage for completions.
 * Matches BaseTokenUsageSchema from src/types/shared.ts
 */
export const TokenUsageSchema = z.object({
  prompt: z.number().optional(),
  completion: z.number().optional(),
  cached: z.number().optional(),
  total: z.number().optional(),
  numRequests: z.number().optional(),
  completionDetails: z
    .object({
      reasoning: z.number().optional(),
      acceptedPrediction: z.number().optional(),
      rejectedPrediction: z.number().optional(),
    })
    .optional(),
  assertions: z
    .object({
      total: z.number().optional(),
      prompt: z.number().optional(),
      completion: z.number().optional(),
      cached: z.number().optional(),
      numRequests: z.number().optional(),
      completionDetails: z
        .object({
          reasoning: z.number().optional(),
          acceptedPrediction: z.number().optional(),
          rejectedPrediction: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

/**
 * Result suggestion for improving prompts/responses.
 */
export const ResultSuggestionSchema = z.object({
  type: z.string(),
  action: z.enum(['replace-prompt', 'pre-filter', 'post-filter', 'note']),
  value: z.string(),
});
export type ResultSuggestion = z.infer<typeof ResultSuggestionSchema>;

/**
 * Assertion value can be a primitive or array/object.
 * Matches AssertionValue from src/types/index.ts (excluding functions which can't be serialized).
 */
export const AssertionValueSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.number(),
  z.boolean(),
  z.record(z.unknown()),
]);
export type AssertionValue = z.infer<typeof AssertionValueSchema>;

/**
 * Provider reference in assertion - can be string ID or config object.
 */
export const AssertionProviderSchema = z.union([
  z.string(),
  z.object({
    id: z.string().optional(),
    label: z.string().optional(),
    config: z.record(z.unknown()).optional(),
  }),
]);
export type AssertionProvider = z.infer<typeof AssertionProviderSchema>;

/**
 * Grading result for a test case.
 * Matches GradingResult interface from src/types/index.ts
 */
export const GradingResultSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    pass: z.boolean(),
    score: z.number(),
    reason: z.string(),
    namedScores: z.record(z.string(), z.number()).optional(),
    tokensUsed: TokenUsageSchema.optional(),
    componentResults: z.array(GradingResultSchema).optional(),
    assertion: z
      .object({
        type: z.string(),
        value: AssertionValueSchema.optional(),
        weight: z.number().optional(),
        threshold: z.number().optional(),
        metric: z.string().optional(),
        provider: AssertionProviderSchema.optional(),
        transform: z.string().optional(),
      })
      .optional(),
    comment: z.string().optional(),
    suggestions: z.array(ResultSuggestionSchema).optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
);
export type GradingResult = z.infer<typeof GradingResultSchema>;

/**
 * Prompt metrics.
 * Matches PromptMetricsSchema from src/types/index.ts
 */
export const PromptMetricsSchema = z.object({
  score: z.number(),
  testPassCount: z.number(),
  testFailCount: z.number(),
  testErrorCount: z.number(),
  assertPassCount: z.number(),
  assertFailCount: z.number(),
  totalLatencyMs: z.number(),
  tokenUsage: TokenUsageSchema,
  namedScores: z.record(z.string(), z.number()),
  namedScoresCount: z.record(z.string(), z.number()),
  redteam: z
    .object({
      pluginPassCount: z.record(z.string(), z.number()),
      pluginFailCount: z.record(z.string(), z.number()),
      strategyPassCount: z.record(z.string(), z.number()),
      strategyFailCount: z.record(z.string(), z.number()),
    })
    .optional(),
  cost: z.number(),
});
export type PromptMetrics = z.infer<typeof PromptMetricsSchema>;

// POST /api/eval/job
export const CreateJobResponseSchema = IdResponseSchema;
export type CreateJobResponse = IdResponse;

// GET /api/eval/job/:id
export const GetJobParamsSchema = IdParamsSchema;
export type GetJobParams = IdParams;

export const GetJobCompleteResponseSchema = z.object({
  status: z.literal('complete'),
  result: z.unknown().nullable(),
  evalId: z.string().nullable(),
  logs: z.array(z.string()),
});
export type GetJobCompleteResponse = z.infer<typeof GetJobCompleteResponseSchema>;

export const GetJobErrorResponseSchema = z.object({
  status: z.literal('error'),
  logs: z.array(z.string()),
});
export type GetJobErrorResponse = z.infer<typeof GetJobErrorResponseSchema>;

export const GetJobInProgressResponseSchema = z.object({
  status: z.literal('in-progress'),
  progress: z.number(),
  total: z.number(),
  logs: z.array(z.string()),
});
export type GetJobInProgressResponse = z.infer<typeof GetJobInProgressResponseSchema>;

export const GetJobResponseSchema = z.discriminatedUnion('status', [
  GetJobCompleteResponseSchema,
  GetJobErrorResponseSchema,
  GetJobInProgressResponseSchema,
]);
export type GetJobResponse = z.infer<typeof GetJobResponseSchema>;

// PATCH /api/eval/:id
export const UpdateEvalRequestSchema = z.object({
  table: z.unknown().optional(),
  config: z.unknown().optional(),
});
export type UpdateEvalRequest = z.infer<typeof UpdateEvalRequestSchema>;

export const UpdateEvalResponseSchema = MessageResponseSchema;
export type UpdateEvalResponse = z.infer<typeof UpdateEvalResponseSchema>;

// PATCH /api/eval/:id/author
export const UpdateAuthorRequestSchema = z.object({ author: z.string() });
export type UpdateAuthorRequest = z.infer<typeof UpdateAuthorRequestSchema>;

export const UpdateAuthorResponseSchema = MessageResponseSchema;
export type UpdateAuthorResponse = z.infer<typeof UpdateAuthorResponseSchema>;

// GET /api/eval/:id/table
export const GetTableQuerySchema = z.object({
  format: z.enum(['csv', 'json']).optional(),
  limit: z.coerce.number().positive().default(50),
  offset: z.coerce.number().nonnegative().default(0),
  filterMode: EvalResultsFilterModeSchema.default('all'),
  search: z.string().default(''),
  filter: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v ? [v] : []))
    .default([]),
  comparisonEvalIds: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v ? [v] : []))
    .default([]),
});
export type GetTableQuery = z.infer<typeof GetTableQuerySchema>;

export const GetTableResponseSchema = z.object({
  table: z.object({
    head: z.object({
      prompts: z.array(z.record(z.unknown())),
      vars: z.array(z.string()),
    }),
    body: z.array(z.record(z.unknown())),
  }),
  totalCount: z.number(),
  filteredCount: z.number(),
  filteredMetrics: z.array(PromptMetricsSchema).nullable(),
  config: z.record(z.unknown()),
  author: z.string().nullable(),
  version: z.number(),
  id: z.string(),
  stats: z.record(z.unknown()).optional(),
});
export type GetTableResponse = z.infer<typeof GetTableResponseSchema>;

// GET /api/eval/:id/metadata-keys
export const GetMetadataKeysQuerySchema = z.object({
  comparisonEvalIds: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v ? [v] : []))
    .optional(),
});
export type GetMetadataKeysQuery = z.infer<typeof GetMetadataKeysQuerySchema>;

export const GetMetadataKeysResponseSchema = z.object({ keys: z.array(z.string()) });
export type GetMetadataKeysResponse = z.infer<typeof GetMetadataKeysResponseSchema>;

// GET /api/eval/:id/metadata-values
export const GetMetadataValuesQuerySchema = z.object({ key: z.string() });
export type GetMetadataValuesQuery = z.infer<typeof GetMetadataValuesQuerySchema>;

export const GetMetadataValuesResponseSchema = z.object({ values: z.array(z.string()) });
export type GetMetadataValuesResponse = z.infer<typeof GetMetadataValuesResponseSchema>;

// POST /api/eval/replay
export const ReplayRequestSchema = z.object({
  evaluationId: z.string(),
  testIndex: z.number().optional(),
  prompt: z.string(),
  variables: z.record(z.unknown()).optional(),
});
export type ReplayRequest = z.infer<typeof ReplayRequestSchema>;

export const ReplayResponseSchema = z.object({
  output: z.string(),
  error: z.unknown().optional(),
  response: z.unknown().optional(),
});
export type ReplayResponse = z.infer<typeof ReplayResponseSchema>;

// POST /api/eval/:evalId/results/:id/rating
export const UpdateRatingParamsSchema = z.object({ evalId: z.string(), id: z.string() });
export type UpdateRatingParams = z.infer<typeof UpdateRatingParamsSchema>;

// UpdateRatingResponse uses passthrough() for dynamic plugin fields
export const UpdateRatingResponseSchema = z
  .object({
    id: z.string(),
    evalId: z.string(),
    description: z.string().nullable().optional(),
    promptIdx: z.number(),
    testIdx: z.number(),
    testCase: z.record(z.unknown()),
    prompt: z.record(z.unknown()),
    promptId: z.string(),
    error: z.string().nullable().optional(),
    success: z.boolean(),
    score: z.number(),
    response: z.record(z.unknown()).optional(),
    gradingResult: GradingResultSchema.nullable().optional(),
    namedScores: z.record(z.string(), z.number()),
    provider: z.object({
      id: z.string(),
      label: z.string().optional(),
      config: z.record(z.unknown()).optional(),
    }),
    latencyMs: z.number(),
    cost: z.number(),
    metadata: z.record(z.unknown()),
    failureReason: z.number(),
    persisted: z.boolean(),
    pluginId: z.string().optional(),
  })
  .passthrough();
export type UpdateRatingResponse = z.infer<typeof UpdateRatingResponseSchema>;

// POST /api/eval/:id/results
/**
 * Single result item for batch result upload.
 * Validates required fields for database insertion.
 */
export const EvalResultItemSchema = z.object({
  id: z.string(),
  promptIdx: z.number().int(),
  testIdx: z.number().int(),
  testCase: z.record(z.unknown()),
  prompt: z.record(z.unknown()),
  promptId: z.string().optional(),
  provider: z.object({
    id: z.string(),
    label: z.string().optional(),
    config: z.record(z.unknown()).optional(),
  }),
  latencyMs: z.number().optional(),
  cost: z.number().optional(),
  response: z.record(z.unknown()).optional(),
  error: z.string().nullable().optional(),
  failureReason: z.number().int().default(0),
  success: z.boolean(),
  score: z.number(),
  gradingResult: GradingResultSchema.nullable().optional(),
  namedScores: z.record(z.string(), z.number()).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type EvalResultItem = z.infer<typeof EvalResultItemSchema>;

export const AddResultsRequestSchema = z.array(EvalResultItemSchema);
export type AddResultsRequest = z.infer<typeof AddResultsRequestSchema>;

// POST /api/eval
/**
 * Request body for creating a new eval.
 * Supports both v3 (with data wrapper) and v4 (direct) formats.
 */
export const CreateEvalRequestV3Schema = z.object({
  data: z.object({
    results: z.record(z.unknown()),
    config: z.record(z.unknown()),
  }),
});

export const CreateEvalRequestV4Schema = z.object({
  config: z.record(z.unknown()),
  prompts: z.array(z.record(z.unknown())).optional(),
  author: z.string().optional(),
  createdAt: z.union([z.string(), z.number()]),
  results: z.array(EvalResultItemSchema),
  vars: z.array(z.string()).optional(),
});

export const CreateEvalRequestSchema = z.union([
  CreateEvalRequestV3Schema,
  CreateEvalRequestV4Schema,
]);
export type CreateEvalRequest = z.infer<typeof CreateEvalRequestSchema>;

export const CreateEvalResponseSchema = IdResponseSchema;
export type CreateEvalResponse = IdResponse;

// DELETE /api/eval/:id
export const DeleteEvalResponseSchema = MessageResponseSchema;
export type DeleteEvalResponse = z.infer<typeof DeleteEvalResponseSchema>;

// DELETE /api/eval (bulk)
export const BulkDeleteEvalsRequestSchema = z.object({ ids: z.array(z.string()) });
export type BulkDeleteEvalsRequest = z.infer<typeof BulkDeleteEvalsRequestSchema>;

// POST /api/eval/:id/copy
export const CopyEvalRequestSchema = z.object({ description: z.string().optional() });
export type CopyEvalRequest = z.infer<typeof CopyEvalRequestSchema>;

export const CopyEvalResponseSchema = z.object({ id: z.string(), distinctTestCount: z.number() });
export type CopyEvalResponse = z.infer<typeof CopyEvalResponseSchema>;

// GET /api/history
export const GetHistoryQuerySchema = z.object({
  tagName: z.string().optional(),
  tagValue: z.string().optional(),
  description: z.string().optional(),
});
export type GetHistoryQuery = z.infer<typeof GetHistoryQuerySchema>;

// Data wrapper responses (loose validation for dynamic data)
const DataArrayResponseSchema = z.object({ data: z.array(z.record(z.unknown())) });
const DataObjectResponseSchema = z.object({ data: z.record(z.unknown()) });

export const GetHistoryResponseSchema = DataArrayResponseSchema;
export type GetHistoryResponse = z.infer<typeof GetHistoryResponseSchema>;

export const GetResultsResponseSchema = DataArrayResponseSchema;
export type GetResultsResponse = z.infer<typeof GetResultsResponseSchema>;

export const GetResultsByIdParamsSchema = IdParamsSchema;
export type GetResultsByIdParams = IdParams;

export const GetResultsByIdResponseSchema = DataObjectResponseSchema;
export type GetResultsByIdResponse = z.infer<typeof GetResultsByIdResponseSchema>;

export const GetDatasetsResponseSchema = DataArrayResponseSchema;
export type GetDatasetsResponse = z.infer<typeof GetDatasetsResponseSchema>;

// GET /api/results/share/check-domain
export const CheckShareDomainQuerySchema = z.object({ id: z.string() });
export type CheckShareDomainQuery = z.infer<typeof CheckShareDomainQuerySchema>;

export const CheckShareDomainResponseSchema = z.object({
  domain: z.string(),
  isCloudEnabled: z.boolean(),
});
export type CheckShareDomainResponse = z.infer<typeof CheckShareDomainResponseSchema>;

// POST /api/results/share
export const ShareResultsRequestSchema = z.object({ id: z.string() });
export type ShareResultsRequest = z.infer<typeof ShareResultsRequestSchema>;

export const ShareResultsResponseSchema = z.object({ url: z.string() });
export type ShareResultsResponse = z.infer<typeof ShareResultsResponseSchema>;

// GET /api/prompts
export const GetPromptsResponseSchema = DataArrayResponseSchema;
export type GetPromptsResponse = z.infer<typeof GetPromptsResponseSchema>;
