import path from 'path';

import { DEFAULT_CONFIG_EXTENSIONS } from './extensions';
import { maybeReadConfig } from './load';

import type { UnifiedConfig } from '../../types/index';

/** Load the first default config found in extension priority order. */
export async function loadDefaultConfig(
  dir?: string,
  configName: string = 'promptfooconfig',
  options: { deferUnknownKeyValidation?: boolean } = {},
): Promise<{
  defaultConfig: Partial<UnifiedConfig>;
  defaultConfigPath: string | undefined;
}> {
  dir = dir || process.cwd();

  for (const ext of DEFAULT_CONFIG_EXTENSIONS) {
    const configPath = path.join(dir, `${configName}.${ext}`);
    const defaultConfig = options.deferUnknownKeyValidation
      ? await maybeReadConfig(configPath, true)
      : await maybeReadConfig(configPath);
    if (defaultConfig) {
      return { defaultConfig, defaultConfigPath: configPath };
    }
  }

  return { defaultConfig: {}, defaultConfigPath: undefined };
}
