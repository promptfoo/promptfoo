import { LEGACY_DATASET_PLUGINS } from './constants/plugins';
import type { LegacyDatasetPlugin } from './constants/plugins';

/**
 * Normalizes plugin names, converting legacy dataset plugin names to the new format
 * @param pluginName - The plugin name to normalize
 * @returns The normalized plugin name
 */
export function normalizePluginName(pluginName: string): string {
  if (LEGACY_DATASET_PLUGINS.includes(pluginName as LegacyDatasetPlugin)) {
    return `dataset:${pluginName}`;
  }
  return pluginName;
}