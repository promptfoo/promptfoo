import dedent from 'dedent';
import { z } from 'zod';
import {
  ALIASED_PLUGIN_MAPPINGS,
  ALIASED_PLUGINS,
  ALL_STRATEGIES,
  CANARY_BREAKING_STRATEGY_IDS,
  COLLECTIONS,
  DEFAULT_NUM_TESTS_PER_PLUGIN,
  DEFAULT_STRATEGIES,
  FINANCIAL_PLUGINS,
  FOUNDATION_PLUGINS,
  FRAMEWORK_COMPLIANCE_IDS,
  GUARDRAILS_EVALUATION_PLUGINS,
  HARM_PLUGINS,
  INSURANCE_PLUGINS,
  MEDICAL_PLUGINS,
  PHARMACY_PLUGINS,
  PII_PLUGINS,
  PLUGIN_CATEGORIES,
  ADDITIONAL_PLUGINS as REDTEAM_ADDITIONAL_PLUGINS,
  ADDITIONAL_STRATEGIES as REDTEAM_ADDITIONAL_STRATEGIES,
  ALL_PLUGINS as REDTEAM_ALL_PLUGINS,
  DEFAULT_PLUGINS as REDTEAM_DEFAULT_PLUGINS,
  Severity,
  SeveritySchema,
  STRATEGY_EXEMPT_PLUGINS,
  TEEN_SAFETY_PLUGINS,
} from '../redteam/constants';
import { CODING_AGENT_CORE_PLUGINS, CODING_AGENT_PLUGINS } from '../redteam/constants/codingAgents';
import { isCustomStrategy } from '../redteam/constants/strategies';
import { isJavascriptFile } from '../util/fileExtensions';
import { ProviderSchema } from '../validators/providers';

import type { Collection, FrameworkComplianceId, Plugin, Strategy } from '../redteam/constants';
import type {
  PluginConfig,
  RedteamContext,
  RedteamFileConfig,
  RedteamPluginObject,
  RedteamStrategy,
  TracingConfig,
} from '../redteam/types';

const TracingConfigSchema: z.ZodType<TracingConfig> = z.lazy(() =>
  z.object({
    enabled: z.boolean().optional(),
    includeInAttack: z.boolean().optional(),
    includeInGrading: z.boolean().optional(),
    includeInternalSpans: z.boolean().optional(),
    maxSpans: z.int().positive().optional(),
    maxDepth: z.int().positive().optional(),
    maxRetries: z.int().nonnegative().optional(),
    retryDelayMs: z.int().nonnegative().optional(),
    spanFilter: z.array(z.string()).optional(),
    sanitizeAttributes: z.boolean().optional(),
    strategies: z
      .record(
        z.string(),
        z.lazy(() => TracingConfigSchema),
      )
      .optional(),
  }),
);

/**
 * Schema for redteam contexts - allows testing multiple security contexts/states
 */
export const RedteamContextSchema = z.object({
  id: z.string().describe('Unique identifier for the context'),
  purpose: z
    .string()
    .optional()
    .describe(
      'Optional purpose/context for this context - used for generation and grading, or inherited from the root redteam purpose when omitted or blank',
    ),
  vars: z
    .record(z.string(), z.string())
    .optional()
    .describe('Variables passed to provider (e.g., context_file, user_role)'),
});

const frameworkOptions = FRAMEWORK_COMPLIANCE_IDS as unknown as [
  FrameworkComplianceId,
  ...FrameworkComplianceId[],
];

export const pluginOptions: string[] = [
  ...new Set([...COLLECTIONS, ...REDTEAM_ALL_PLUGINS, ...ALIASED_PLUGINS]),
].sort();
/**
 * Schema for individual redteam plugins
 */
