import { categoryAliases, type Plugin } from '@promptfoo/redteam/constants';

/**
 * Converts a plugin name to its corresponding metric name using the official categoryAliases mapping
 */
export const getMetricNameFromPlugin = (pluginName: string, categoryType: string): string => {
  if (pluginName?.startsWith('harmful:')) {
    return categoryAliases['harmful'];
  }

  // Try the plugin name directly in categoryAliases
  if (categoryAliases[pluginName as Plugin]) {
    return categoryAliases[pluginName as Plugin];
  }

  // Try with category type if plugin name doesn't work
  if (categoryAliases[categoryType as Plugin]) {
    return categoryAliases[categoryType as Plugin];
  }

  // Fall back to original plugin name
  return pluginName;
};
