import dedent from 'dedent';
import { z } from 'zod';
import {
  ALIASED_PLUGIN_MAPPINGS,
  ALIASED_PLUGINS,
  ALL_STRATEGIES,
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
  ADDITIONAL_PLUGINS as REDTEAM_ADDITIONAL_PLUGINS,
  ADDITIONAL_STRATEGIES as REDTEAM_ADDITIONAL_STRATEGIES,
  ALL_PLUGINS as REDTEAM_ALL_PLUGINS,
  DEFAULT_PLUGINS as REDTEAM_DEFAULT_PLUGINS,
  Severity,
  SeveritySchema,
} from '../redteam/constants';
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
    .describe('Purpose/context for this context - used for generation and grading'),
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
  RedteamPluginObjectSchema,
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

/**
 * Schema for `promptfoo redteam generate` command options
 */
// NOTE: Remember to edit types/redteam.ts:RedteamCliGenerateOptions if you edit this schema
export const RedteamGenerateOptionsSchema = z.object({
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
  maxConcurrency: z.int().positive().optional().describe('Maximum number of concurrent API calls'),
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
      .prefault(['default']),
    maxConcurrency: z
      .int()
      .positive()
      .optional()
      .describe('Maximum number of concurrent API calls'),
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
      } else if (id === 'default') {
        expandCollection([...REDTEAM_DEFAULT_PLUGINS], config, numTests, severity);
      } else if (id === 'guardrails-eval') {
        expandCollection([...GUARDRAILS_EVALUATION_PLUGINS], config, numTests, severity);
      }
    };

    const handlePlugin = (plugin: string | RedteamPluginObject) => {
      const pluginObj: RedteamPluginObject =
        typeof plugin === 'string'
          ? { id: plugin, numTests: data.numTests, config: undefined, severity: undefined }
          : { ...plugin, numTests: plugin.numTests ?? data.numTests };

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
    };
  });

// Ensure that schemas match their corresponding types
function assert<_T extends never>() {}
type TypeEqualityGuard<A, B> = Exclude<A, B> | Exclude<B, A>;

assert<TypeEqualityGuard<RedteamFileConfig, z.infer<typeof RedteamConfigSchema>>>();

// TODO: Why is this never?
// assert<TypeEqualityGuard<RedteamPluginObject, z.infer<typeof RedteamPluginObjectSchema>>>();