export const RedteamPluginObjectSchema = z.object({
  id: z
    .union([
      z.enum(pluginOptions as [string, ...string[]]).superRefine((val, ctx) => {
        if (!pluginOptions.includes(val)) {
          ctx.addIssue({
            code: 'custom',
            message: `Invalid plugin name "${val}". Must be one of: ${pluginOptions.join(', ')} (or a path starting with file://)`,
          });
        }
      }),
      z.string().superRefine((val, ctx) => {
        if (!val.startsWith('file://')) {
          ctx.addIssue({
            code: 'custom',
            message: `Invalid plugin id "${val}". Custom plugins must start with file:// or use a built-in plugin. See https://www.promptfoo.dev/docs/red-team/plugins for available plugins.`,
          });
        }
      }),
    ])
    .describe('Name of the plugin'),
  numTests: z
    .int()
    .positive()
    .prefault(DEFAULT_NUM_TESTS_PER_PLUGIN)
    .describe('Number of tests to generate for this plugin'),
  config: z.record(z.string(), z.unknown()).optional().describe('Plugin-specific configuration'),
  severity: SeveritySchema.optional().describe('Severity level for this plugin'),
});

const RedteamConfigPluginObjectSchema = RedteamPluginObjectSchema.extend({
  numTests: z.int().positive().optional().describe('Number of tests to generate for this plugin'),
});

/**
 * Schema for individual redteam plugins or their shorthand.
 */
export const RedteamPluginSchema = z.union([
  z
    .union([
      z.enum(pluginOptions as [string, ...string[]]).superRefine((val, ctx) => {
        if (!pluginOptions.includes(val)) {
          ctx.addIssue({
            code: 'custom',
            message: `Invalid plugin name "${val}". Must be one of: ${pluginOptions.join(', ')} (or a path starting with file://)`,
          });
        }
      }),
      z.string().superRefine((val, ctx) => {
        if (!val.startsWith('file://')) {
          ctx.addIssue({
            code: 'custom',
            message: `Invalid plugin id "${val}". Custom plugins must start with file:// or use a built-in plugin. See https://www.promptfoo.dev/docs/red-team/plugins for available plugins.`,
          });
        }
      }),
    ])
    .describe('Name of the plugin or path to custom plugin'),
  RedteamConfigPluginObjectSchema,
]);

export const strategyIdSchema = z.union([
  z.enum(ALL_STRATEGIES as unknown as [string, ...string[]]).superRefine((val, ctx) => {
    // Allow 'multilingual' for backward compatibility - it will be migrated to language config
    if (val === 'multilingual') {
      return;
    }
    if (!ALL_STRATEGIES.includes(val as Strategy)) {
      ctx.addIssue({
        code: 'custom',
        message: `Invalid strategy name "${val}". Must be one of: ${[...ALL_STRATEGIES].join(', ')} (or a path starting with file://)`,
      });
    }
  }),
  z.string().refine(
    (value) => {
      // Allow 'multilingual' for backward compatibility
      if (value === 'multilingual') {
        return true;
      }
      return value.startsWith('file://') && isJavascriptFile(value);
    },
    {
      message: `Custom strategies must start with file:// and end with .js or .ts, or use one of the built-in strategies: ${[...ALL_STRATEGIES].join(', ')}`,
    },
  ),
  z.string().refine(
    (value) => {
      return isCustomStrategy(value);
    },
    {
      message: `Strategy must be one of the built-in strategies: ${[...ALL_STRATEGIES].join(', ')} (or a path starting with file://)`,
    },
  ),
]);
/**
 * Schema for individual redteam strategies
 */
export const RedteamStrategySchema = z.union([
  strategyIdSchema,
  z.object({
    id: strategyIdSchema,
    config: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Strategy-specific configuration'),
  }),
]);

function getCharsPerMessageLimit(limit: unknown): number | undefined {
  return typeof limit === 'number' && Number.isInteger(limit) && limit > 0 ? limit : undefined;
}

function hasValidCharsPerMessageLimit(limit: unknown): boolean {
  return limit === undefined || getCharsPerMessageLimit(limit) !== undefined;
}

function hasValidCharsPerMessageRange(data: {
  maxCharsPerMessage?: number;
  minCharsPerMessage?: number;
}): boolean {
  return (
    data.maxCharsPerMessage === undefined ||
    data.minCharsPerMessage === undefined ||
    data.minCharsPerMessage <= data.maxCharsPerMessage
  );
}

