import { z } from 'zod';
import { ProviderOptionsSchema } from '../../validators/providers';

// POST /api/providers/test

/** Request body for testing provider connectivity. */
export const TestProviderRequestSchema = z.object({
  prompt: z.string().optional(),
  providerOptions: ProviderOptionsSchema,
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

/** Grouped schemas for server-side validation. */
export const ProviderSchemas = {
  Test: {
    Request: TestProviderRequestSchema,
  },
  TestRequestTransform: {
    Request: TestRequestTransformSchema,
  },
  TestResponseTransform: {
    Request: TestResponseTransformSchema,
  },
} as const;
