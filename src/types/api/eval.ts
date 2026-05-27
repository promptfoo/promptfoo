import { z } from 'zod';
import {
  AssertionOrSetSchema,
  AssertionSchema,
  EvalResultsFilterMode,
  EvaluateOptionsSchema,
  TestSuiteConfigSchema,
} from '../index';
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
  comparisonEvalIds: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v ? [v] : []))
    .prefault([]),
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

/** Upper bound on `limit` for non-export page requests; must stay >= the UI's largest page-size option. */
export const EVAL_TABLE_MAX_PAGE_SIZE = 1000;

/** Query parameters for eval table endpoint. */
export const EvalTableQuerySchema = z
  .object({
    format: z.enum(['csv', 'json']).optional(),
    limit: z.coerce.number().int().positive().prefault(50),
    offset: z.coerce.number().int().nonnegative().prefault(0),
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
  })
  .refine((query) => query.format || query.limit <= EVAL_TABLE_MAX_PAGE_SIZE, {
    message: `limit must be less than or equal to ${EVAL_TABLE_MAX_PAGE_SIZE}`,
    path: ['limit'],
  });

export type EvalTableQuery = z.infer<typeof EvalTableQuerySchema>;

const ShallowEvaluateTableSchema = z
  .object({
    head: z
      .unknown()
      .refine((value) => value !== null && typeof value === 'object', 'Expected table head object'),
    body: z.unknown().refine(Array.isArray, 'Expected table body array'),
  })
  .passthrough();

export const EvalTableResponseSchema = z
  .object({
    table: ShallowEvaluateTableSchema,
    totalCount: z.number(),
    filteredCount: z.number(),
    filteredMetrics: z.array(z.unknown()).nullable(),
    config: z.record(z.string(), z.unknown()),
    author: z.string().nullable(),
    version: z.number(),
    id: z.string(),
    stats: z.unknown(),
  })
  .passthrough();

export const EvalTableJsonExportResponseSchema = z.lazy(() => EvaluateTableSchema);
export type EvalTableResponse = z.infer<typeof EvalTableResponseSchema>;

// POST /api/eval/job

/**
 * Schema for creating a new evaluation job.
 * Based on EvaluateTestSuiteWithEvaluateOptions type.
 * Note: prompts must be an array for this endpoint (evaluate() expects array).
 */
export const CreateJobRequestSchema = TestSuiteConfigSchema.extend({
  // Override prompts to require array - evaluate() calls .map() on prompts
  prompts: z.array(z.union([z.string(), z.record(z.string(), z.unknown())])),
  evaluateOptions: EvaluateOptionsSchema.optional(),
  sourceEvalId: z.string().min(1).optional(),
}).passthrough();

export const CreateJobResponseSchema = z.object({
  id: z.string().uuid(),
});

export type CreateJobRequest = z.infer<typeof CreateJobRequestSchema>;
export type CreateJobResponse = z.infer<typeof CreateJobResponseSchema>;

// GET /api/eval/job/:id

export const GetJobParamsSchema = z.object({
  id: z.string().uuid(),
});

export const GetJobResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('in-progress'),
    progress: z.number(),
    total: z.number(),
    logs: z.array(z.string()),
  }),
  z.object({
    status: z.literal('complete'),
    result: z.record(z.string(), z.unknown()).nullable(),
    evalId: z.string().nullable(),
    logs: z.array(z.string()),
  }),
  z.object({
    status: z.literal('error'),
    logs: z.array(z.string()),
  }),
]);

export type GetJobParams = z.infer<typeof GetJobParamsSchema>;
export type GetJobResponse = z.infer<typeof GetJobResponseSchema>;

// PATCH /api/eval/:id

export const UpdateEvalParamsSchema = EvalIdParamSchema;

/** Schema for EvaluateTable - permissive to allow complex nested structures. */
export const EvaluateTableSchema = z
  .object({
    head: z.object({
      prompts: z.array(z.record(z.string(), z.unknown())),
      vars: z.array(z.string()),
    }),
    body: z.array(z.record(z.string(), z.unknown())),
  })
  .passthrough();