function getStringList(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : undefined;
}

function strategyTargetsPlugin(
  strategyId: string,
  strategyConfig: Record<string, unknown> | undefined,
  pluginId: string,
  pluginConfig: Record<string, unknown> | undefined,
): boolean {
  if (!strategyId) {
    return true;
  }
  if (STRATEGY_EXEMPT_PLUGINS.some((exemptPlugin) => exemptPlugin === pluginId)) {
    return false;
  }
  if (
    CANARY_BREAKING_STRATEGY_IDS.includes(strategyId) &&
    getExpandedPluginIds(pluginId).some((expandedPluginId) =>
      expandedPluginId.startsWith('coding-agent:'),
    )
  ) {
    return false;
  }
  if (getStringList(pluginConfig?.excludeStrategies)?.includes(strategyId)) {
    return false;
  }
  const targetPlugins = getStringList(strategyConfig?.plugins);
  return (
    !targetPlugins ||
    targetPlugins.length === 0 ||
    targetPlugins.some((targetPlugin) => pluginMatchesTarget(pluginId, targetPlugin))
  );
}

function pluginMatchesTarget(pluginId: string, targetPlugin: string): boolean {
  return getExpandedPluginIds(pluginId).some((expandedPluginId) =>
    pluginIdsOverlap(expandedPluginId, targetPlugin),
  );
}

function getExpandedPluginIds(pluginId: string): string[] {
  if (ALIASED_PLUGIN_MAPPINGS[pluginId]) {
    return Object.values(ALIASED_PLUGIN_MAPPINGS[pluginId]).flatMap(({ plugins }) =>
      plugins.flatMap(getExpandedPluginIds),
    );
  }
  if (COLLECTIONS.includes(pluginId as Collection)) {
    return getCollectionPluginIds(pluginId as Collection);
  }
  const aliasedMapping = Object.values(ALIASED_PLUGIN_MAPPINGS).find((mapping) =>
    Object.keys(mapping).includes(pluginId),
  );
  return aliasedMapping?.[pluginId].plugins.flatMap(getExpandedPluginIds) ?? [pluginId];
}

function getCollectionPluginIds(collection: Collection): string[] {
  const collectionPlugins: Record<Collection, readonly string[]> = {
    ...PLUGIN_CATEGORIES,
    foundation: [...FOUNDATION_PLUGINS],
    default: [...REDTEAM_DEFAULT_PLUGINS],
    'guardrails-eval': [...GUARDRAILS_EVALUATION_PLUGINS],
    'coding-agent:core': [...CODING_AGENT_CORE_PLUGINS],
    'coding-agent:all': [...CODING_AGENT_PLUGINS],
  };
  return [...collectionPlugins[collection]];
}

function pluginIdsOverlap(pluginId: string, targetPlugin: string): boolean {
  return (
    pluginId === targetPlugin ||
    pluginId.startsWith(`${targetPlugin}:`) ||
    targetPlugin.startsWith(`${pluginId}:`)
  );
}

type ScopedPromptLimitConfig = Record<string, unknown> & {
  maxCharsPerMessage?: unknown;
  minCharsPerMessage?: unknown;
};
type ScopedPromptLimit = string | { id: string; config?: ScopedPromptLimitConfig };

type PromptLimitConfig = {
  maxCharsPerMessage?: number;
  minCharsPerMessage?: number;
  plugins?: ScopedPromptLimit[];
  strategies?: ScopedPromptLimit[];
};

function isBasicStrategy(strategy: ScopedPromptLimit): boolean {
  return (typeof strategy === 'string' ? strategy : strategy.id) === 'basic';
}

function addCharsPerMessageRangeIssue(ctx: z.RefinementCtx, path: (string | number)[]): void {
  ctx.addIssue({
    code: 'custom',
    message: 'minCharsPerMessage must be less than or equal to maxCharsPerMessage',
    path,
  });
}

