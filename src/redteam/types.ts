import dedent from 'dedent';
import { z } from 'zod';
import {
  ALL_PLUGINS as REDTEAM_ALL_PLUGINS,
  ADDITIONAL_PLUGINS as REDTEAM_ADDITIONAL_PLUGINS,
  DEFAULT_STRATEGIES,
  ALL_STRATEGIES,
  COLLECTIONS,
  HARM_PLUGINS,
  PII_PLUGINS,
} from './constants';

const redteamPluginObjectSchema = z.object({
  id: z.enum(REDTEAM_ALL_PLUGINS as [string, ...string[]]).describe('Name of the plugin'),
  numTests: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Number of tests to generate for this plugin'),
});

/**
 * Schema for individual redteam plugins
 */
export const redteamPluginSchema = z.union([
  z.enum(REDTEAM_ALL_PLUGINS as [string, ...string[]]).describe('Name of the plugin'),
  redteamPluginObjectSchema,
]);

/**
 * Schema for individual redteam strategies
 */
export const redteamStrategySchema = z.union([
  z
    .enum(ALL_STRATEGIES as unknown as [string, ...string[]])
    .describe('Name of the strategy')
    .transform((s) => ({ id: s })),
  z.object({
    id: z.enum(ALL_STRATEGIES as unknown as [string, ...string[]]).describe('Name of the strategy'),
  }),
]);

/**
 * Schema for `promptfoo generate redteam` command options
 */
export const RedteamGenerateOptionsSchema = z.object({
  cache: z.boolean().describe('Whether to use caching'),
  config: z.string().optional().describe('Path to the configuration file'),
  defaultConfig: z.record(z.unknown()).describe('Default configuration object'),
  defaultConfigPath: z.string().optional().describe('Path to the default configuration file'),
  envFile: z.string().optional().describe('Path to the environment file'),
  injectVar: z.string().optional().describe('Variable to inject'),
  numTests: z.number().int().positive().describe('Number of tests to generate'),
  output: z.string().optional().describe('Output file path'),
  plugins: z.array(redteamPluginObjectSchema).optional().describe('Plugins to use'),
  addPlugins: z
    .array(z.enum(REDTEAM_ADDITIONAL_PLUGINS as [string, ...string[]]))
    .optional()
    .describe('Additional plugins to include'),
  addStrategies: z
    .array(redteamStrategySchema)
    .optional()
    .describe('Additional strategies to include'),
  provider: z.string().optional().describe('Provider to use'),
  purpose: z.string().optional().describe('Purpose of the redteam generation'),
  strategies: z.array(redteamStrategySchema).optional().describe('Strategies to use'),
  write: z.boolean().describe('Whether to write the output'),
});
/** Type definition for RedteamGenerateOptions */
export type RedteamGenerateOptions = z.infer<typeof RedteamGenerateOptionsSchema>;

export type RedteamPluginObject = z.infer<typeof redteamPluginObjectSchema>;

/**
 * Schema for `redteam` section of promptfooconfig.yaml
 */
export const redteamConfigSchema = z
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
    provider: z.string().optional().describe('Provider used for generating adversarial inputs'),
    numTests: z.number().int().positive().default(5).describe('Number of tests to generate'),
    plugins: z
      .array(redteamPluginSchema)
      .describe('Plugins to use for redteam generation')
      .optional()
      .default(() => []),
    strategies: z
      .array(redteamStrategySchema)
      .describe(
        dedent`Strategies to use for redteam generation.

        Defaults to ${DEFAULT_STRATEGIES.join(', ')}
        Supports ${ALL_STRATEGIES.join(', ')}
        `,
      )
      .optional()
      .default(() => Array.from(DEFAULT_STRATEGIES).map((name) => ({ id: name }))),
  })
  .transform((data) => {
    const pluginObjs = data.plugins
      .map((plugin) =>
        typeof plugin === 'string'
          ? { id: plugin, numTests: data.numTests }
          : { ...plugin, numTests: plugin.numTests ?? data.numTests },
      )
      .sort((a, b) => a.id.localeCompare(b.id));

    const plugins = pluginObjs
      .flatMap((pluginObj: { id: string; numTests?: number }) => {
        if (pluginObj.id === 'harmful') {
          return Object.keys(HARM_PLUGINS).map((category) => ({
            id: category,
            numTests:
              pluginObjs.find((p) => p.id === category)?.numTests ??
              pluginObj.numTests ??
              data.numTests,
          }));
        }
        if (pluginObj.id === 'pii') {
          return PII_PLUGINS.map((id) => ({
            id,
            numTests:
              pluginObjs.find((p) => p.id === id)?.numTests ?? pluginObj.numTests ?? data.numTests,
          }));
        }
        return pluginObj;
      })
      .filter((plugin) => !COLLECTIONS.includes(plugin.id)); // category plugins are handled above

    const uniquePlugins = Array.from(
      plugins.reduce((map, plugin) => map.set(plugin.id, plugin), new Map()).values(),
    ).sort((a, b) => a.id.localeCompare(b.id));

    return {
      ...(data.purpose ? { purpose: data.purpose } : {}),
      ...(data.injectVar ? { injectVar: data.injectVar } : {}),
      ...(data.provider ? { provider: data.provider } : {}),
      plugins: uniquePlugins,
      strategies: data.strategies,
    };
  });

export type RedteamConfig = z.infer<typeof redteamConfigSchema>;
