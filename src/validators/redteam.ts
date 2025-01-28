import dedent from 'dedent';
import { z } from 'zod';
import {
  ALL_PLUGINS as REDTEAM_ALL_PLUGINS,
  DEFAULT_PLUGINS as REDTEAM_DEFAULT_PLUGINS,
  ADDITIONAL_PLUGINS as REDTEAM_ADDITIONAL_PLUGINS,
  ADDITIONAL_STRATEGIES as REDTEAM_ADDITIONAL_STRATEGIES,
  DEFAULT_STRATEGIES,
  ALL_STRATEGIES,
  HARM_PLUGINS,
  PII_PLUGINS,
  COLLECTIONS,
  ALIASED_PLUGINS,
  DEFAULT_NUM_TESTS_PER_PLUGIN,
  ALIASED_PLUGIN_MAPPINGS,
  type Strategy,
  type Plugin,
} from '../redteam/constants';
import type { RedteamFileConfig, RedteamPluginObject, RedteamStrategy } from '../redteam/types';
import { isJavascriptFile } from '../util/file';
import { ProviderSchema } from '../validators/providers';

const pluginOptions: string[] = [...COLLECTIONS, ...REDTEAM_ALL_PLUGINS, ...ALIASED_PLUGINS].sort();
/**
 * Schema for individual redteam plugins
 */
const RedteamPluginObjectSchema = z.object({
  id: z
    .union([
      z.enum(pluginOptions as [string, ...string[]]).superRefine((val, ctx) => {
        if (!pluginOptions.includes(val)) {
          ctx.addIssue({
            code: z.ZodIssueCode.invalid_enum_value,
            options: pluginOptions,
            received: val,
            message: `Invalid plugin name. Must be one of: ${pluginOptions.join(', ')} (or a path starting with file://)`,
          });
        }
      }),
      z.string().startsWith('file://', {
        message: 'Custom plugins must start with file:// (or use one of the built-in plugins)',
      }),
    ])
    .describe('Name of the plugin'),
  numTests: z
    .number()
    .int()
    .positive()
    .default(DEFAULT_NUM_TESTS_PER_PLUGIN)
    .describe('Number of tests to generate for this plugin'),
  config: z.record(z.unknown()).optional().describe('Plugin-specific configuration'),
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
            code: z.ZodIssueCode.invalid_enum_value,
            options: pluginOptions,
            received: val,
            message: `Invalid plugin name. Must be one of: ${pluginOptions.join(', ')} (or a path starting with file://)`,
          });
        }
      }),
      z.string().startsWith('file://', {
        message: 'Custom plugins must start with file:// (or use one of the built-in plugins)',
      }),
    ])
    .describe('Name of the plugin or path to custom plugin'),
  RedteamPluginObjectSchema,
]);

const strategyIdSchema = z
  .union([
    z.enum(ALL_STRATEGIES as unknown as [string, ...string[]]).superRefine((val, ctx) => {
      if (!ALL_STRATEGIES.includes(val as Strategy)) {
        ctx.addIssue({
          code: z.ZodIssueCode.invalid_enum_value,
          options: [...ALL_STRATEGIES] as [string, ...string[]],
          received: val,
          message: `Invalid strategy name. Must be one of: ${[...ALL_STRATEGIES].join(', ')} (or a path starting with file://)`,
        });
      }
    }),
    z.string().refine(
      (value) => {
        return value.startsWith('file://') && isJavascriptFile(value);
      },
      {
        message: `Custom strategies must start with file:// and end with .js or .ts, or use one of the built-in strategies: ${[...ALL_STRATEGIES].join(', ')}`,
      },
    ),
  ])
  .describe('Name of the strategy');
/**
 * Schema for individual redteam strategies
 */
