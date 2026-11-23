import { isAgentOutcomePlugin, type Plugin } from '@promptfoo/redteam/constants';

import type { Config } from '../types';

export const INCOMPATIBLE_PREVIEW_MESSAGE =
  'Agent outcome plugins only support basic strategy previews.';

export function canPreviewPluginWithStrategy(pluginId: string, strategyId?: string) {
  return strategyId === 'basic' || strategyId === 'default' || !isAgentOutcomePlugin(pluginId);
}

export function getStrategyPreviewPlugins(plugins: Config['plugins'], strategyId?: string) {
  if (!plugins?.length) {
    return [{ id: 'harmful:hate' as const, config: {} }];
  }
  return plugins
    .map((plugin) => ({
      id: (typeof plugin === 'string' ? plugin : plugin.id) as Plugin,
      config: typeof plugin === 'string' ? {} : (plugin.config ?? {}),
    }))
    .filter(({ id }) => id && canPreviewPluginWithStrategy(id, strategyId));
}

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