export const UpdateEvalRequestSchema = z.object({
  table: EvaluateTableSchema.optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const UpdateEvalResponseSchema = MessageResponseSchema;

export type UpdateEvalParams = z.infer<typeof UpdateEvalParamsSchema>;
export type UpdateEvalRequest = z.infer<typeof UpdateEvalRequestSchema>;
export type UpdateEvalResponse = z.infer<typeof UpdateEvalResponseSchema>;

// POST /api/eval/:id/results

export const AddResultsParamsSchema = EvalIdParamSchema;

/** Schema for eval results with minimal required fields.
 * EvaluateResult has many optional fields, but these core fields are required
 * for the result to be usable. Using passthrough to preserve all extra fields.
 */
export const AddResultsRequestSchema = z.array(
  z
    .object({
      promptIdx: z.number().int().nonnegative(),
      testIdx: z.number().int().nonnegative(),
      success: z.boolean(),
      score: z.number(),
    })
    .passthrough(),
);

export type AddResultsParams = z.infer<typeof AddResultsParamsSchema>;
export type AddResultsRequest = z.infer<typeof AddResultsRequestSchema>;

// POST /api/eval/replay

export const ReplayRequestSchema = z.object({
  evaluationId: z.string().min(1),
  testIndex: z.number().int().nonnegative().optional(),
  prompt: z.string().min(1),
  variables: z.record(z.string(), z.unknown()).optional(),
});

export const ReplayResponseSchema = z.object({
  // Server serializes non-string outputs to JSON for UI compatibility
  output: z.string(),
  // Providers can emit null, string, or undefined for errors
  error: z.string().nullable().optional(),
  // Full response object preserved for debugging (may contain structured output)
  response: z.record(z.string(), z.unknown()).optional(),
});

export type ReplayRequest = z.infer<typeof ReplayRequestSchema>;
export type ReplayResponse = z.infer<typeof ReplayResponseSchema>;

// POST /api/eval/:evalId/results/:id/rating

export const SubmitRatingParamsSchema = z.object({
  evalId: z.string().min(1),
  id: z.string().min(1),
});

/** Permissive grading result schema. */
export const SubmitRatingRequestSchema = z
  .object({
    pass: z.boolean(),
    score: z.number(),
  })
  .passthrough();

/**
 * Response is the persisted EvalResult row. The route returns the updated
 * record so external SDKs/CLIs can read refreshed metrics without a follow-up
 * fetch. The shape is permissive because EvalResult does not have a Zod
 * schema — only the most commonly-read fields are validated.
 */
export const SubmitRatingResponseSchema = z
  .object({
    id: z.string(),
    success: z.boolean(),
    score: z.number(),
  })
  .passthrough();

export type SubmitRatingParams = z.infer<typeof SubmitRatingParamsSchema>;
export type SubmitRatingRequest = z.infer<typeof SubmitRatingRequestSchema>;
export type SubmitRatingResponse = z.infer<typeof SubmitRatingResponseSchema>;

// POST /api/eval/:evalId/assertions

export const EvalAssertionsParamsSchema = z.object({
  evalId: z.string().min(1),
});

export const PosthocResultsFilterSchema = z.object({
  type: z.string().min(1).max(64),
  operator: z.string().min(1).max(64),
  value: z.string().max(10000).optional(),
  field: z.string().max(256).optional(),
  logicOperator: z.enum(['and', 'or']).optional(),
});

export const PosthocAssertionsScopeSchema = z.object({
  type: z.enum(['results', 'tests', 'filtered']),
  resultIds: z.array(z.string().min(1).max(256)).max(10000).optional(),
  testIndices: z.array(z.number().int().nonnegative()).max(10000).optional(),
  filters: z.array(PosthocResultsFilterSchema).max(100).optional(),
  filterMode: EvalResultsFilterMode.optional(),
  searchText: z.string().max(10000).optional(),
});

export const AddEvalAssertionsRequestSchema = z.object({
  assertions: z.array(AssertionOrSetSchema).min(1).max(100),
  scope: PosthocAssertionsScopeSchema,
});

const AssertionJobErrorSchema = z.object({
  resultId: z.string(),
  error: z.string(),
});

export const AddEvalAssertionsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    jobId: z.string().uuid().nullable(),
    total: z.number().int().nonnegative().optional(),
    matchedTestCount: z.number().int().nonnegative().optional(),
    updatedResults: z.number().int().nonnegative().optional(),
    skippedResults: z.number().int().nonnegative().optional(),
    skippedAssertions: z.number().int().nonnegative().optional(),
    errors: z.array(AssertionJobErrorSchema).optional(),
  }),
});

export const EvalAssertionJobParamsSchema = EvalAssertionsParamsSchema.extend({
  jobId: z.string().min(1),
});

export const EvalAssertionJobResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    status: z.enum(['in-progress', 'complete', 'error']),
    progress: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    completedResults: z.array(
      z.object({
        resultId: z.string(),
        pass: z.boolean(),
        score: z.number(),
      }),
    ),
    updatedResults: z.number().int().nonnegative(),
    skippedResults: z.number().int().nonnegative(),
    skippedAssertions: z.number().int().nonnegative(),
    errors: z.array(AssertionJobErrorSchema),
    matchedTestCount: z.number().int().nonnegative().optional(),
  }),
});

export const GenerateEvalAssertionsRequestSchema = z.object({
  type: z.enum(['llm-rubric', 'g-eval']).default('llm-rubric'),
  numAssertions: z.number().int().min(1).max(20).default(5),
  instructions: z.string().max(4000).optional(),
  provider: z.string().min(1).max(512).optional(),
  testIndices: z.array(z.number().int().nonnegative()).max(10000).optional(),
  resultIds: z.array(z.string().min(1).max(256)).max(10000).optional(),
});

