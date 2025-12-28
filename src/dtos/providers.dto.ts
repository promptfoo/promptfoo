/**
 * Providers API DTOs.
 *
 * These schemas define the request/response shapes for provider-related endpoints.
 */
import { z } from 'zod';
import { ProviderOptionsSchema } from '../validators/providers';

// =============================================================================
// GET /api/providers
// =============================================================================

/**
 * Response for GET /api/providers
 * Providers can be string IDs (e.g., "openai:gpt-4") or full configuration objects.
 */
export const GetProvidersResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    providers: z.array(z.union([z.string(), ProviderOptionsSchema])),
    hasCustomConfig: z.boolean(),
  }),
});
export type GetProvidersResponse = z.infer<typeof GetProvidersResponseSchema>;

// =============================================================================
// GET /api/providers/config-status
// =============================================================================

/**
 * Response for GET /api/providers/config-status
 */
export const GetConfigStatusResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    hasCustomConfig: z.boolean(),
  }),
});
export type GetConfigStatusResponse = z.infer<typeof GetConfigStatusResponseSchema>;

// =============================================================================
// POST /api/providers/test
// =============================================================================

/**
 * Request body for POST /api/providers/test
 */
export const TestProviderRequestSchema = z.object({
  prompt: z.string().optional(),
  providerOptions: z.object({
    id: z.string(),
    config: z.record(z.unknown()).optional(),
  }),
});
export type TestProviderRequest = z.infer<typeof TestProviderRequestSchema>;

/**
 * Provider response from API call.
 */
export const ProviderResponseSchema = z.object({
  output: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  tokenUsage: z.record(z.unknown()).optional(),
  cost: z.number().optional(),
  cached: z.boolean().optional(),
  logProbs: z.array(z.number()).optional(),
  raw: z.unknown().optional(),
});
export type ProviderResponse = z.infer<typeof ProviderResponseSchema>;

/**
 * Response for POST /api/providers/test
 */
export const TestProviderResponseSchema = z.object({
  testResult: z.object({
    success: z.boolean(),
    message: z.string().optional(),
    error: z.string().optional(),
    changes_needed: z.boolean().optional(),
    changes_needed_reason: z.string().optional(),
    changes_needed_suggestions: z.array(z.string()).optional(),
  }),
  providerResponse: ProviderResponseSchema.optional(),
  transformedRequest: z.unknown().optional(),
});
export type TestProviderResponse = z.infer<typeof TestProviderResponseSchema>;

// =============================================================================
// POST /api/providers/discover
// =============================================================================

/**
 * Tool argument in discovery result.
 */
export const DiscoveredToolArgumentSchema = z.object({
  name: z.string(),
  description: z.string(),
  type: z.string(),
});
export type DiscoveredToolArgument = z.infer<typeof DiscoveredToolArgumentSchema>;

/**
 * Tool discovered during target purpose discovery.
 */
export const DiscoveredToolSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    arguments: z.array(DiscoveredToolArgumentSchema),
  })
  .nullable();
export type DiscoveredTool = z.infer<typeof DiscoveredToolSchema>;

/**
 * Response for POST /api/providers/discover
 * Matches TargetPurposeDiscoveryResult from src/redteam/commands/discover.ts
 */
export const DiscoverProviderResponseSchema = z.object({
  purpose: z.string().nullable(),
  limitations: z.string().nullable(),
  user: z.string().nullable(),
  tools: z.array(DiscoveredToolSchema),
});
export type DiscoverProviderResponse = z.infer<typeof DiscoverProviderResponseSchema>;

// =============================================================================
// POST /api/providers/http-generator
// =============================================================================

/**
 * Request body for POST /api/providers/http-generator
 */
export const HttpGeneratorRequestSchema = z.object({
  requestExample: z.string(),
  responseExample: z.string().optional(),
});
export type HttpGeneratorRequest = z.infer<typeof HttpGeneratorRequestSchema>;

/**
 * Response for POST /api/providers/http-generator
 * Returns generated HTTP provider configuration.
 */
export const HttpGeneratorResponseSchema = z.object({
  config: z.record(z.unknown()).optional(),
  url: z.string().optional(),
  method: z.string().optional(),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
  responseParser: z.string().optional(),
});
export type HttpGeneratorResponse = z.infer<typeof HttpGeneratorResponseSchema>;

// =============================================================================
// POST /api/providers/test-request-transform
// =============================================================================

/**
 * Request body for POST /api/providers/test-request-transform
 */
export const TestRequestTransformRequestSchema = z.object({
  transformCode: z.string().optional(),
  prompt: z.string(),
});
export type TestRequestTransformRequest = z.infer<typeof TestRequestTransformRequestSchema>;

/**
 * Response for POST /api/providers/test-request-transform
 */
export const TestRequestTransformResponseSchema = z.object({
  success: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});
export type TestRequestTransformResponse = z.infer<typeof TestRequestTransformResponseSchema>;

// =============================================================================
// POST /api/providers/test-response-transform
// =============================================================================

/**
 * Request body for POST /api/providers/test-response-transform
 */
export const TestResponseTransformRequestSchema = z.object({
  transformCode: z.string().optional(),
  response: z.string(),
});
export type TestResponseTransformRequest = z.infer<typeof TestResponseTransformRequestSchema>;

/**
 * Response for POST /api/providers/test-response-transform
 */
export const TestResponseTransformResponseSchema = z.object({
  success: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});
export type TestResponseTransformResponse = z.infer<typeof TestResponseTransformResponseSchema>;

// =============================================================================
// POST /api/providers/test-session
// =============================================================================

/**
 * Request body for POST /api/providers/test-session
 */
export const TestSessionRequestSchema = z.object({
  provider: z.object({
    id: z.string(),
    config: z.record(z.unknown()).optional(),
  }),
  sessionConfig: z
    .object({
      sessionSource: z.string().optional(),
      sessionParser: z.string().optional(),
    })
    .optional(),
});
export type TestSessionRequest = z.infer<typeof TestSessionRequestSchema>;

/**
 * Response for POST /api/providers/test-session
 */
export const TestSessionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
  sessionId: z.string().optional(),
  responses: z.array(z.unknown()).optional(),
});
export type TestSessionResponse = z.infer<typeof TestSessionResponseSchema>;
