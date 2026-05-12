import { type Config } from '../types';
import type { PluginConfig } from '@promptfoo/redteam/types';

/**
 * Counts the number of custom policies defined in the config.
 */
export function countSelectedCustomPolicies(config: Pick<Config, 'plugins'>): number {
  return (
    config.plugins.filter((p) => typeof p === 'object' && 'id' in p && p.id === 'policy').length ||
    0
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
    if (
      typeof plugin !== 'object' ||
      plugin === null ||
      !('id' in plugin) ||
      plugin.id !== 'intent' ||
      !('config' in plugin)
    ) {
      return count;
    }

    return count + countIntentEntries((plugin as { config: PluginConfig }).config?.intent);
  }, 0);
}
