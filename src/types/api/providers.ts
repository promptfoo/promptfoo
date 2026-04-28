import { z } from 'zod';
import { ProviderOptionsSchema } from '../../validators/providers';
import { ErrorResponseSchema, JsonObjectSchema } from './common';

// Refined ProviderOptionsSchema that requires id as a non-empty string at runtime.
// The base ProviderOptionsSchema uses z.custom<ProviderId>().optional() which provides
// no runtime type checking. Routes that require id use this stricter version.
const ProviderOptionsWithIdSchema = ProviderOptionsSchema.extend({
  id: z.string().min(1, 'Provider ID is required'),
});

// POST /api/providers/test

/** Request body for testing provider connectivity. */
export const TestProviderRequestSchema = z.object({
  prompt: z.string().optional(),
  providerOptions: ProviderOptionsWithIdSchema,
});

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

export const ConfigStatusResponseSchema = z.union([
  z.object({
    success: z.literal(true),
    data: z.object({
      hasCustomConfig: z.boolean(),
    }),
  }),
  ErrorResponseSchema,
]);

export const TestProviderResponseSchema = z
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
  .passthrough();

export type TestProviderRequest = z.infer<typeof TestProviderRequestSchema>;
export type TestProviderResponse = z.infer<typeof TestProviderResponseSchema>;

// POST /api/providers/test-request-transform

/** Request body for testing request transforms. */
export const TestRequestTransformSchema = z.object({
  transformCode: z.string().optional(),
  prompt: z.string(),
});

export type TestRequestTransform = z.infer<typeof TestRequestTransformSchema>;

// POST /api/providers/test-response-transform

/** Request body for testing response transforms. */
export const TestResponseTransformSchema = z.object({
  transformCode: z.string().optional(),
  response: z.string(),
});

export type TestResponseTransform = z.infer<typeof TestResponseTransformSchema>;

// POST /api/providers/http-generator

/** Request body for generating HTTP provider config from example request/response. */
export const HttpGeneratorRequestSchema = z.object({
  requestExample: z.string().min(1),
  responseExample: z.string().optional(),
});

export const DiscoverResponseSchema = z.object({
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
});

export const HttpGeneratorResponseSchema = JsonObjectSchema;

export type HttpGeneratorRequest = z.infer<typeof HttpGeneratorRequestSchema>;

// POST /api/providers/test-session

/** Request body for testing multi-turn session functionality. */
export const TestSessionRequestSchema = z.object({
  provider: ProviderOptionsWithIdSchema,
  sessionConfig: z
    .object({
      sessionSource: z.string().optional(),
      sessionParser: z.string().optional(),
    })
    .optional(),
  mainInputVariable: z.string().optional(),
});

export const TestRequestTransformResponseSchema = ProviderTransformResultSchema;
export const TestResponseTransformResponseSchema = ProviderTransformResultSchema;
export const TestSessionResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string().optional(),
    error: z.string().optional(),
  })
  .passthrough();

export type TestSessionRequest = z.infer<typeof TestSessionRequestSchema>;
export type ConfigStatusResponse = z.infer<typeof ConfigStatusResponseSchema>;
export type DiscoverResponse = z.infer<typeof DiscoverResponseSchema>;
export type HttpGeneratorResponse = z.infer<typeof HttpGeneratorResponseSchema>;
export type TestRequestTransformResponse = z.infer<typeof TestRequestTransformResponseSchema>;
export type TestResponseTransformResponse = z.infer<typeof TestResponseTransformResponseSchema>;
export type TestSessionResponse = z.infer<typeof TestSessionResponseSchema>;

/** Grouped schemas for server-side validation. */
export const ProviderSchemas = {
  ConfigStatus: { Response: ConfigStatusResponseSchema },
  Test: { Request: TestProviderRequestSchema, Response: TestProviderResponseSchema },
  Discover: { Request: ProviderOptionsWithIdSchema, Response: DiscoverResponseSchema },
  HttpGenerator: { Request: HttpGeneratorRequestSchema, Response: HttpGeneratorResponseSchema },
  TestRequestTransform: {
    Request: TestRequestTransformSchema,
    Response: TestRequestTransformResponseSchema,
  },
  TestResponseTransform: {
    Request: TestResponseTransformSchema,
    Response: TestResponseTransformResponseSchema,
  },
  TestSession: { Request: TestSessionRequestSchema, Response: TestSessionResponseSchema },
} as const;