export const GenerateEvalAssertionsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    assertions: z.array(AssertionSchema),
    context: z.object({
      numPromptsAnalyzed: z.number().int().nonnegative(),
      numOutputsAnalyzed: z.number().int().nonnegative(),
      existingAssertionCount: z.number().int().nonnegative(),
    }),
  }),
});

export type EvalAssertionsParams = z.infer<typeof EvalAssertionsParamsSchema>;
export type AddEvalAssertionsRequest = z.infer<typeof AddEvalAssertionsRequestSchema>;
export type AddEvalAssertionsResponse = z.infer<typeof AddEvalAssertionsResponseSchema>;
export type EvalAssertionJobParams = z.infer<typeof EvalAssertionJobParamsSchema>;
export type EvalAssertionJobResponse = z.infer<typeof EvalAssertionJobResponseSchema>;
export type GenerateEvalAssertionsRequest = z.infer<typeof GenerateEvalAssertionsRequestSchema>;
export type GenerateEvalAssertionsResponse = z.infer<typeof GenerateEvalAssertionsResponseSchema>;

// POST /api/eval (save eval to database)

export const SaveEvalRequestSchema = z
  .object({
    data: z
      .object({
        results: z.record(z.string(), z.unknown()),
        config: z.record(z.string(), z.unknown()),
      })
      .passthrough()
      .optional(),
    // Alternative v4 format fields
    config: z.record(z.string(), z.unknown()).optional(),
    prompts: z.array(z.record(z.string(), z.unknown())).optional(),
    results: z.array(z.record(z.string(), z.unknown())).optional(),
    author: z.string().nullable().optional(),
    // createdAt can be string (ISO date) or number (Unix timestamp)
    createdAt: z.union([z.string(), z.number()]).optional(),
    vars: z.array(z.string()).optional(),
  })
  .passthrough();

export const SaveEvalResponseSchema = z.object({
  id: z.string(),
});

export type SaveEvalRequest = z.infer<typeof SaveEvalRequestSchema>;
export type SaveEvalResponse = z.infer<typeof SaveEvalResponseSchema>;

// DELETE /api/eval/:id

export const DeleteEvalParamsSchema = EvalIdParamSchema;
export const DeleteEvalResponseSchema = MessageResponseSchema;

export type DeleteEvalParams = z.infer<typeof DeleteEvalParamsSchema>;
export type DeleteEvalResponse = z.infer<typeof DeleteEvalResponseSchema>;

// DELETE /api/eval (bulk delete)

export const BulkDeleteEvalsRequestSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export type BulkDeleteEvalsRequest = z.infer<typeof BulkDeleteEvalsRequestSchema>;

/** Grouped schemas for server-side validation. */
export const EvalSchemas = {
  CreateJob: {
    Request: CreateJobRequestSchema,
    Response: CreateJobResponseSchema,
  },
  GetJob: {
    Params: GetJobParamsSchema,
    Response: GetJobResponseSchema,
  },
  Update: {
    Params: UpdateEvalParamsSchema,
    Request: UpdateEvalRequestSchema,
    Response: UpdateEvalResponseSchema,
  },
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
    Params: EvalIdParamSchema,
    Query: EvalTableQuerySchema,
    Response: EvalTableResponseSchema,
    JsonExportResponse: EvalTableJsonExportResponseSchema,
  },
  AddResults: {
    Params: AddResultsParamsSchema,
    Request: AddResultsRequestSchema,
  },
  Replay: {
    Request: ReplayRequestSchema,
    Response: ReplayResponseSchema,
  },
  SubmitRating: {
    Params: SubmitRatingParamsSchema,
    Request: SubmitRatingRequestSchema,
    Response: SubmitRatingResponseSchema,
  },
  AddAssertions: {
    Params: EvalAssertionsParamsSchema,
    Request: AddEvalAssertionsRequestSchema,
    Response: AddEvalAssertionsResponseSchema,
  },
  AssertionJob: {
    Params: EvalAssertionJobParamsSchema,
    Response: EvalAssertionJobResponseSchema,
  },
  GenerateAssertions: {
    Params: EvalAssertionsParamsSchema,
    Request: GenerateEvalAssertionsRequestSchema,
    Response: GenerateEvalAssertionsResponseSchema,
  },
  Save: {
    Request: SaveEvalRequestSchema,
    Response: SaveEvalResponseSchema,
  },
  Delete: {
    Params: DeleteEvalParamsSchema,
    Response: DeleteEvalResponseSchema,
  },
  BulkDelete: {
    Request: BulkDeleteEvalsRequestSchema,
  },
} as const;
