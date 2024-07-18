import { z } from 'zod';
import {
  ALL_PLUGINS as REDTEAM_ALL_PLUGINS,
  ADDITIONAL_PLUGINS as REDTEAM_ADDITIONAL_PLUGINS,
  DEFAULT_PLUGINS as REDTEAM_DEFAULT_PLUGINS,
} from './constants';
import { HARM_CATEGORIES } from './plugins/harmful';

/**
 * Schema for `promptfoo generate redteam` command options
 */
export const RedteamGenerateOptionsSchema = z.object({
  addPlugins: z
    .array(z.enum(REDTEAM_ADDITIONAL_PLUGINS))
    .optional()
    .describe('Additional plugins to include'),
  cache: z.boolean().describe('Whether to use caching'),
  config: z.string().optional().describe('Path to the configuration file'),
  defaultConfig: z.record(z.unknown()).describe('Default configuration object'),
  defaultConfigPath: z.string().optional().describe('Path to the default configuration file'),
  envFile: z.string().optional().describe('Path to the environment file'),
  injectVar: z.string().optional().describe('Variable to inject'),
  numTests: z.number().int().positive().describe('Number of tests to generate'),
  output: z.string().optional().describe('Output file path'),
  plugins: z.array(z.enum(REDTEAM_ALL_PLUGINS)).optional().describe('Plugins to use'),
  provider: z.string().optional().describe('Provider to use'),
  purpose: z.string().optional().describe('Purpose of the redteam generation'),
  write: z.boolean().describe('Whether to write the output'),
});
/** Type definition for RedteamGenerateOptions */
export type RedteamGenerateOptions = z.infer<typeof RedteamGenerateOptionsSchema>;

/**
 * Schema for individual redteam plugins
 */
export const redteamPluginSchema = z.union([
  z.enum(REDTEAM_ALL_PLUGINS).describe('Name of the plugin'),
  z.object({
    name: z.enum(REDTEAM_ALL_PLUGINS).describe('Name of the plugin'),
    numTests: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Number of tests to generate for this plugin'),
  }),
]);

/**
 * Schema for `redteam` section of promptfooconfig.yaml
 */
export const redTeamConfigSchema = z
  .object({
    injectVar: z
      .union([z.string().transform((s) => [s]), z.array(z.string())])
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
      .default(() => Array.from(REDTEAM_DEFAULT_PLUGINS).map((name) => ({ name }))),
  })
  .transform((data) => {
    const plugins = data.plugins
      .map((plugin) =>
        typeof plugin === 'string'
          ? { name: plugin, numTests: data.numTests }
          : { ...plugin, numTests: plugin.numTests ?? data.numTests },
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((pluginObj) => {
        if (pluginObj.name === 'harmful') {
          return Object.keys(HARM_CATEGORIES).map((category) => ({
            name: category,
            numTests: pluginObj.numTests,
          }));
        }
        return pluginObj;
      })
      .filter((plugin) => plugin.name !== 'harmful'); // category plugins are handled above

    const uniquePlugins = Array.from(
      plugins.reduce((map, plugin) => map.set(plugin.name, plugin), new Map()).values(),
    ).sort((a, b) => a.name.localeCompare(b.name));

    return {
      ...(data.purpose ? { purpose: data.purpose } : {}),
      ...(data.injectVar ? { injectVar: data.injectVar } : {}),
      ...(data.provider ? { provider: data.provider } : {}),
      plugins: uniquePlugins,
    };
  });
