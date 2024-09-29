import path from 'path';
import type { UnifiedConfig } from '../../types';
import { maybeReadConfig } from './load';

/**
 * Loads the default configuration file from the specified directory.
 *
 * @param dir - The directory to search for configuration files. Defaults to the current working directory.
 * @returns A promise that resolves to an object containing the default configuration and its file path.
 *          The default configuration is partial, and the file path may be undefined if no configuration is found.
 */
export async function loadDefaultConfig(dir?: string): Promise<{
  defaultConfig: Partial<UnifiedConfig>;
  defaultConfigPath: string | undefined;
}> {
  dir = dir || process.cwd();
  let defaultConfig: Partial<UnifiedConfig> = {};
  let defaultConfigPath: string | undefined;

  // NOTE: sorted by frequency of use
  const extensions = ['yaml', 'yml', 'json', 'cjs', 'cts', 'js', 'mjs', 'mts', 'ts'];

  for (const ext of extensions) {
    const configPath = path.join(dir, `promptfooconfig.${ext}`);
    const maybeConfig = await maybeReadConfig(configPath);
    if (maybeConfig) {
      defaultConfig = maybeConfig;
      defaultConfigPath = configPath;
      return { defaultConfig, defaultConfigPath };
    }
  }

  return { defaultConfig, defaultConfigPath };
}
