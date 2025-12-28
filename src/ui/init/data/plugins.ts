/**
 * Plugin catalog for the redteam init wizard.
 *
 * This provides a structured view of available plugins organized by category.
 * The actual plugin implementations and constants are in src/redteam/constants/plugins.ts
 */

import { displayNameOverrides, subCategoryDescriptions } from '../../../redteam/constants/metadata';
import {
  BASE_PLUGINS,
  BIAS_PLUGINS,
  CONFIG_REQUIRED_PLUGINS,
  DEFAULT_PLUGINS,
  HARM_PLUGINS,
  PII_PLUGINS,
} from '../../../redteam/constants/plugins';

export interface PluginDefinition {
  id: string;
  name: string;
  description: string;
  defaultSelected: boolean;
  requiresConfig?: boolean;
  severity?: 'critical' | 'high' | 'medium' | 'low';
}

export interface PluginCategory {
  id: string;
  name: string;
  description: string;
  plugins: PluginDefinition[];
}

/**
 * Get the display name for a plugin.
 */
function getDisplayName(pluginId: string): string {
  if (displayNameOverrides[pluginId as keyof typeof displayNameOverrides]) {
    return displayNameOverrides[pluginId as keyof typeof displayNameOverrides];
  }
  // Convert kebab-case to Title Case
  return pluginId
    .split(':')
    .pop()!
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get the description for a plugin.
 */
function getDescription(pluginId: string): string {
  return (
    subCategoryDescriptions[pluginId as keyof typeof subCategoryDescriptions] ||
    'No description available'
  );
}

/**
 * Get severity based on plugin type.
 */
function getSeverity(pluginId: string): 'critical' | 'high' | 'medium' | 'low' {
  if (pluginId.startsWith('harmful:') || PII_PLUGINS.includes(pluginId as any)) {
    return 'critical';
  }
  if (pluginId.includes('injection') || pluginId.includes('jailbreak')) {
    return 'high';
  }
  if (BIAS_PLUGINS.includes(pluginId as any)) {
    return 'medium';
  }
  return 'low';
}

/**
 * Create a plugin definition from a plugin ID.
 */
function createPluginDef(pluginId: string): PluginDefinition {
  return {
    id: pluginId,
    name: getDisplayName(pluginId),
    description: getDescription(pluginId),
    defaultSelected: DEFAULT_PLUGINS.has(pluginId as any),
    requiresConfig: CONFIG_REQUIRED_PLUGINS.includes(pluginId as any),
    severity: getSeverity(pluginId),
  };
}

/**
 * Plugin catalog organized by category.
 */
export const PLUGIN_CATALOG: PluginCategory[] = [
  {
    id: 'base',
    name: 'Core Security',
    description: 'Essential security tests for LLM applications',
    plugins: BASE_PLUGINS.map(createPluginDef),
  },
  {
    id: 'harmful',
    name: 'Harmful Content',
    description: 'Tests for generation of harmful or dangerous content',
    plugins: Object.keys(HARM_PLUGINS).sort().map(createPluginDef),
  },
  {
    id: 'pii',
    name: 'PII Protection',
    description: 'Tests for personal identifiable information exposure',
    plugins: PII_PLUGINS.map(createPluginDef),
  },
  {
    id: 'bias',
    name: 'Bias Detection',
    description: 'Tests for biased responses across protected characteristics',
    plugins: BIAS_PLUGINS.map(createPluginDef),
  },
  {
    id: 'injection',
    name: 'Prompt Injection',
    description: 'Tests for prompt injection vulnerabilities',
    plugins: [
      'indirect-prompt-injection',
      'prompt-extraction',
      'system-prompt-override',
      'sql-injection',
      'shell-injection',
    ].map(createPluginDef),
  },
  {
    id: 'security',
    name: 'Security & Access',
    description: 'Tests for security and access control vulnerabilities',
    plugins: ['bola', 'bfla', 'rbac', 'ssrf', 'debug-access', 'cross-session-leak'].map(
      createPluginDef,
    ),
  },
  {
    id: 'reliability',
    name: 'Reliability',
    description: 'Tests for reliability and robustness issues',
    plugins: ['hallucination', 'overreliance', 'excessive-agency', 'divergent-repetition'].map(
      createPluginDef,
    ),
  },
  {
    id: 'custom',
    name: 'Custom Policies',
    description: 'User-defined policy and intent testing',
    plugins: ['policy', 'intent'].map(createPluginDef),
  },
];

/**
 * Get a flat list of all plugins.
 */
export function getAllPlugins(): PluginDefinition[] {
  return PLUGIN_CATALOG.flatMap((category) => category.plugins);
}

/**
 * Get plugins by category ID.
 */
export function getPluginsByCategory(categoryId: string): PluginDefinition[] {
  const category = PLUGIN_CATALOG.find((c) => c.id === categoryId);
  return category?.plugins || [];
}

/**
 * Get default plugins (pre-selected for new configs).
 */
export function getDefaultPlugins(): string[] {
  return Array.from(DEFAULT_PLUGINS);
}

/**
 * Get plugin definition by ID.
 */
export function getPlugin(pluginId: string): PluginDefinition | undefined {
  for (const category of PLUGIN_CATALOG) {
    const plugin = category.plugins.find((p) => p.id === pluginId);
    if (plugin) {
      return plugin;
    }
  }
  return undefined;
}

/**
 * Check if a plugin requires configuration.
 */
export function requiresConfig(pluginId: string): boolean {
  return CONFIG_REQUIRED_PLUGINS.includes(pluginId as any);
}
