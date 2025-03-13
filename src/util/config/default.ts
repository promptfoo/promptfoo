import path from 'path';
import type { UnifiedConfig } from '../../types';
import { maybeReadConfig } from './load';

/**
 * Cache to store loaded configurations for different directories.
 */
export const configCache = new Map<
  string,
  { defaultConfig: Partial<UnifiedConfig>; defaultConfigPath: string | undefined }
>();

/**
 * Loads the default configuration file from the specified directory.
 *
 * @param dir - The directory to search for configuration files. Defaults to the current working directory.
 * @param configName - The name of the configuration file to load. Defaults to 'promptfooconfig'.
 * @returns A promise that resolves to an object containing the default configuration and its file path.
 * The default configuration is partial, and the file path may be undefined if no configuration is found.
 */
export async function loadDefaultConfig(
  dir?: string,
  configName: string = 'promptfooconfig',
): Promise<{
  defaultConfig: Partial<UnifiedConfig>;
  defaultConfigPath: string | undefined;
}> {
  dir = dir || process.cwd();

  // Check if the result is already cached
  const cacheKey = `${dir}:${configName}`;
  if (configCache.has(cacheKey)) {
    return configCache.get(cacheKey)!;
  }

  let defaultConfig: Partial<UnifiedConfig> = {};
  let defaultConfigPath: string | undefined;

  // NOTE: sorted by frequency of use
  const extensions = ['yaml', 'yml', 'json', 'cjs', 'cts', 'js', 'mjs', 'mts', 'ts'];

  for (const ext of extensions) {
    const configPath = path.join(dir, `${configName}.${ext}`);
    const maybeConfig = await maybeReadConfig(configPath);
    if (maybeConfig) {
      defaultConfig = maybeConfig;
      defaultConfigPath = configPath;
      break;
    }
  }

  const result = { defaultConfig, defaultConfigPath };
  configCache.set(cacheKey, result);
  return result;
}

export function clearConfigCache() {
  configCache.clear();
}
