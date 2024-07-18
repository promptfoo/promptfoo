import { z } from 'zod';
import {
    REDTEAM_MODEL,
    ALL_PLUGINS as REDTEAM_ALL_PLUGINS,
    DEFAULT_PLUGINS as REDTEAM_DEFAULT_PLUGINS,
    ADDITIONAL_PLUGINS as REDTEAM_ADDITIONAL_PLUGINS,
  } from './constants';

const RedteamGenerateOptionsSchema = z.object({
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
  
  type RedteamGenerateOptions = z.infer<typeof RedteamGenerateOptionsSchema>;