function validateScopedCharsPerMessageLimits(
  scopes: ScopedPromptLimit[],
  scopeName: 'plugins' | 'strategies',
  ctx: z.RefinementCtx,
): void {
  for (const [index, scope] of scopes.entries()) {
    if (typeof scope === 'string' || !scope.config) {
      continue;
    }
    for (const key of ['maxCharsPerMessage', 'minCharsPerMessage'] as const) {
      if (!hasValidCharsPerMessageLimit(scope.config[key])) {
        ctx.addIssue({
          code: 'custom',
          message: `${key} must be a positive integer`,
          path: [scopeName, index, 'config', key],
        });
      }
    }
    if (
      !hasValidCharsPerMessageRange({
        maxCharsPerMessage: getCharsPerMessageLimit(scope.config.maxCharsPerMessage),
        minCharsPerMessage: getCharsPerMessageLimit(scope.config.minCharsPerMessage),
      })
    ) {
      addCharsPerMessageRangeIssue(ctx, [scopeName, index, 'config', 'minCharsPerMessage']);
    }
  }
}

function validateEffectiveCharsPerMessageRanges(
  data: PromptLimitConfig,
  ctx: z.RefinementCtx,
): void {
  const pluginConfigs = (data.plugins ?? []).map((plugin, index) => ({
    index,
    plugin: typeof plugin === 'string' ? { id: plugin } : plugin,
  }));
  const strategyConfigs = (data.strategies ?? [])
    .filter((strategy) => !isBasicStrategy(strategy))
    .map((strategy, index) => ({
      index,
      strategy: typeof strategy === 'string' ? { id: strategy } : strategy,
    }));
  const effectivePlugins =
    pluginConfigs.length > 0 ? pluginConfigs : [{ index: 0, plugin: { id: '' } }];
  const effectiveStrategies =
    strategyConfigs.length > 0 ? strategyConfigs : [{ index: 0, strategy: { id: '' } }];
  for (const { index: strategyIndex, strategy } of effectiveStrategies) {
    for (const { index: pluginIndex, plugin } of effectivePlugins) {
      if (!strategyTargetsPlugin(strategy.id, strategy.config, plugin.id, plugin.config)) {
        continue;
      }
      const effectiveRange = {
        maxCharsPerMessage:
          data.maxCharsPerMessage ??
          getCharsPerMessageLimit(strategy.config?.maxCharsPerMessage) ??
          getCharsPerMessageLimit(plugin.config?.maxCharsPerMessage),
        minCharsPerMessage:
          data.minCharsPerMessage ??
          getCharsPerMessageLimit(strategy.config?.minCharsPerMessage) ??
          getCharsPerMessageLimit(plugin.config?.minCharsPerMessage),
      };
      if (!hasValidCharsPerMessageRange(effectiveRange)) {
        addCharsPerMessageRangeIssue(
          ctx,
          strategy.config?.minCharsPerMessage === undefined
            ? ['plugins', pluginIndex, 'config', 'minCharsPerMessage']
            : ['strategies', strategyIndex, 'config', 'minCharsPerMessage'],
        );
      }
    }
  }
}

/**
 * Schema for `promptfoo redteam generate` command options
 */
