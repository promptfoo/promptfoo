import { type Config } from '../types';
import type { PluginConfig } from '@promptfoo/redteam/types';

/**
 * Counts the number of custom policies defined in the config.
 */
export function countSelectedCustomPolicies(config: Config): number {
  return (
    config.plugins.filter((p) => typeof p === 'object' && 'id' in p && p.id === 'policy').length ||
    0
  );
}

/**
 * Counts the number of custom intents defined in the config. Mirrors
 * IntentPlugin's runtime semantics: each top-level array entry is one intent
 * (multi-step sequences count as a single intent), and a bare string is one.
 */
export function countSelectedCustomIntents(config: Config): number {
  const intent = config.plugins.find(
    (p): p is { id: string; config: PluginConfig } =>
      typeof p === 'object' && 'id' in p && p.id === 'intent' && 'config' in p,
  )?.config?.intent;

  if (!intent) {
    return 0;
  }
  return Array.isArray(intent) ? intent.length : 1;
}
