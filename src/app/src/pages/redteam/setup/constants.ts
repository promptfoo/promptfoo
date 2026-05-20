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
export const PLUGINS_REQUIRING_CONFIG = [
  'indirect-prompt-injection',
  'prompt-extraction',
  'energy:puc-fixed-rate-benchmark-cap',
  'energy:puc-medical-baseline-integrity',
  'energy:puc-offer-eligibility-gate',
  'energy:puc-payment-plan-service-restoration-integrity',
  'energy:puc-product-scope-integrity',
  'energy:puc-variable-rate-savings-protection',
] as const;
export type PluginRequiringConfig = (typeof PLUGINS_REQUIRING_CONFIG)[number];
export const PLUGINS_REQUIRING_CONFIG_SET: ReadonlySet<string> = new Set(PLUGINS_REQUIRING_CONFIG);

/**
 * Type-safe check if a plugin requires configuration.
 */
export function requiresPluginConfig(plugin: string): plugin is PluginRequiringConfig {
  return PLUGINS_REQUIRING_CONFIG_SET.has(plugin as PluginRequiringConfig);
}
