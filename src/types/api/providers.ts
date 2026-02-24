import { z } from 'zod';
import { ProviderOptionsSchema } from '../../validators/providers';

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

export type TestProviderRequest = z.infer<typeof TestProviderRequestSchema>;

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

export type TestSessionRequest = z.infer<typeof TestSessionRequestSchema>;

/** Grouped schemas for server-side validation. */
export const ProviderSchemas = {
  Test: { Request: TestProviderRequestSchema },
  Discover: { Request: ProviderOptionsWithIdSchema },
  HttpGenerator: { Request: HttpGeneratorRequestSchema },
  TestRequestTransform: { Request: TestRequestTransformSchema },
  TestResponseTransform: { Request: TestResponseTransformSchema },
  TestSession: { Request: TestSessionRequestSchema },
} as const;
