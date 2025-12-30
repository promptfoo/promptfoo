import { type Config } from '../types';

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
 * Counts the number of custom intents defined in the config.
 */
export function countSelectedCustomIntents(config: Config): number {
  return (
    config.plugins.filter(
      (p): p is { id: string; config: any } =>
        typeof p === 'object' && 'id' in p && p.id === 'intent' && 'config' in p,
    )[0]?.config?.intent?.length || 0
  );
}
