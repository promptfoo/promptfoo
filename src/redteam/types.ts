import { z } from 'zod';
import {
  ALL_PLUGINS as REDTEAM_ALL_PLUGINS,
  ADDITIONAL_PLUGINS as REDTEAM_ADDITIONAL_PLUGINS,
  DEFAULT_PLUGINS as REDTEAM_DEFAULT_PLUGINS,
} from './constants';
import { HARM_CATEGORIES } from './plugins/harmful';

export const RedteamGenerateOptionsSchema = z.object({
  addPlugins: z.array(z.enum(REDTEAM_ADDITIONAL_PLUGINS)).optional(),
  cache: z.boolean(),
  config: z.string().optional(),
  defaultConfig: z.record(z.unknown()),
  defaultConfigPath: z.string().optional(),
  envFile: z.string().optional(),
  injectVar: z.string().optional(),
  numTests: z.number().int().positive(),
  output: z.string().optional(),
  plugins: z.array(z.enum(REDTEAM_ALL_PLUGINS)).optional(),
  provider: z.string().optional(),
  purpose: z.string().optional(),
  write: z.boolean(),
});

export type RedteamGenerateOptions = z.infer<typeof RedteamGenerateOptionsSchema>;

const redteamPluginSchema = z.union([
  z.enum(REDTEAM_ALL_PLUGINS),
  z.object({
    name: z.enum(REDTEAM_ALL_PLUGINS),
    numTests: z.number().int().positive().optional(),
  }),
]);

export const redTeamSchema = z
  .object({
    // string or array of strings, transform to array if string. Can be inferred from the prompts
    injectVar: z.union([z.string().transform((s) => [s]), z.array(z.string())]).optional(),
    // purpose override string - describes the prompt templates
    purpose: z.string().optional(),
    // used for generating adversarial inputs
    provider: z.string().optional(),
    numTests: z.number().int().positive().default(5),
    plugins: z
      .array(redteamPluginSchema)
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
