import { z } from 'zod';

// Shared schemas
const EvalIdParamSchema = z.object({
  id: z.string(),
});

// Test suite schemas (currently using catchall in request schema)

const EvaluateOptionsSchema = z.object({
  maxConcurrency: z.number().optional(),
  repeat: z.number().optional(),
  delay: z.number().optional(),
  cache: z.boolean().optional(),
  eventSource: z.string().optional(),
  interactiveProviders: z.boolean().optional(),
  showProgressBar: z.boolean().optional(),
});

// Eval job schemas
export const EvalJobDTOSchemas = {
  Create: {
    Request: z.object({
      evaluateOptions: EvaluateOptionsSchema.optional(),
    }).catchall(z.any()), // Allow additional properties from test suite
    Response: z.object({
      id: z.string(),
    }),
  },
  Get: {
    Params: z.object({
      id: z.string(),
    }),
    Response: z.union([
      z.object({
        status: z.literal('in-progress'),
        progress: z.number(),
        total: z.number(),
        message: z.string().optional(),
      }),
      z.object({
        status: z.literal('complete'),
        result: z.any(), // EvaluateSummary
        evalId: z.string(),
      }),
      z.object({
        status: z.literal('error'),
        message: z.string(),
        logs: z.array(z.string()).optional(),
      }),
    ]),
  },
};

// Eval CRUD schemas
export const EvalDTOSchemas = {
  Create: {
    Request: z.object({
      results: z.any(), // EvaluateSummary
      config: z.any(), // UnifiedConfig
      prompts: z.array(z.string()).optional(),
      createdAt: z.string().optional(),
      author: z.string().optional(),
      id: z.string().optional(), // Allow id from existing eval
      datasetId: z.string().optional(), // Allow datasetId
    }),
    Response: z.object({
      id: z.string(),
    }),
  },
  Update: {
    Params: EvalIdParamSchema,
    Request: z.object({
      table: z.any().optional(), // EvaluateTable
      config: z.any().optional(), // Partial<UnifiedConfig>
    }),
    Response: z.object({
      message: z.string(),
    }),
  },
  Delete: {
    Params: EvalIdParamSchema,
    Response: z.object({
      message: z.string(),
    }),
  },
  UpdateAuthor: {
    Params: EvalIdParamSchema,
    Request: z.object({
      author: z.string().email(),
    }),
    Response: z.object({
      message: z.string(),
    }),
  },
  GetTable: {
    Params: EvalIdParamSchema,
    Query: z.object({
      offset: z.coerce.number().int().nonnegative().default(0),
      limit: z.coerce.number().int().positive().optional(),
      query: z.string().optional(),
      filter: z.enum(['all', 'failures']).optional(),
      scoreFilter: z.object({
        above: z.coerce.number().optional(),
        below: z.coerce.number().optional(),
      }).optional(),
      metadataFilter: z.record(z.string()).optional(),
      tagsFilter: z.array(z.string()).optional(),
      sort: z.enum(['score', 'timestamp', 'model']).optional(),
      order: z.enum(['asc', 'desc']).optional(),
    }),
    Response: z.object({
      table: z.any(), // EvaluateTable
      totalCount: z.number(),
      filteredCount: z.number(),
      config: z.any(), // Partial<UnifiedConfig>
      author: z.string().nullable(),
    }),
  },
  AddResults: {
    Params: EvalIdParamSchema,
    Request: z.array(z.any()), // EvalResult[]
    Response: z.void(),
  },
  UpdateResultRating: {
    Params: z.object({
      evalId: z.string(),
      id: z.string(),
    }),
    Request: z.any(), // GradingResult
    Response: z.any(), // Updated result
  },
};

// Type exports for eval jobs
export type EvalJobCreateRequest = z.infer<typeof EvalJobDTOSchemas.Create.Request>;
export type EvalJobCreateResponse = z.infer<typeof EvalJobDTOSchemas.Create.Response>;
export type EvalJobGetParams = z.infer<typeof EvalJobDTOSchemas.Get.Params>;
export type EvalJobGetResponse = z.infer<typeof EvalJobDTOSchemas.Get.Response>;

// Type exports for eval CRUD
export type EvalCreateRequest = z.infer<typeof EvalDTOSchemas.Create.Request>;
export type EvalCreateResponse = z.infer<typeof EvalDTOSchemas.Create.Response>;
export type EvalUpdateParams = z.infer<typeof EvalDTOSchemas.Update.Params>;
export type EvalUpdateRequest = z.infer<typeof EvalDTOSchemas.Update.Request>;
export type EvalUpdateResponse = z.infer<typeof EvalDTOSchemas.Update.Response>;
export type EvalDeleteParams = z.infer<typeof EvalDTOSchemas.Delete.Params>;
export type EvalDeleteResponse = z.infer<typeof EvalDTOSchemas.Delete.Response>;
export type EvalUpdateAuthorParams = z.infer<typeof EvalDTOSchemas.UpdateAuthor.Params>;
export type EvalUpdateAuthorRequest = z.infer<typeof EvalDTOSchemas.UpdateAuthor.Request>;
export type EvalUpdateAuthorResponse = z.infer<typeof EvalDTOSchemas.UpdateAuthor.Response>;
export type EvalGetTableParams = z.infer<typeof EvalDTOSchemas.GetTable.Params>;
export type EvalGetTableQuery = z.infer<typeof EvalDTOSchemas.GetTable.Query>;
export type EvalGetTableResponse = z.infer<typeof EvalDTOSchemas.GetTable.Response>;
export type EvalAddResultsParams = z.infer<typeof EvalDTOSchemas.AddResults.Params>;
export type EvalAddResultsRequest = z.infer<typeof EvalDTOSchemas.AddResults.Request>;
export type EvalUpdateResultRatingParams = z.infer<typeof EvalDTOSchemas.UpdateResultRating.Params>;
export type EvalUpdateResultRatingRequest = z.infer<typeof EvalDTOSchemas.UpdateResultRating.Request>;
export type EvalUpdateResultRatingResponse = z.infer<typeof EvalDTOSchemas.UpdateResultRating.Response>;