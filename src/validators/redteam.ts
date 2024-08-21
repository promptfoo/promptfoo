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
} from '../redteam/constants';
import type { RedteamConfig, RedteamPluginObject } from '../types/redteam';
import { ProviderSchema } from '../validators/providers';

/**
 * Schema for individual redteam plugins
 */
const RedteamPluginObjectSchema = z.object({
  id: z
    .enum([...REDTEAM_ALL_PLUGINS, ...ALIASED_PLUGINS] as [string, ...string[]])
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
    .enum([...REDTEAM_ALL_PLUGINS, ...ALIASED_PLUGINS] as [string, ...string[]])
    .describe('Name of the plugin'),
  RedteamPluginObjectSchema,
]);

/**
 * Schema for individual redteam strategies
 */
export const RedteamStrategySchema = z.union([
  z.enum(ALL_STRATEGIES as unknown as [string, ...string[]]).describe('Name of the strategy'),
  z.object({
    id: z.enum(ALL_STRATEGIES as unknown as [string, ...string[]]).describe('Name of the strategy'),
    config: z.record(z.unknown()).optional().describe('Strategy-specific configuration'),
  }),
]);

/**
 * Schema for `promptfoo redteam generate` command options
 */
export const RedteamGenerateOptionsSchema = z.object({
  cache: z.boolean().describe('Whether to use caching'),
  config: z.string().optional().describe('Path to the configuration file'),
  defaultConfig: z.record(z.unknown()).describe('Default configuration object'),
  defaultConfigPath: z.string().optional().describe('Path to the default configuration file'),
  envFile: z.string().optional().describe('Path to the environment file'),
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
  addPlugins: z
    .array(z.enum(REDTEAM_ADDITIONAL_PLUGINS as readonly string[] as [string, ...string[]]))
    .optional()
    .describe('Additional plugins to include'),
  addStrategies: z
    .array(z.enum(REDTEAM_ADDITIONAL_STRATEGIES as readonly string[] as [string, ...string[]]))
    .optional()
    .describe('Additional strategies to include'),
  provider: z.string().optional().describe('Provider to use'),
  purpose: z.string().optional().describe('Purpose of the redteam generation'),
  strategies: z.array(RedteamStrategySchema).optional().describe('Strategies to use'),
  write: z.boolean().describe('Whether to write the output'),
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
    provider: z
      .lazy(() => ProviderSchema)
      .optional()
      .describe('Provider used for generating adversarial inputs'),
    numTests: z.number().int().positive().optional().describe('Number of tests to generate'),
    language: z.string().optional().describe('Language of tests ot generate for this plugin'),
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
  })
  .transform((data): RedteamConfig => {
    const pluginMap = new Map<string, RedteamPluginObject>();

    data.plugins.forEach((plugin) => {
      const pluginObj =
        typeof plugin === 'string'
          ? { id: plugin, numTests: data.numTests, config: undefined }
          : { ...plugin, numTests: plugin.numTests ?? data.numTests };

      if (pluginObj.id === 'harmful') {
        Object.keys(HARM_PLUGINS).forEach((id) => {
          const key = `${id}:${JSON.stringify(pluginObj.config)}`;
          if (!pluginMap.has(key)) {
            pluginMap.set(key, { id, numTests: pluginObj.numTests, config: pluginObj.config });
          }
        });
      } else if (pluginObj.id === 'pii') {
        PII_PLUGINS.forEach((id) => {
          const key = `${id}:${JSON.stringify(pluginObj.config)}`;
          if (!pluginMap.has(key)) {
            pluginMap.set(key, { id, numTests: pluginObj.numTests, config: pluginObj.config });
          }
        });
      } else if (pluginObj.id === 'default') {
        REDTEAM_DEFAULT_PLUGINS.forEach((id) => {
          const key = `${id}:${JSON.stringify(pluginObj.config)}`;
          if (!pluginMap.has(key)) {
            pluginMap.set(key, { id, numTests: pluginObj.numTests, config: pluginObj.config });
          }
        });
      } else {
        const key = `${pluginObj.id}:${JSON.stringify(pluginObj.config)}`;
        pluginMap.set(key, pluginObj);
      }
    });

    const uniquePlugins = Array.from(pluginMap.values())
      .filter((plugin) => !COLLECTIONS.includes(plugin.id as (typeof COLLECTIONS)[number]))
      .sort((a, b) => {
        if (a.id !== b.id) {
          return a.id.localeCompare(b.id);
        }
        return JSON.stringify(a.config || {}).localeCompare(JSON.stringify(b.config || {}));
      });

    const strategies = data.strategies
      ?.map((strategy) => {
        if (typeof strategy === 'string') {
          if (strategy === 'basic') {
            return [];
          }
          return strategy === 'default'
            ? DEFAULT_STRATEGIES.map((id) => ({ id }))
            : { id: strategy };
        }
        return strategy;
      })
      .flat();

    return {
      numTests: data.numTests,
      plugins: uniquePlugins,
      strategies,
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

assert<TypeEqualityGuard<RedteamConfig, z.infer<typeof RedteamConfigSchema>>>();
// TODO: Why is this never?
// assert<TypeEqualityGuard<RedteamPluginObject, z.infer<typeof RedteamPluginObjectSchema>>>();
