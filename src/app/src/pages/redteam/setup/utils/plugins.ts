import {
  DEFAULT_NUM_TESTS_PER_PLUGIN,
  DEFAULT_PLUGINS,
  DEFAULT_STRATEGIES,
  displayNameOverrides,
  type Plugin,
} from '@promptfoo/redteam/constants';
import { type Config } from '../types';

// Values used by redteam run when the document leaves its test scope implicit.
export const defaultScanScope = {
  plugins: [...DEFAULT_PLUGINS],
  strategies: DEFAULT_STRATEGIES,
  numTests: DEFAULT_NUM_TESTS_PER_PLUGIN,
};

// Keep technical plugin names in the full catalog. Describe the risk in guided setup.
const starterLabels: Partial<Record<Plugin, string>> = {
  bfla: 'Unauthorized actions',
  bola: 'Access to other users’ records',
  'excessive-agency': 'Overstepping permissions',
  hallucination: 'Made-up answers',
  hijacking: 'Misuse of the app',
  overreliance: 'Trusting false assumptions',
  'pii:direct': 'Leaks of personal information',
  'rag-document-exfiltration': 'Leaks of private documents',
  rbac: 'Bypassing role restrictions',
};

export function riskName(id: string): string {
  if (!Object.prototype.hasOwnProperty.call(displayNameOverrides, id)) {
    return id;
  }
  return starterLabels[id as Plugin] ?? displayNameOverrides[id as Plugin];
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
