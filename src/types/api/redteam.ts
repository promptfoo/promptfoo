import { z } from 'zod';
import { ALL_PLUGINS, ALL_STRATEGIES } from '../../redteam/constants';
import {
  ConversationMessageSchema,
  PluginConfigSchema,
  StrategyConfigSchema,
} from '../../redteam/types';
import { MessageResponseSchema } from './common';

import type { Plugin, Strategy } from '../../redteam/constants';

// POST /api/redteam/generate-test

export const TestCaseGenerationSchema = z.object({
  plugin: z.object({
    id: z.string().refine((val) => ALL_PLUGINS.includes(val as Plugin), {
      message: `Invalid plugin ID. Must be one of: ${ALL_PLUGINS.join(', ')}`,
    }) as unknown as z.ZodType<Plugin>,
    config: PluginConfigSchema.catchall(z.unknown()).optional().prefault({}),
  }),
  strategy: z.object({
    id: z.string().refine((val) => (ALL_STRATEGIES as string[]).includes(val), {
      message: `Invalid strategy ID. Must be one of: ${ALL_STRATEGIES.join(', ')}`,
    }) as unknown as z.ZodType<Strategy>,
    config: StrategyConfigSchema.optional().prefault({}),
  }),
  config: z.object({
    applicationDefinition: z.object({
      purpose: z.string().nullable().optional(),
    }),
  }),
  turn: z.int().min(0).optional().prefault(0),
  maxTurns: z.int().min(1).optional(),
  history: z.array(ConversationMessageSchema).optional().prefault([]),
  goal: z.string().optional(),
  stateful: z.boolean().optional(),
  // Batch generation: number of test cases to generate (1-10, default 1)
  count: z.int().min(1).max(10).optional().prefault(1),
});

export type TestCaseGeneration = z.infer<typeof TestCaseGenerationSchema>;

const GeneratedTestCaseResponseSchema = z.object({
  prompt: z.string(),
  context: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const TestCaseGenerationResponseSchema = z.union([
  GeneratedTestCaseResponseSchema,
  z.object({
    testCases: z.array(GeneratedTestCaseResponseSchema),
    count: z.number().int().nonnegative(),
  }),
]);

export type TestCaseGenerationResponse = z.infer<typeof TestCaseGenerationResponseSchema>;

// POST /api/redteam/run

export const RedteamRunRequestSchema = z.object({
  config: z.record(z.string(), z.unknown()),
  force: z.boolean().optional(),
  verbose: z.boolean().optional(),
  delay: z.coerce.number().min(0).optional(),
  maxConcurrency: z.coerce.number().int().min(1).optional(),
});

export type RedteamRunRequest = z.infer<typeof RedteamRunRequestSchema>;

export const RedteamRunResponseSchema = z.object({
  id: z.string().uuid(),
});

export type RedteamRunResponse = z.infer<typeof RedteamRunResponseSchema>;

// POST /api/redteam/cancel

export const RedteamCancelResponseSchema = MessageResponseSchema;

export type RedteamCancelResponse = z.infer<typeof RedteamCancelResponseSchema>;

// POST /api/redteam/:taskId

export const RedteamTaskParamsSchema = z.object({
  taskId: z.string().min(1).max(128),
});

export type RedteamTaskParams = z.infer<typeof RedteamTaskParamsSchema>;

export const RedteamTaskRequestSchema = z.record(z.string(), z.unknown());

export const RedteamTaskResponseSchema = z.unknown();

export type RedteamTaskRequest = z.infer<typeof RedteamTaskRequestSchema>;
export type RedteamTaskResponse = z.infer<typeof RedteamTaskResponseSchema>;

// GET /api/redteam/status

export const RedteamStatusResponseSchema = z.object({
  hasRunningJob: z.boolean(),
  jobId: z.string().nullable(),
});

export type RedteamStatusResponse = z.infer<typeof RedteamStatusResponseSchema>;

// Configuration agent endpoints

const ConfigAgentMessageSchema = z.unknown();
const ConfigAgentSessionSchema = z.unknown();

export const ConfigAgentStartRequestSchema = z.object({
  baseUrl: z.string().trim().min(1, 'URL is required').max(4096, 'URL is too long'),
});

const ConfigAgentSessionIdSchema = z.string().min(1).max(128);
const ConfigAgentFieldSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
  .optional();

export const ConfigAgentInputRequestSchema = z.discriminatedUnion('type', [
  z.object({
    sessionId: ConfigAgentSessionIdSchema,
    type: z.literal('message'),
    value: z.string().max(100_000),
    field: ConfigAgentFieldSchema,
  }),
  z.object({
    sessionId: ConfigAgentSessionIdSchema,
    type: z.literal('option'),
    value: z.string().min(1).max(128),
    field: ConfigAgentFieldSchema,
  }),
  z.object({
    sessionId: ConfigAgentSessionIdSchema,
    type: z.literal('api_key'),
    value: z.string().max(32_768),
    field: ConfigAgentFieldSchema,
  }),
  z.object({
    sessionId: ConfigAgentSessionIdSchema,
    type: z.literal('confirmation'),
    value: z.boolean(),
    field: ConfigAgentFieldSchema,
  }),
]);

export const ConfigAgentStartResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    sessionId: z.string(),
    messages: z.array(ConfigAgentMessageSchema),
  }),
});

export const ConfigAgentInputResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    messages: z.array(ConfigAgentMessageSchema),
    session: ConfigAgentSessionSchema,
  }),
});

export const ConfigAgentSessionResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    messages: z.array(ConfigAgentMessageSchema),
    session: ConfigAgentSessionSchema,
    config: z.unknown().optional(),
    isComplete: z.boolean(),
  }),
});

export const ConfigAgentDeleteResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({}),
});

/** Grouped schemas for server-side validation. */
export const RedteamSchemas = {
  GenerateTest: { Request: TestCaseGenerationSchema, Response: TestCaseGenerationResponseSchema },
  Run: { Request: RedteamRunRequestSchema, Response: RedteamRunResponseSchema },
  Cancel: { Response: RedteamCancelResponseSchema },
  Task: {
    Params: RedteamTaskParamsSchema,
    Request: RedteamTaskRequestSchema,
    Response: RedteamTaskResponseSchema,
  },
  Status: { Response: RedteamStatusResponseSchema },
  ConfigAgentStart: {
    Request: ConfigAgentStartRequestSchema,
    Response: ConfigAgentStartResponseSchema,
  },
  ConfigAgentInput: {
    Request: ConfigAgentInputRequestSchema,
    Response: ConfigAgentInputResponseSchema,
  },
  ConfigAgentSession: { Response: ConfigAgentSessionResponseSchema },
  ConfigAgentDelete: { Response: ConfigAgentDeleteResponseSchema },
} as const;
