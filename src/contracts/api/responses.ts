import { z } from 'zod';
import { JsonObjectSchema, MessageResponseSchema } from './common.js';

const UnknownArraySchema = z.array(z.unknown());
const DataResponseSchema = z.object({ data: z.unknown() });

const EvalTableResponseSchema = z
  .object({
    table: z
      .object({
        head: z
          .unknown()
          .refine(
            (value) => value !== null && typeof value === 'object',
            'Expected table head object',
          ),
        body: z.unknown().refine(Array.isArray, 'Expected table body array'),
      })
      .passthrough(),
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

const GetEvalJobResponseSchema = z.discriminatedUnion('status', [
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

export const EVAL_TABLE_MAX_PAGE_SIZE = 1000;

export const EvalResponseSchemas = {
  CreateJob: { Response: z.object({ id: z.string().uuid() }) },
  GetJob: { Response: GetEvalJobResponseSchema },
  Update: { Response: MessageResponseSchema },
  UpdateAuthor: { Response: MessageResponseSchema },
  MetadataKeys: { Response: z.object({ keys: z.array(z.string()) }) },
  MetadataValues: { Response: z.object({ values: z.array(z.string()) }) },
  Copy: {
    Response: z.object({
      id: z.string(),
      distinctTestCount: z.number(),
    }),
  },
  Table: { Response: EvalTableResponseSchema },
  Replay: {
    Response: z.object({
      output: z.string(),
      error: z.string().nullable().optional(),
      response: z.record(z.string(), z.unknown()).optional(),
    }),
  },
  SubmitRating: {
    Response: z
      .object({
        id: z.string(),
        success: z.boolean(),
        score: z.number(),
      })
      .passthrough(),
  },
  Save: { Response: z.object({ id: z.string() }) },
  Delete: { Response: MessageResponseSchema },
} as const;

export type UpdateEvalAuthorResponse = z.infer<
  (typeof EvalResponseSchemas.UpdateAuthor)['Response']
>;

const ProviderTransformResultSchema = z.union([
  z.object({
    success: z.literal(true),
    result: z.unknown(),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
    result: z.unknown().optional(),
  }),
]);

export const ProviderResponseSchemas = {
  ConfigStatus: {
    Response: z.union([
      z.object({
        success: z.literal(true),
        data: z.object({ hasCustomConfig: z.boolean() }),
      }),
      z.object({ success: z.literal(false).optional(), error: z.string() }).passthrough(),
    ]),
  },
  Test: {
    Response: z
      .object({
        testResult: z
          .object({
            success: z.boolean(),
            message: z.string(),
            error: z.string().optional(),
            changes_needed: z.boolean().optional(),
            changes_needed_reason: z.string().optional(),
            changes_needed_suggestions: z.array(z.string()).optional(),
          })
          .passthrough(),
        providerResponse: z.unknown().optional(),
        transformedRequest: z.unknown().optional(),
      })
      .passthrough(),
  },
  Discover: {
    Response: z.object({
      purpose: z.string().nullable(),
      limitations: z.string().nullable(),
      user: z.string().nullable(),
      tools: z.array(
        z
          .object({
            name: z.string(),
            description: z.string(),
            arguments: z.array(
              z.object({
                name: z.string(),
                description: z.string(),
                type: z.string(),
              }),
            ),
          })
          .nullable(),
      ),
    }),
  },
  HttpGenerator: { Response: JsonObjectSchema },
  TestRequestTransform: { Response: ProviderTransformResultSchema },
  TestResponseTransform: { Response: ProviderTransformResultSchema },
  TestSession: {
    Response: z
      .object({
        success: z.boolean(),
        message: z.string(),
        reason: z.string().optional(),
        error: z.string().optional(),
        details: z
          .object({
            sessionId: z.string().optional(),
            sessionSource: z.string().optional(),
            request1: z.object({ prompt: z.string(), sessionId: z.string().optional() }).optional(),
            response1: z.unknown().optional(),
            request2: z.object({ prompt: z.string(), sessionId: z.string().optional() }).optional(),
            response2: z.unknown().optional(),
            hasSessionIdTemplate: z.boolean().optional(),
            hasSessionParser: z.boolean().optional(),
            sessionParser: z.string().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough(),
  },
} as const;

export type TestSessionResponse = z.infer<(typeof ProviderResponseSchemas.TestSession)['Response']>;

const GeneratedTestCaseResponseSchema = z.object({
  prompt: z.string(),
  context: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const RedteamResponseSchemas = {
  GenerateTest: {
    Response: z.union([
      GeneratedTestCaseResponseSchema,
      z.object({
        testCases: z.array(GeneratedTestCaseResponseSchema),
        count: z.number().int().nonnegative(),
      }),
    ]),
  },
  Run: { Response: z.object({ id: z.string().uuid() }) },
  Cancel: { Response: MessageResponseSchema },
  Task: { Response: z.unknown() },
  Status: {
    Response: z.object({
      hasRunningJob: z.boolean(),
      jobId: z.string().nullable(),
    }),
  },
} as const;

export const ServerResponseSchemas = {
  Health: {
    Response: z.object({ status: z.string(), version: z.string() }),
  },
  RemoteHealth: {
    Response: z.object({ status: z.string(), message: z.string() }),
  },
  ResultList: {
    Response: z.object({ data: z.array(JsonObjectSchema) }),
  },
  Result: { Response: DataResponseSchema },
  Prompts: { Response: z.object({ data: UnknownArraySchema }) },
  History: { Response: z.object({ data: UnknownArraySchema }) },
  Prompt: { Response: z.object({ data: UnknownArraySchema }) },
  Datasets: { Response: z.object({ data: UnknownArraySchema }) },
  ShareCheckDomain: {
    Response: z.object({
      domain: z.string(),
      isCloudEnabled: z.boolean(),
    }),
  },
  Share: {
    Response: z.object({ url: z.string().nullable().optional() }),
  },
  DatasetGenerate: { Response: z.object({ results: z.unknown() }) },
  Telemetry: { Response: z.object({ success: z.literal(true) }) },
} as const;