// NOTE: Remember to edit types/redteam.ts:RedteamCliGenerateOptions if you edit this schema
export const RedteamGenerateOptionsSchema = z
  .object({
    addPlugins: z
      .array(z.enum(REDTEAM_ADDITIONAL_PLUGINS as readonly string[] as [string, ...string[]]))
      .optional()
      .describe('Additional plugins to include'),
    addStrategies: z
      .array(z.enum(REDTEAM_ADDITIONAL_STRATEGIES as readonly string[] as [string, ...string[]]))
      .optional()
      .describe('Additional strategies to include'),
    cache: z.boolean().describe('Whether to use caching'),
    config: z.string().optional().describe('Path to the configuration file'),
    target: z.string().optional().describe('Cloud provider target ID to run the scan on'),
    defaultConfig: z.record(z.string(), z.unknown()).describe('Default configuration object'),
    defaultConfigPath: z.string().optional().describe('Path to the default configuration file'),
    description: z.string().optional().describe('Custom description/name for the generated tests'),
    delay: z
      .int()
      .nonnegative()
      .optional()
      .describe('Delay in milliseconds between plugin API calls'),
    envFile: z.string().optional().describe('Path to the environment file'),
    filterProviders: z.string().optional().describe('Regex used to select providers'),
    filterTargets: z.string().optional().describe('Regex used to select targets'),
    force: z.boolean().describe('Whether to force generation').prefault(false),
    injectVar: z.string().optional().describe('Variable to inject'),
    language: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe('Language(s) of tests to generate'),
    frameworks: z
      .array(z.enum(frameworkOptions))
      .min(1)
      .optional()
      .describe(
        'Subset of compliance frameworks to include when generating, reporting, and filtering results',
      ),
    maxConcurrency: z
      .int()
      .positive()
      .optional()
      .describe('Maximum number of concurrent API calls'),
    maxCharsPerMessage: z
      .int()
      .positive()
      .optional()
      .describe('Maximum number of characters allowed per generated user message'),
    minCharsPerMessage: z
      .int()
      .positive()
      .optional()
      .describe('Minimum number of characters required per generated user message'),
    numTests: z.int().positive().optional().describe('Number of tests to generate'),
    output: z.string().optional().describe('Output file path'),
    plugins: z.array(RedteamPluginObjectSchema).optional().describe('Plugins to use'),
    provider: z.string().optional().describe('Provider to use'),
    purpose: z.string().optional().describe('Purpose of the redteam generation'),
    strategies: z.array(RedteamStrategySchema).optional().describe('Strategies to use'),
    write: z.boolean().describe('Whether to write the output'),
    burpEscapeJson: z.boolean().describe('Whether to escape quotes in Burp payloads').optional(),
    progressBar: z.boolean().describe('Whether to show a progress bar').optional(),
    configFromCloud: z.any().optional().describe('A configuration object loaded from cloud'),
    strict: z
      .boolean()
      .optional()
      .default(false)
      .describe('Fail the scan if any plugins fail to generate test cases'),
  })
  .refine(hasValidCharsPerMessageRange, {
    message: 'minCharsPerMessage must be less than or equal to maxCharsPerMessage',
    path: ['minCharsPerMessage'],
  });

/**
 * Schema for `redteam` section of promptfooconfig.yaml
 */
