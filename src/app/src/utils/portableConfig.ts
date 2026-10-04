import type { UnifiedConfig } from '@promptfoo/types';

/**
 * Returns a saved eval config without the directory the CLI ran it from.
 *
 * `basePath` only has meaning on the machine that produced the eval, and the web editor
 * rejects configs that carry it, so configs handed to the user (the YAML view, downloads)
 * leave it out. They can then be uploaded again or run with the CLI from any directory.
 */
export function toPortableConfig<T extends Partial<UnifiedConfig> | null | undefined>(
  config: T,
): T {
  if (!config || typeof config !== 'object' || !('basePath' in config)) {
    return config;
  }
  const { basePath: _basePath, ...portableConfig } = config;
  return portableConfig as T;
}
