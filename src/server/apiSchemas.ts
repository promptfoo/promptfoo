import { z } from 'zod';

const EmailSchema = z.string().email();

// Shared schemas for reuse
const ProviderOptionsSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  config: z.record(z.any()).optional(),
});

const AssertionSchema = z.object({
  type: z.string(),
  value: z.any().optional(),
  threshold: z.number().optional(),
  weight: z.number().optional(),
  provider: z.string().optional(),
  metric: z.string().optional(),
});

const GradingResultSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    pass: z.boolean(),
    score: z.number(),
    reason: z.string().optional(),
    namedScores: z.record(z.number()).optional(),
    tokensUsed: z
      .object({
        prompt: z.number().optional(),
        completion: z.number().optional(),
        cached: z.number().optional(),
        total: z.number(),
      })
      .optional(),
    componentResults: z.array(GradingResultSchema).optional(),
    assertion: AssertionSchema.optional(),
    comment: z.string().optional(),
    suggestions: z.array(z.any()).optional(),
    metadata: z.record(z.any()).optional(),
  }),
);

const TestCaseSchema = z.object({
  description: z.string().optional(),
  vars: z.record(z.any()).optional(),
  assert: z.array(AssertionSchema).optional(),
  threshold: z.number().optional(),
  metadata: z.record(z.any()).optional(),
  options: z.record(z.any()).optional(),
  provider: z.union([z.string(), ProviderOptionsSchema]).optional(),
});

const PromptSchema = z.object({
  raw: z.string(),
  display: z.string().optional(),
  label: z.string().optional(),
  function: z.string().optional(),
});

const ProviderResponseSchema = z.object({
  output: z.any().optional(),
  error: z.string().optional(),
  tokenUsage: z
    .object({
      prompt: z.number().optional(),
      completion: z.number().optional(),
      cached: z.number().optional(),
      total: z.number(),
    })
    .optional(),
  cost: z.number().optional(),
  cached: z.boolean().optional(),
  logProbs: z.array(z.number()).optional(),
  metadata: z.record(z.any()).optional(),
});

export const ApiSchemas = {
  User: {
    Get: {
      Response: z.object({
        email: EmailSchema.nullable(),
      }),
    },
    GetId: {
      Response: z.object({
        id: z.string(),
      }),
    },
    Update: {
      Request: z.object({
        email: EmailSchema,
      }),
      Response: z.object({
        success: z.boolean(),
        message: z.string(),
      }),
    },
    EmailStatus: {
      Response: z.object({
        hasEmail: z.boolean(),
        email: EmailSchema.optional(),
        status: z.enum([
          'ok',
          'exceeded_limit',
          'show_usage_warning',
          'no_email',
          'risky_email',
          'disposable_email',
        ]),
        message: z.string().optional(),
      }),
    },
  },
  Eval: {
    UpdateAuthor: {
      Params: z.object({
        id: z.string(),
      }),
      Request: z.object({
        author: z.string().email(),
      }),
      Response: z.object({
        message: z.string(),
      }),
    },
    MetadataKeys: {
      Params: z.object({
        id: z.string().min(3).max(128),
      }),
      Query: z.object({
        comparisonEvalIds: z.array(z.string()).optional(),
      }),
      Response: z.object({
        keys: z.array(z.string()),
      }),
    },
    MetadataValues: {
      Params: z.object({
        id: z.string().min(3).max(128),
      }),
      Query: z.object({
        key: z.string().min(1),
      }),
      Response: z.object({
        values: z.array(z.string()),
      }),
    },
    Copy: {
      Params: z.object({
        id: z.string(),
      }),
      Request: z.object({
        description: z.string().optional(),
      }),
      Response: z.object({
        id: z.string(),
        distinctTestCount: z.number(),
      }),
    },
    Results: {
      Params: z.object({
        evalId: z.string().min(1),
      }),
      Query: z.object({
        testIdx: z.coerce.number().int().nonnegative().optional(),
        promptIdx: z.coerce.number().int().nonnegative().optional(),
        hasHumanRating: z
          .enum(['true', 'false'])
          .transform((v) => v === 'true')
          .optional(),
        success: z
          .enum(['true', 'false'])
          .transform((v) => v === 'true')
          .optional(),
      }),
      Response: z.object({
        results: z.array(
          z.object({
            id: z.string(),
            evalId: z.string(),
            testIdx: z.number(),
            promptIdx: z.number(),
            testCase: TestCaseSchema,
            prompt: PromptSchema,
            provider: ProviderOptionsSchema,
            output: z.any().optional(),
            response: ProviderResponseSchema.nullable().optional(),
            success: z.boolean(),
            score: z.number(),
            gradingResult: GradingResultSchema.nullable().optional(),
            namedScores: z.record(z.number()).optional(),
            latencyMs: z.number(),
            cost: z.number(),
            metadata: z.record(z.any()).optional(),
            error: z.string().nullable().optional(),
          }),
        ),
        count: z.number(),
      }),
    },
  },
};
