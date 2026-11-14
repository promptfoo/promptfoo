import { requiresPluginConfig } from '../constants';

import type { Config, LocalPluginConfig } from '../types';

/**
 * Counts the number of custom policies defined in the config.
 */
export function countSelectedCustomPolicies(config: Pick<Config, 'plugins'>): number {
  return config.plugins.filter((p) => isRecord(p) && p.id === 'policy').length;
}

type IntentPluginLike = {
  id: 'intent';
  config?: {
    intent?: unknown;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isIntentPlugin(plugin: unknown): plugin is IntentPluginLike {
  return (
    isRecord(plugin) &&
    plugin.id === 'intent' &&
    (!('config' in plugin) || plugin.config === undefined || isRecord(plugin.config))
  );
}

function hasIntentContent(intent: unknown): boolean {
  if (typeof intent === 'string') {
    return intent.trim().length > 0;
  }
  if (Array.isArray(intent)) {
    return intent.some((step) => typeof step === 'string' && step.trim().length > 0);
  }
  return false;
}

function countIntentEntries(intent: unknown): number {
  const entries = Array.isArray(intent) ? intent : [intent];
  return entries.filter(hasIntentContent).length;
}

/**
 * Counts the number of custom intents defined in the config.
 *
 * Approximates IntentPlugin's runtime semantics for in-browser configs: each
 * top-level array entry is one intent (multi-step sequences count as a single
 * intent), and a bare string is one. Unlike the plugin runtime, this does NOT
 * resolve `file://` (or other external) references — those are counted as 1
 * here because the frontend cannot read local files. Pre-generation totals
 * shown in the UI for file-backed intent lists are therefore a lower bound;
 * the CLI/server resolves them and produces the actual count.
 */
export function countSelectedCustomIntents(config: Pick<Config, 'plugins'>): number {
  return config.plugins.reduce((count, plugin) => {
    if (!isIntentPlugin(plugin)) {
      return count;
    }

    return count + countIntentEntries(plugin.config?.intent);
  }, 0);
}

export function isPluginConfigComplete(
  plugin: string,
  config?: LocalPluginConfig[string],
): boolean {
  if (!requiresPluginConfig(plugin)) {
    return true;
  }
  if (plugin === 'mcp:tool-response-poisoning') {
    const tools = config?.allowedTools;
    return (
      Array.isArray(tools) &&
      tools.length > 0 &&
      tools.every((name) => typeof name === 'string' && name.trim() !== '')
    );
  }
  return (
    !!config &&
    Object.keys(config).length > 0 &&
    Object.values(config).every(
      (value) =>
        !(Array.isArray(value) && value.length === 0) &&
        !(typeof value === 'string' && value.trim() === ''),
    )
  );
}
