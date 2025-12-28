/**
 * Redteam API DTOs.
 *
 * These schemas define the request/response shapes for red team endpoints.
 */
import { z } from 'zod';

// =============================================================================
// Common Redteam Types
// =============================================================================

/**
 * Conversation message in multi-turn interactions.
 * Note: Role only includes 'user' and 'assistant' - matches src/redteam/types.ts
 */
export const ConversationMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;

/**
 * Multi-turn conversation state.
 */
export const MultiTurnStateSchema = z.object({
  strategy: z.string(),
  turn: z.number(),
  nextTurn: z.number(),
  maxTurns: z.number(),
  done: z.boolean(),
  stateful: z.boolean(),
  history: z.array(ConversationMessageSchema),
});
export type MultiTurnState = z.infer<typeof MultiTurnStateSchema>;

/**
 * Test case metadata.
 * Note: Plugins and strategies can add arbitrary fields, so we use passthrough().
 * Core fields are explicitly typed, but additional plugin-specific fields are allowed.
 */
export const TestCaseMetadataSchema = z
  .object({
    pluginId: z.string().optional(),
    strategyId: z.string().optional(),
    goal: z.string().optional(),
    harmCategory: z.string().optional(),
    pluginConfig: z.record(z.unknown()).optional(),
    purpose: z.string().optional(),
    multiTurn: MultiTurnStateSchema.optional(),
  })
  .passthrough();
export type TestCaseMetadata = z.infer<typeof TestCaseMetadataSchema>;

// =============================================================================
// POST /api/redteam/generate-test
// =============================================================================

/**
 * Request body for POST /api/redteam/generate-test
 */
export const GenerateTestRequestSchema = z.object({
  plugin: z.object({
    id: z.string(),
    config: z.record(z.unknown()).optional(),
  }),
  strategy: z.object({
    id: z.string(),
    config: z.record(z.unknown()).optional(),
  }),
  config: z.object({
    applicationDefinition: z.object({
      purpose: z.string().nullable(),
    }),
  }),
  turn: z.number().int().min(0).optional(),
  maxTurns: z.number().int().min(1).optional(),
  history: z.array(ConversationMessageSchema).optional(),
  goal: z.string().optional(),
  stateful: z.boolean().optional(),
  count: z.number().int().min(1).max(10).optional(),
});
export type GenerateTestRequest = z.infer<typeof GenerateTestRequestSchema>;

/**
 * Single test case response for POST /api/redteam/generate-test
 *
 * Returned when count=1 (default) or for multi-turn strategies.
 * Use the `kind` discriminator for type-safe pattern matching.
 */
export const GenerateTestSingleResponseSchema = z.object({
  kind: z.literal('single'),
  prompt: z.string(),
  context: z.string(),
  metadata: TestCaseMetadataSchema.optional(),
});
export type GenerateTestSingleResponse = z.infer<typeof GenerateTestSingleResponseSchema>;

/**
 * Batch test cases response for POST /api/redteam/generate-test (count > 1)
 *
 * Use the `kind` discriminator for type-safe pattern matching.
 */
export const GenerateTestBatchResponseSchema = z.object({
  kind: z.literal('batch'),
  testCases: z.array(
    z.object({
      prompt: z.string(),
      context: z.string(),
      metadata: TestCaseMetadataSchema.optional(),
    }),
  ),
  count: z.number(),
});
export type GenerateTestBatchResponse = z.infer<typeof GenerateTestBatchResponseSchema>;

/**
 * Discriminated union response for POST /api/redteam/generate-test
 *
 * Use `kind` for type-safe pattern matching:
 * ```ts
 * if (response.kind === 'single') {
 *   console.log(response.prompt);  // TypeScript knows this is GenerateTestSingleResponse
 * } else {
 *   console.log(response.testCases);  // TypeScript knows this is GenerateTestBatchResponse
 * }
 * ```
 */
export const GenerateTestResponseSchema = z.discriminatedUnion('kind', [
  GenerateTestSingleResponseSchema,
  GenerateTestBatchResponseSchema,
]);
export type GenerateTestResponse = z.infer<typeof GenerateTestResponseSchema>;

// =============================================================================
// POST /api/redteam/run
// =============================================================================

/**
 * Request body for POST /api/redteam/run
 */
export const RunRedteamRequestSchema = z.object({
  config: z.record(z.unknown()),
  force: z.boolean().optional(),
  verbose: z.boolean().optional(),
  delay: z.number().optional(),
  maxConcurrency: z.number().optional(),
});
export type RunRedteamRequest = z.infer<typeof RunRedteamRequestSchema>;

/**
 * Response for POST /api/redteam/run
 */
export const RunRedteamResponseSchema = z.object({
  id: z.string(),
});
export type RunRedteamResponse = z.infer<typeof RunRedteamResponseSchema>;

// =============================================================================
// POST /api/redteam/cancel
// =============================================================================

/**
 * Response for POST /api/redteam/cancel
 */
export const CancelRedteamResponseSchema = z.object({
  message: z.string(),
});
export type CancelRedteamResponse = z.infer<typeof CancelRedteamResponseSchema>;

// =============================================================================
// POST /api/redteam/:taskId (Cloud proxy)
// =============================================================================

/**
 * Params for POST /api/redteam/:taskId
 */
export const CloudTaskParamsSchema = z.object({
  taskId: z.string(),
});
export type CloudTaskParams = z.infer<typeof CloudTaskParamsSchema>;

/**
 * Response for POST /api/redteam/:taskId
 * Returns dynamic JSON from cloud function.
 */
export const CloudTaskResponseSchema = z.record(z.unknown());
export type CloudTaskResponse = z.infer<typeof CloudTaskResponseSchema>;

// =============================================================================
// GET /api/redteam/status
// =============================================================================

/**
 * Response for GET /api/redteam/status
 */
export const GetRedteamStatusResponseSchema = z.object({
  hasRunningJob: z.boolean(),
  jobId: z.string().nullable(),
});
export type GetRedteamStatusResponse = z.infer<typeof GetRedteamStatusResponseSchema>;

// =============================================================================
// POST /api/redteam/custom-policy-generation-task
// =============================================================================

/**
 * Policy object in generation response.
 */
export const PolicyObjectSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  text: z.string().optional(),
});
export type PolicyObject = z.infer<typeof PolicyObjectSchema>;

/**
 * Request body for POST /api/redteam/custom-policy-generation-task
 */
export const CustomPolicyGenerationRequestSchema = z.object({
  applicationDefinition: z.record(z.unknown()),
  existingPolicies: z.array(z.string()).optional(),
});
export type CustomPolicyGenerationRequest = z.infer<typeof CustomPolicyGenerationRequestSchema>;

/**
 * Response for POST /api/redteam/custom-policy-generation-task
 */
export const CustomPolicyGenerationResponseSchema = z.object({
  result: z.array(PolicyObjectSchema).optional(),
  error: z.string().nullable(),
  task: z.string(),
  details: z.string().optional(),
});
export type CustomPolicyGenerationResponse = z.infer<typeof CustomPolicyGenerationResponseSchema>;
