import { z } from 'zod';
import { PromptSchema as BasePromptSchema } from '../../validators/prompts';
import { ProviderOptionsSchema, ProviderResponseSchema } from '../../validators/providers';
import { VarsSchema, AtomicTestCaseSchema } from '../index';
import { BaseTokenUsageSchema } from '../shared';
import type { GradingResult } from '../index';

// Extended prompt schema for import/export that includes metrics
// This is specific to the export format and doesn't exist in the main types
const PromptWithMetricsSchema = BasePromptSchema.extend({
  provider: z.string().optional(),
  metrics: z
    .object({
      score: z.number(),
      testPassCount: z.number(),
      testFailCount: z.number(),
      testErrorCount: z.number(),
      assertPassCount: z.number(),
      assertFailCount: z.number(),
      totalLatencyMs: z.number(),
      tokenUsage: BaseTokenUsageSchema.extend({
        assertions: BaseTokenUsageSchema.optional(),
      }).optional(),
      namedScores: z.record(z.number()).optional(),
      namedScoresCount: z.record(z.number()).optional(),
      cost: z.number().optional(),
    })
    .optional(),
});

// Extend the existing ProviderResponseSchema to include all fields
const ResponseSchema = ProviderResponseSchema.extend({
  raw: z.any().optional(),
  isRefusal: z.boolean().optional(),
  sessionId: z.string().optional(),
  guardrails: z
    .object({
      flaggedInput: z.boolean().optional(),
      flaggedOutput: z.boolean().optional(),
      flagged: z.boolean().optional(),
      reason: z.string().optional(),
    })
    .optional(),
  finishReason: z.string().optional(),
  audio: z
    .object({
      id: z.string().optional(),
      expiresAt: z.number().optional(),
      data: z.string().optional(),
      transcript: z.string().optional(),
      format: z.string().optional(),
    })
    .optional(),
  metadata: z
    .object({
      redteamFinalPrompt: z.string().optional(),
      http: z
        .object({
          status: z.number(),
          statusText: z.string(),
          headers: z.record(z.string()),
        })
        .optional(),
    })
    .passthrough()
    .optional(),
});

// Create a GradingResult schema that matches the interface
// We need to define this manually because GradingResult has a recursive structure
const BaseGradingResultSchema = z.object({
  pass: z.boolean(),
  score: z.number(),
  reason: z.string(),
  namedScores: z.record(z.number()).optional(),
  tokensUsed: BaseTokenUsageSchema.optional(),
  assertion: z.any().optional(), // Complex Assertion type, validated elsewhere
  comment: z.string().optional(),
});

const GradingResultSchema: z.ZodType<GradingResult> = BaseGradingResultSchema.extend({
  componentResults: z.lazy(() => z.array(GradingResultSchema)).optional(),
});

// Common fields shared between V2 and V3 eval results
const EvalResultBaseSchema = z.object({
  prompt: BasePromptSchema,
  vars: VarsSchema,
  response: ResponseSchema.optional(),
  error: z.string().optional(),
  success: z.boolean(),
  score: z.number(),
  latencyMs: z.number().optional(),
  gradingResult: GradingResultSchema.optional(),
  namedScores: z.record(z.number()).optional(),
  cost: z.number().optional(),
  metadata: z.record(z.any()).optional(),
});

// Stats schema specific to the export format
// TODO: Consider moving this to a shared location if used elsewhere
const StatsSchema = z.object({
  successes: z.number(),
  failures: z.number(),
  tokenUsage: BaseTokenUsageSchema.optional(),
});

// V2 Eval Result Schema - matches the v2 export format
// This is a simplified version compared to the full EvaluateResult interface
const EvalResultV2Schema = EvalResultBaseSchema; // V2 uses exactly the base schema

// V2 Eval Table Schema
const EvalTableSchema = z.object({
  head: z.object({
    prompts: z.array(BasePromptSchema),
    vars: z.array(z.string()),
  }),
  body: z.array(
    z.object({
      outputs: z.array(z.any()), // Can be strings, objects, or ProviderResponse
      vars: z.array(z.string()),
      test: z.any().optional(), // References AtomicTestCase
    }),
  ),
});

// V2 Summary Schema
export const EvaluateSummaryV2Schema = z.object({
  version: z.literal(2),
  timestamp: z.string(),
  results: z.array(EvalResultV2Schema),
  table: EvalTableSchema,
  stats: StatsSchema,
});

// V3 Eval Result Schema - matches the v3 export format
// Similar to EvaluateResult interface but with some fields optional for backwards compatibility
const EvalResultV3Schema = EvalResultBaseSchema.extend({
  id: z.string().optional(), // Result ID
  provider: ProviderOptionsSchema.pick({
    id: true,
    label: true,
  }).required({ id: true }),
  promptId: z.string(), // Reference to prompt
  promptIdx: z.number(),
  testIdx: z.number(),
  testCase: AtomicTestCaseSchema.omit({ vars: true }).extend({
    vars: VarsSchema.optional(),
    providerOutput: z.union([z.string(), z.object({})]).optional(),
  }),
  failureReason: z.number().optional(), // May not be present in older exports
});

// V3 Summary Schema
export const EvaluateSummaryV3Schema = z.object({
  version: z.literal(3),
  timestamp: z.string(),
  prompts: z.array(PromptWithMetricsSchema),
  results: z.array(EvalResultV3Schema),
  stats: StatsSchema,
});

// Common fields shared between V2 and V3 import files
const ImportFileBaseSchema = z.object({
  id: z.string().optional(),
  createdAt: z.string().optional(),
  author: z.string().optional(),
  config: z.record(z.any()), // UnifiedConfig is complex, validated elsewhere
  shareableUrl: z.string().nullable().optional(),
});

// Shared metadata schema for import files
const ImportFileMetadataSchema = z
  .object({
    promptfooVersion: z.string().optional(),
    nodeVersion: z.string().optional(),
    platform: z.string().optional(),
    arch: z.string().optional(),
    exportedAt: z.string().optional(),
    evaluationCreatedAt: z.string().optional(),
    author: z.string().optional(),
  })
  .optional();

// Import file schemas
export const ImportFileV2Schema = ImportFileBaseSchema.extend({
  description: z.string().optional(),
  results: EvaluateSummaryV2Schema,
  metadata: ImportFileMetadataSchema,
});

export const ImportFileV3Schema = ImportFileBaseSchema.extend({
  evalId: z.string().optional(), // Note: exports use evalId, not id
  results: EvaluateSummaryV3Schema,
  metadata: ImportFileMetadataSchema,
  relationships: z
    .object({
      tags: z.array(z.string()).optional(),
      datasets: z.array(z.any()).optional(),
      prompts: z.array(z.any()).optional(),
    })
    .optional(),
});

// Union schema that accepts either version
export const ImportFileSchema = z.union([ImportFileV2Schema, ImportFileV3Schema]);

// Type exports
export type ImportFileV2 = z.infer<typeof ImportFileV2Schema>;
export type ImportFileV3 = z.infer<typeof ImportFileV3Schema>;
export type ImportFile = z.infer<typeof ImportFileSchema>;
