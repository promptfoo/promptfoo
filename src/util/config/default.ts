import path from 'path';
import type { UnifiedConfig } from '../../types';
import { maybeReadConfig } from './load';

export async function loadDefaultConfig(configNames: string[]): Promise<{
  defaultConfig: Partial<UnifiedConfig>;
  defaultConfigPath: string | undefined;
}> {
  const pwd = process.cwd();
  let defaultConfig: Partial<UnifiedConfig> = {};
  let defaultConfigPath: string | undefined;

  // NOTE: sorted by frequency of use
  const extensions = ['yaml', 'yml', 'json', 'cjs', 'cts', 'js', 'mjs', 'mts', 'ts'];

  for (const ext of extensions) {
    for (const name of configNames) {
      const configPath = path.join(pwd, `${name}.${ext}`);
      const maybeConfig = await maybeReadConfig(configPath);
      if (maybeConfig) {
        defaultConfig = maybeConfig;
        defaultConfigPath = configPath;
        return { defaultConfig, defaultConfigPath };
      }
    }
  }

  return { defaultConfig, defaultConfigPath };
}
