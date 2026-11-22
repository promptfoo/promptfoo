import { z } from 'zod';
import {
  HttpProviderConfigFieldsSchema,
  HttpProviderConfigInputSchema,
} from '../../contracts/providerConfig/http';
import { ALL_PLUGINS, ALL_STRATEGIES, type Plugin, type Strategy } from '../../redteam/constants';
import {
  ConversationMessageSchema,
  PluginConfigSchema,
  StrategyConfigSchema,
} from '../../redteam/types';
import { ProviderOptionsSchema } from '../../validators/providers';
import {
  RedteamConfigSchema,
  RedteamPluginSchema,
  RedteamStrategySchema,
} from '../../validators/redteam';
import { CONFIG_PROVIDER_INPUT_ERROR, hasValidConfigProviders } from '../configAliases';
import { UnifiedConfigSchema } from '../index';
import { BaseTokenUsageSchema } from '../shared';
import { MessageResponseSchema } from './common';
import { JsonProviderOptionsWithIdSchema } from './providers';
import {
  HostedSetupReplySchema,
  RedteamSetupReplySchema,
  SetupConfigSchema,
  SetupConnectionTest,
} from './redteamSetup';

// Runtime parsers strip unknown keys. Report typos to the agent instead of
// showing an option in Review that Promptfoo will silently ignore.
const [pluginId, pluginOptions] = RedteamPluginSchema.options;
const [strategyId, strategyOptions] = RedteamStrategySchema.options;
const partialConfig = z.object(UnifiedConfigSchema.in.shape).partial();
const setupInput = z.strictObject({
  ...partialConfig.shape,
  redteam: RedteamConfigSchema.in
    .strict()
    .extend({
      plugins: z.array(z.union([pluginId, pluginOptions.strict()])).optional(),
      strategies: z.array(z.union([strategyId, strategyOptions.strict()])).optional(),
    })
    .optional(),
});

// Validate native drafts without constructing a provider or loading external files.
export function httpTargetValidationIssue(target: unknown): string | undefined {
  const value = typeof target === 'string' ? { id: target } : target;
  if (
    !value ||
    typeof value !== 'object' ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !/^https?(?::\/\/|$)/.test(value.id)
  ) {
    return;
  }
  const config = 'config' in value ? value.config : {};
  const fields = HttpProviderConfigFieldsSchema.safeParse(config);
  if (!fields.success) {
    const issue = fields.error.issues[0];
    const field = issue.code === 'unrecognized_keys' ? issue.keys[0] : issue.path[0];
    return typeof field === 'string' && /^[a-z_][\w-]{0,63}$/i.test(field)
      ? 'Invalid HTTP target option config.' + field + '.'
      : 'Unknown or invalid HTTP target config option.';
  }
  if (!HttpProviderConfigInputSchema.safeParse(config).success) {
    return 'An HTTP target needs a body, raw request, multipart upload, or explicit GET method.';
  }
  if (!fields.data.request && !fields.data.url && !value.id.includes('://')) {
    return 'The HTTP target needs a URL.';
  }
}

// POST /api/redteam/generate-test

function normalizePreviewGenerationProvider(provider: unknown): unknown {
  if (typeof provider === 'string') {
    const id = provider.trim();
    return id || undefined;
  }

  if (provider && typeof provider === 'object' && !Array.isArray(provider)) {
    const providerObject = provider as Record<string, unknown>;
    if (typeof providerObject.id !== 'string') {
      return undefined;
    }

    const id = providerObject.id.trim();
    return id ? { ...providerObject, id } : undefined;
  }

  return provider;
}

const PreviewGenerationProviderSchema = z.preprocess(
  normalizePreviewGenerationProvider,
  z.union([z.string().min(1), JsonProviderOptionsWithIdSchema]).optional(),
);

export const TestCaseGenerationSchema = z.object({
  plugin: z.object({
    id: z.string().refine((val) => ALL_PLUGINS.includes(val as Plugin), {
      message: `Invalid plugin ID. Must be one of: ${ALL_PLUGINS.join(', ')}`,
    }) as unknown as z.ZodType<Plugin>,
    config: PluginConfigSchema.catchall(z.unknown()).prefault({}),
  }),
  strategy: z.object({
    id: z.string().refine((val) => (ALL_STRATEGIES as string[]).includes(val), {
      message: `Invalid strategy ID. Must be one of: ${ALL_STRATEGIES.join(', ')}`,
    }) as unknown as z.ZodType<Strategy>,
    config: StrategyConfigSchema.prefault({}),
  }),
  config: z.object({
    applicationDefinition: z.object({
      purpose: z.string().nullable().optional(),
    }),
  }),
  provider: PreviewGenerationProviderSchema.optional(),
  turn: z.int().min(0).prefault(0),
  maxTurns: z.int().min(1).optional(),
  history: z.array(ConversationMessageSchema).prefault([]),
  goal: z.string().optional(),
  stateful: z.boolean().optional(),
  // Batch generation: number of test cases to generate (1-10, default 1)
  count: z.int().min(1).max(10).prefault(1),
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
    tokenUsage: BaseTokenUsageSchema.optional(),
  }),
]);

export type TestCaseGenerationResponse = z.infer<typeof TestCaseGenerationResponseSchema>;

// POST /api/redteam/run

const userTurnsSchema = z.array(z.string().max(16000)).max(256);

export const RedteamRunRequestSchema = z.object({
  fromAgent: z.boolean().optional(),
  userTurns: userTurnsSchema.optional(),
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

/** Grouped schemas for server-side validation. */
export const RedteamSchemas = {
  SetupConnectionTest,
  SetupPlan: {
    HostedReply: HostedSetupReplySchema,
    Input: setupInput,
    Draft: partialConfig.refine((data) => hasValidConfigProviders(data, true), {
      message: CONFIG_PROVIDER_INPUT_ERROR,
    }),
    Complete: UnifiedConfigSchema,
    Provider: ProviderOptionsSchema.strict().extend({ id: z.string().min(1) }),
    ProviderMap: z.record(z.string(), ProviderOptionsSchema.strict()),
    Request: z.strictObject({
      // Require a client that discloses hosted processing of connection messages.
      version: z.literal(3),
      priorUserTurns: userTurnsSchema
        .optional()
        .describe(
          'Earlier user messages used only for local destination and credential checks. Never forwarded to Cloud.',
        ),
      messages: z
        .array(
          z.strictObject({
            role: z.enum(['user', 'assistant']),
            content: z.string().trim().min(1).max(16000),
          }),
        )
        .min(1)
        .max(24)
        .refine((messages) => messages.reduce((n, m) => n + m.content.length, 0) <= 48000),
      config: SetupConfigSchema.optional(),
      verification: SetupConnectionTest.Response.extend({
        targetIndex: z.int().nonnegative().optional(),
      }).optional(),
    }),
    Response: RedteamSetupReplySchema,
  },
  GenerateTest: { Request: TestCaseGenerationSchema, Response: TestCaseGenerationResponseSchema },
  Run: { Request: RedteamRunRequestSchema, Response: RedteamRunResponseSchema },
  Cancel: { Response: RedteamCancelResponseSchema },
  Task: {
    Params: RedteamTaskParamsSchema,
    Request: RedteamTaskRequestSchema,
    Response: RedteamTaskResponseSchema,
  },
  Status: { Response: RedteamStatusResponseSchema },
} as const;