export const RedteamStrategySchema = z.union([
  strategyIdSchema,
  z.object({
    id: strategyIdSchema,
    config: z.record(z.unknown()).optional().describe('Strategy-specific configuration'),
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
  defaultConfig: z.record(z.unknown()).describe('Default configuration object'),
  defaultConfigPath: z.string().optional().describe('Path to the default configuration file'),
  delay: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Delay in milliseconds between plugin API calls'),
  envFile: z.string().optional().describe('Path to the environment file'),
  force: z.boolean().describe('Whether to force generation').default(false),
  injectVar: z.string().optional().describe('Variable to inject'),
  language: z.string().optional().describe('Language of tests to generate'),
  maxConcurrency: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum number of concurrent API calls'),
  numTests: z.number().int().positive().optional().describe('Number of tests to generate'),
  output: z.string().optional().describe('Output file path'),
  plugins: z.array(RedteamPluginObjectSchema).optional().describe('Plugins to use'),
  provider: z.string().optional().describe('Provider to use'),
  purpose: z.string().optional().describe('Purpose of the redteam generation'),
  strategies: z.array(RedteamStrategySchema).optional().describe('Strategies to use'),
  write: z.boolean().describe('Whether to write the output'),
  burpEscapeJson: z.boolean().describe('Whether to escape quotes in Burp payloads').optional(),
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
    provider: ProviderSchema.optional().describe('Provider used for generating adversarial inputs'),
    numTests: z.number().int().positive().optional().describe('Number of tests to generate'),
    language: z.string().optional().describe('Language of tests ot generate for this plugin'),
    entities: z
      .array(z.string())
      .optional()
      .describe('Names of people, brands, or organizations related to your LLM application'),
    plugins: z
      .array(RedteamPluginSchema)
      .describe('Plugins to use for redteam generation')
      .default(['default']),
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
      .number()
      .int()
      .positive()
      .optional()
      .describe('Maximum number of concurrent API calls'),
    delay: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Delay in milliseconds between plugin API calls'),
  })
  .transform((data): RedteamFileConfig => {
    const pluginMap = new Map<string, RedteamPluginObject>();
    const strategySet = new Set<Strategy>();

    const addPlugin = (id: string, config: any, numTests: number | undefined) => {
      const key = `${id}:${JSON.stringify(config)}`;
      const pluginObject: RedteamPluginObject = { id };
      if (numTests !== undefined || data.numTests !== undefined) {
        pluginObject.numTests = numTests ?? data.numTests;
      }
      if (config !== undefined) {
        pluginObject.config = config;
      }
      pluginMap.set(key, pluginObject);
    };

    const expandCollection = (
      collection: string[] | ReadonlySet<Plugin>,
      config: any,
      numTests: number | undefined,
    ) => {
      (Array.isArray(collection) ? collection : Array.from(collection)).forEach((item) => {
        // Only add the plugin if it doesn't already exist or if the existing one has undefined numTests
        const existingPlugin = pluginMap.get(`${item}:${JSON.stringify(config)}`);
        if (!existingPlugin || existingPlugin.numTests === undefined) {
          addPlugin(item, config, numTests);
        }
      });
    };

    const handleCollectionExpansion = (id: string, config: any, numTests: number | undefined) => {
      if (id === 'harmful') {
        expandCollection(Object.keys(HARM_PLUGINS), config, numTests);
      } else if (id === 'pii') {
        expandCollection([...PII_PLUGINS], config, numTests);
      } else if (id === 'default') {
        expandCollection([...REDTEAM_DEFAULT_PLUGINS], config, numTests);
      }
    };

    const handlePlugin = (plugin: string | RedteamPluginObject) => {
      const pluginObj =
        typeof plugin === 'string'
          ? { id: plugin, numTests: data.numTests, config: undefined }
          : { ...plugin, numTests: plugin.numTests ?? data.numTests };

      if (ALIASED_PLUGIN_MAPPINGS[pluginObj.id]) {
        Object.values(ALIASED_PLUGIN_MAPPINGS[pluginObj.id]).forEach(({ plugins, strategies }) => {
          plugins.forEach((id) => {
            if (COLLECTIONS.includes(id as any)) {
              handleCollectionExpansion(id, pluginObj.config, pluginObj.numTests);
            } else {
              addPlugin(id, pluginObj.config, pluginObj.numTests);
            }
          });
          strategies.forEach((strategy) => strategySet.add(strategy as Strategy));
        });
      } else if (COLLECTIONS.includes(pluginObj.id as any)) {
        handleCollectionExpansion(pluginObj.id, pluginObj.config, pluginObj.numTests);
      } else {
        const mapping = Object.entries(ALIASED_PLUGIN_MAPPINGS).find(([, value]) =>
          Object.keys(value).includes(pluginObj.id),
        );
        if (mapping) {
          const [, aliasedMapping] = mapping;
          aliasedMapping[pluginObj.id].plugins.forEach((id) => {
            if (COLLECTIONS.includes(id as any)) {
              handleCollectionExpansion(id, pluginObj.config, pluginObj.numTests);
            } else {
              addPlugin(id, pluginObj.config, pluginObj.numTests);
            }
          });
          aliasedMapping[pluginObj.id].strategies.forEach((strategy) =>
            strategySet.add(strategy as Strategy),
          );
        } else {
          addPlugin(pluginObj.id, pluginObj.config, pluginObj.numTests);
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
            // Return tuple of [id, strategy] for Map to deduplicate by id
            return [[strategy.id, strategy]];
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
      ...(data.delay ? { delay: data.delay } : {}),
      ...(data.entities ? { entities: data.entities } : {}),
      ...(data.injectVar ? { injectVar: data.injectVar } : {}),
      ...(data.language ? { language: data.language } : {}),
      ...(data.provider ? { provider: data.provider } : {}),
      ...(data.purpose ? { purpose: data.purpose } : {}),
    };
  });

// Ensure that schemas match their corresponding types
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function assert<T extends never>() {}
type TypeEqualityGuard<A, B> = Exclude<A, B> | Exclude<B, A>;

assert<TypeEqualityGuard<RedteamFileConfig, z.infer<typeof RedteamConfigSchema>>>();

// TODO: Why is this never?
// assert<TypeEqualityGuard<RedteamPluginObject, z.infer<typeof RedteamPluginObjectSchema>>>();
