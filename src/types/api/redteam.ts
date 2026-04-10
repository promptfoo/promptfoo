import { z } from 'zod';
import { ALL_PLUGINS, ALL_STRATEGIES } from '../../redteam/constants';
import {
  ConversationMessageSchema,
  PluginConfigSchema,
  StrategyConfigSchema,
} from '../../redteam/types';

import type { Plugin, Strategy } from '../../redteam/constants';

// POST /api/redteam/generate-test

export const TestCaseGenerationSchema = z.object({
  plugin: z.object({
    id: z.string().refine((val) => ALL_PLUGINS.includes(val as Plugin), {
      message: `Invalid plugin ID. Must be one of: ${ALL_PLUGINS.join(', ')}`,
    }) as unknown as z.ZodType<Plugin>,
    config: PluginConfigSchema.optional().prefault({}),
  }),
  strategy: z.object({
    id: z.string().refine((val) => (ALL_STRATEGIES as string[]).includes(val), {
      message: `Invalid strategy ID. Must be one of: ${ALL_STRATEGIES.join(', ')}`,
    }) as unknown as z.ZodType<Strategy>,
    config: StrategyConfigSchema.optional().prefault({}),
  }),
  config: z.object({
    applicationDefinition: z.object({
      purpose: z.string().nullable(),
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

// POST /api/redteam/run

export const RedteamRunRequestSchema = z.object({
  config: z.record(z.string(), z.unknown()),
  force: z.boolean().optional(),
  verbose: z.boolean().optional(),
  delay: z.coerce.number().min(0).optional(),
  maxConcurrency: z.coerce.number().int().min(1).optional(),
});

export type RedteamRunRequest = z.infer<typeof RedteamRunRequestSchema>;

// POST /api/redteam/:taskId

export const RedteamTaskParamsSchema = z.object({
  taskId: z.string().min(1).max(128),
});

export type RedteamTaskParams = z.infer<typeof RedteamTaskParamsSchema>;

export const RedteamTaskRequestSchema = z.record(z.string(), z.unknown());

export type RedteamTaskRequest = z.infer<typeof RedteamTaskRequestSchema>;

/** Grouped schemas for server-side validation. */
export const RedteamSchemas = {
  GenerateTest: { Request: TestCaseGenerationSchema },
  Run: { Request: RedteamRunRequestSchema },
  Task: { Params: RedteamTaskParamsSchema, Request: RedteamTaskRequestSchema },
} as const;
