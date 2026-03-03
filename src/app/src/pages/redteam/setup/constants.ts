/**
 * Layout constants for the redteam setup page.
 *
 * These are extracted to a separate file to avoid circular dependencies between:
 * - page.tsx (defines the layout)
 * - PageWrapper.tsx (needs SIDEBAR_WIDTH for positioning)
 *
 * Both modules now import from this constants file instead of each other.
 */

export const SIDEBAR_WIDTH = 240;
export const NAVBAR_HEIGHT = 64;

/**
 * Plugins that require additional configuration before they can be used.
 * Used across multiple plugin selection components.
 */
export const PLUGINS_REQUIRING_CONFIG = ['indirect-prompt-injection', 'prompt-extraction'] as const;
export type PluginRequiringConfig = (typeof PLUGINS_REQUIRING_CONFIG)[number];
export const PLUGINS_REQUIRING_CONFIG_SET: ReadonlySet<string> = new Set(PLUGINS_REQUIRING_CONFIG);

/**
 * Type-safe check if a plugin requires configuration.
 */
export function requiresPluginConfig(plugin: string): plugin is PluginRequiringConfig {
  return PLUGINS_REQUIRING_CONFIG_SET.has(plugin as PluginRequiringConfig);
}