export const RedteamConfigSchema = z
  .object({
    injectVar: z
      .string()
      .optional()
      .describe(
        "Variable to inject. Can be a string or array of strings. If string, it's transformed to an array. Inferred from the prompts by default.",
      ),
    purpose: z
      .string()
      .optional()
      .describe('Purpose override string - describes the prompt templates'),
    testGenerationInstructions: z
      .string()
      .optional()
      .describe('Additional instructions for test generation applied to each plugin'),
    provider: ProviderSchema.optional().describe('Provider used for generating adversarial inputs'),
    numTests: z.int().positive().optional().describe('Number of tests to generate'),
    language: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe('Language(s) of tests to generate for this plugin'),
    frameworks: z
      .array(z.enum(frameworkOptions))
      .min(1)
      .optional()
      .describe('Compliance frameworks to include across reports and commands'),
    entities: z
      .array(z.string())
      .optional()
      .describe('Names of people, brands, or organizations related to your LLM application'),
    contexts: z
      .array(RedteamContextSchema)
      .optional()
      .describe('Security contexts for testing multiple states - each context has its own purpose'),
    plugins: z
      .array(RedteamPluginSchema)
      .describe('Plugins to use for redteam generation')
      .prefault(['default']),
    strategies: z
      .array(RedteamStrategySchema)
      .describe(
        dedent`Strategies to use for redteam generation.

        Defaults to ${DEFAULT_STRATEGIES.join(', ')}
        Supports ${ALL_STRATEGIES.join(', ')}
        `,
      )
      .optional()
      .default(['default']),
    maxConcurrency: z
      .int()
      .positive()
      .optional()
      .describe('Maximum number of concurrent API calls'),
    maxCharsPerMessage: z
      .int()
      .positive()
      .optional()
      .describe('Maximum number of characters allowed per generated user message'),
    minCharsPerMessage: z
      .int()
      .positive()
      .optional()
      .describe('Minimum number of characters required per generated user message'),
    delay: z
      .int()
      .nonnegative()
      .optional()
      .describe('Delay in milliseconds between plugin API calls'),
    excludeTargetOutputFromAgenticAttackGeneration: z
      .boolean()
      .optional()
      .describe('Whether to exclude target output from the agentific attack generation process'),
    tracing: TracingConfigSchema.optional().describe(
      'Tracing defaults applied to all strategies unless overridden',
    ),
    graderExamples: z
      .array(
        z.object({
          output: z.string(),
          pass: z.boolean(),
          score: z.number(),
          reason: z.string(),
        }),
      )
      .optional()
      .describe('Global grading examples that apply to all plugins'),
  })
  .superRefine((data, ctx) => {
    if (!hasValidCharsPerMessageRange(data)) {
      addCharsPerMessageRangeIssue(ctx, ['minCharsPerMessage']);
    }
    validateScopedCharsPerMessageLimits(data.plugins ?? [], 'plugins', ctx);
    validateScopedCharsPerMessageLimits(data.strategies ?? [], 'strategies', ctx);
    validateEffectiveCharsPerMessageRanges(data, ctx);
  })
  .transform((data): RedteamFileConfig => {
    const pluginMap = new Map<string, RedteamPluginObject>();
    const strategySet = new Set<Strategy>();
    const frameworks =
      data.frameworks && data.frameworks.length > 0
        ? Array.from(new Set(data.frameworks))
        : undefined;

    // MIGRATION: Extract languages from multilingual strategy and merge into global language config
    // This allows plugin-level language generation to work with multilingual strategy
    const multilingualStrategy = data.strategies?.find(
      (s) => (typeof s === 'string' ? s : s.id) === 'multilingual',
    );

    if (multilingualStrategy && typeof multilingualStrategy !== 'string') {
      const strategyLanguages = multilingualStrategy.config?.languages;

      if (Array.isArray(strategyLanguages) && strategyLanguages.length > 0) {
        console.debug(
          '[DEPRECATED] The "multilingual" strategy is deprecated. Use the top-level "language" config instead. See: https://www.promptfoo.dev/docs/red-team/configuration/#language',
        );

        if (data.language) {
          // Global language exists, merge with 'en' and strategy languages, then deduplicate
          const existingLanguages = Array.isArray(data.language) ? data.language : [data.language];
          data.language = [...new Set([...existingLanguages, 'en', ...strategyLanguages])];
        } else {
          // No global language set, prepend 'en' as default to multilingual strategy languages
          data.language = ['en', ...strategyLanguages];
        }

        // Remove multilingual strategy from array - it's now a pure config mechanism
        // Tests will be generated with language modifiers by plugins, not by the strategy
        data.strategies = data.strategies?.filter((s) => {
          const id = typeof s === 'string' ? s : s.id;
          return id !== 'multilingual';
        });
      }
    }

    const addPlugin = (
      id: string,
      config: PluginConfig | undefined,
      numTests: number | undefined,
      severity?: Severity,
    ) => {
      const key = `${id}:${JSON.stringify(config)}:${severity || ''}`;
      const pluginObject: RedteamPluginObject = { id };
      if (numTests !== undefined || data.numTests !== undefined) {
        pluginObject.numTests = numTests ?? data.numTests;
      }
      if (config !== undefined) {
        pluginObject.config = config;
      }
      if (severity !== undefined) {
        pluginObject.severity = severity;
      }
      pluginMap.set(key, pluginObject);
    };

    const expandCollection = (
      collection: string[] | ReadonlySet<Plugin>,
      config: PluginConfig | undefined,
      numTests: number | undefined,
      severity?: Severity,
    ) => {
      (Array.isArray(collection) ? collection : Array.from(collection)).forEach((item) => {
        // Only add the plugin if it doesn't already exist or if the existing one has undefined numTests
        const existingPlugin = pluginMap.get(`${item}:${JSON.stringify(config)}:${severity || ''}`);
        if (!existingPlugin || existingPlugin.numTests === undefined) {
          addPlugin(item, config, numTests, severity);
        }
      });
    };

    const handleCollectionExpansion = (
      id: Collection,
      config: PluginConfig | undefined,
      numTests: number | undefined,
      severity?: Severity,
    ) => {
      if (id === 'foundation') {
        expandCollection([...FOUNDATION_PLUGINS], config, numTests, severity);
      } else if (id === 'harmful') {
        expandCollection(Object.keys(HARM_PLUGINS), config, numTests, severity);
      } else if (id === 'pii') {
        expandCollection([...PII_PLUGINS], config, numTests, severity);
      } else if (id === 'medical') {
        expandCollection([...MEDICAL_PLUGINS], config, numTests, severity);
      } else if (id === 'pharmacy') {
        expandCollection([...PHARMACY_PLUGINS], config, numTests, severity);
      } else if (id === 'insurance') {
        expandCollection([...INSURANCE_PLUGINS], config, numTests, severity);
      } else if (id === 'financial') {
        expandCollection([...FINANCIAL_PLUGINS], config, numTests, severity);
      } else if (id === 'teen-safety') {
        expandCollection([...TEEN_SAFETY_PLUGINS], config, numTests, severity);
      } else if (id === 'default') {
        expandCollection([...REDTEAM_DEFAULT_PLUGINS], config, numTests, severity);
      } else if (id === 'guardrails-eval') {
        expandCollection([...GUARDRAILS_EVALUATION_PLUGINS], config, numTests, severity);
      } else if (id === 'coding-agent:core') {
        expandCollection([...CODING_AGENT_CORE_PLUGINS], config, numTests, severity);
      } else if (id === 'coding-agent:all') {
        expandCollection([...CODING_AGENT_PLUGINS], config, numTests, severity);
      }
    };

    const handlePlugin = (plugin: string | RedteamPluginObject) => {
      const pluginObj: RedteamPluginObject =
        typeof plugin === 'string'
          ? { id: plugin, numTests: data.numTests, config: undefined, severity: undefined }
          : {
              ...plugin,
              numTests: plugin.numTests ?? data.numTests ?? DEFAULT_NUM_TESTS_PER_PLUGIN,
            };

      if (ALIASED_PLUGIN_MAPPINGS[pluginObj.id]) {
        Object.values(ALIASED_PLUGIN_MAPPINGS[pluginObj.id]).forEach(({ plugins, strategies }) => {
          plugins.forEach((id) => {
            if (COLLECTIONS.includes(id as Collection)) {
              handleCollectionExpansion(
                id as Collection,
                pluginObj.config,
                pluginObj.numTests,
                pluginObj.severity,
              );
            } else {
              addPlugin(id, pluginObj.config, pluginObj.numTests, pluginObj.severity);
            }
          });
          strategies.forEach((strategy) => strategySet.add(strategy as Strategy));
        });
      } else if (COLLECTIONS.includes(pluginObj.id as Collection)) {
        handleCollectionExpansion(
          pluginObj.id as Collection,
          pluginObj.config,
          pluginObj.numTests,
          pluginObj.severity,
        );
      } else {
        const mapping = Object.entries(ALIASED_PLUGIN_MAPPINGS).find(([, value]) =>
          Object.keys(value).includes(pluginObj.id),
        );
        if (mapping) {
          const [, aliasedMapping] = mapping;
          aliasedMapping[pluginObj.id].plugins.forEach((id) => {
            if (COLLECTIONS.includes(id as Collection)) {
              handleCollectionExpansion(
                id as Collection,
                pluginObj.config,
                pluginObj.numTests,
                pluginObj.severity,
              );
            } else {
              addPlugin(id, pluginObj.config, pluginObj.numTests, pluginObj.severity);
            }
          });
          aliasedMapping[pluginObj.id].strategies.forEach((strategy) =>
            strategySet.add(strategy as Strategy),
          );
        } else {
          addPlugin(pluginObj.id, pluginObj.config, pluginObj.numTests, pluginObj.severity);
        }
      }
    };

    data.plugins.forEach(handlePlugin);

    const uniquePlugins = Array.from(pluginMap.values())
      .filter((plugin) => !COLLECTIONS.includes(plugin.id as (typeof COLLECTIONS)[number]))
      .sort((a, b) => {
        if (a.id !== b.id) {
          return a.id.localeCompare(b.id);
        }
        return JSON.stringify(a.config || {}).localeCompare(JSON.stringify(b.config || {}));
      });

    // Helper to generate a unique key for strategies
    // For layer strategies, use label or steps to differentiate multiple instances
    const getStrategyKey = (strategy: RedteamStrategy): string => {
      if (typeof strategy === 'string') {
        return strategy;
      }
      if (strategy.id === 'layer' && strategy.config) {
        if (strategy.config.label) {
          return `layer/${strategy.config.label}`;
        }
        if (strategy.config.steps) {
          return `layer:${JSON.stringify(strategy.config.steps)}`;
        }
      }
      // For other strategies with config, include config in key to allow multiple instances
      if (strategy.config && Object.keys(strategy.config).length > 0) {
        return `${strategy.id}:${JSON.stringify(strategy.config)}`;
      }
      return strategy.id;
    };

    const strategies = Array.from(
      new Map<string, RedteamStrategy>(
        [...(data.strategies || []), ...Array.from(strategySet)].flatMap(
          (strategy): Array<[string, RedteamStrategy]> => {
            if (typeof strategy === 'string') {
              if (strategy === 'basic') {
                return [];
              }
              return strategy === 'default'
                ? DEFAULT_STRATEGIES.map((id): [string, RedteamStrategy] => [id, { id }])
                : [[strategy, { id: strategy }]];
            }
            // Use unique key that considers label/steps for layer strategies
            return [[getStrategyKey(strategy), strategy]];
          },
        ),
      ).values(),
    ).sort((a, b) => {
      const aId = typeof a === 'string' ? a : a.id;
      const bId = typeof b === 'string' ? b : b.id;
      return aId.localeCompare(bId);
    }) as RedteamStrategy[];

    return {
      numTests: data.numTests,
      ...(data.maxCharsPerMessage ? { maxCharsPerMessage: data.maxCharsPerMessage } : {}),
      ...(data.minCharsPerMessage ? { minCharsPerMessage: data.minCharsPerMessage } : {}),
      plugins: uniquePlugins,
      strategies,
      ...(frameworks ? { frameworks } : {}),
      ...(data.delay ? { delay: data.delay } : {}),
      ...(data.entities ? { entities: data.entities } : {}),
      ...(data.injectVar ? { injectVar: data.injectVar } : {}),
      ...(data.language ? { language: data.language } : {}),
      ...(data.provider ? { provider: data.provider } : {}),
      ...(data.purpose ? { purpose: data.purpose } : {}),
      ...(data.contexts ? { contexts: data.contexts as RedteamContext[] } : {}),
      ...(data.excludeTargetOutputFromAgenticAttackGeneration
        ? {
            excludeTargetOutputFromAgenticAttackGeneration:
              data.excludeTargetOutputFromAgenticAttackGeneration,
          }
        : {}),
      ...(data.tracing ? { tracing: data.tracing } : {}),
      ...(data.graderExamples ? { graderExamples: data.graderExamples } : {}),
    };
  });

// Ensure that schemas match their corresponding types
function assert<_T extends never>() {}
type TypeEqualityGuard<A, B> = Exclude<A, B> | Exclude<B, A>;

assert<TypeEqualityGuard<RedteamFileConfig, z.infer<typeof RedteamConfigSchema>>>();

// TODO: Why is this never?
// assert<TypeEqualityGuard<RedteamPluginObject, z.infer<typeof RedteamPluginObjectSchema>>>();
