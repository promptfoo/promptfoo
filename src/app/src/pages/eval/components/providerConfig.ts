/**
 * Utilities for matching provider configs and extracting displayable information.
 *
 * The problem: CompletedPrompt.provider is just a string (e.g., "google:gemini-3-flash-preview"),
 * but config.providers[] contains full provider configurations with fields like:
 * - reasoning_effort (OpenAI/Azure/xAI)
 * - generationConfig.thinkingConfig (Google)
 * - temperature, max_tokens, etc.
 *
 * This module provides:
 * 1. Reliable matching of provider strings to full configs (not just by index)
 * 2. Extraction of key config fields for display as badges
 */

import type { ProviderOptions } from '@promptfoo/types';

// Provider definitions can be strings, ProviderOptions objects, or record-style
export type ProviderDef = string | ProviderOptions | Record<string, unknown>;

export interface ProviderConfigMatch {
  config: ProviderOptions | undefined;
  matchType: 'id' | 'label' | 'record-key' | 'index' | 'none';
}

export interface ConfigBadge {
  label: string;
  value: string;
  tooltip?: string;
}

type ProviderMatchType = Exclude<ProviderConfigMatch['matchType'], 'none'>;

interface BadgeSourceConfig {
  reasoning_effort?: unknown;
  model_reasoning_effort?: unknown;
  effort?: unknown;
  generationConfig?: {
    thinkingConfig?: {
      thinkingLevel?: string;
      thinkingBudget?: number;
    };
  };
  thinking?: {
    type?: string;
    budget_tokens?: number;
  };
  temperature?: unknown;
  max_tokens?: number;
  response_format?: {
    type?: string;
  };
  stream?: unknown;
  top_p?: unknown;
  presence_penalty?: unknown;
  frequency_penalty?: unknown;
  seed?: unknown;
}

/**
 * Provider config fields that are considered "structural" rather than configuration.
 * Used to distinguish ProviderOptions objects from record-style definitions.
 */
const PROVIDER_OPTIONS_FIELDS = new Set([
  'id',
  'label',
  'config',
  'prompts',
  'transform',
  'delay',
  'env',
]);

/**
 * Normalize a provider definition to a consistent structure.
 * Handles the various formats providers can be specified in.
 */
function normalizeProviderDef(provider: ProviderDef | null | undefined): ProviderOptions | null {
  if (typeof provider === 'string') {
    return { id: provider };
  }

  if (typeof provider !== 'object' || provider === null) {
    return null;
  }

  // Check if it's a ProviderOptions object (has id/label/config fields)
  if (provider.id !== undefined || provider.label !== undefined || provider.config !== undefined) {
    return {
      id: typeof provider.id === 'string' ? provider.id : undefined,
      label: typeof provider.label === 'string' ? provider.label : undefined,
      config: provider.config as ProviderOptions['config'],
    };
  }

  // Check if it's a record-style definition like { "openai:gpt-4o": { config: {...} } }
  const keys = Object.keys(provider);
  if (keys.length === 1) {
    const key = keys[0];
    // If the single key is not a known ProviderOptions field, treat it as provider ID
    if (!PROVIDER_OPTIONS_FIELDS.has(key)) {
      const value = (provider as Record<string, unknown>)[key];
      const valueObj =
        typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
      return {
        id: key,
        config: valueObj ? (valueObj.config ?? value) : undefined,
        label: valueObj && typeof valueObj.label === 'string' ? valueObj.label : undefined,
      };
    }
  }

  return null;
}

/**
 * Reattach original provider fields after normalization.
 *
 * Normalization extracts comparable id/label/config data, but display code still
 * needs the provider's full object shape when one was supplied.
 */
function mergeProviderConfig(
  provider: ProviderDef | null | undefined,
  normalized: ProviderOptions,
): ProviderOptions {
  if (typeof provider === 'object' && provider !== null) {
    return { ...normalized, ...provider };
  }
  return normalized;
}

/**
 * Build a match result using the original provider shape plus normalized fields.
 */
function createProviderMatch(
  provider: ProviderDef | null | undefined,
  normalized: ProviderOptions,
  matchType: ProviderMatchType,
): ProviderConfigMatch {
  return {
    config: mergeProviderConfig(provider, normalized),
    matchType,
  };
}

/**
 * Prefer explicit provider identity matches before falling back to prompt order.
 */
function findIdOrLabelMatch(
  providerString: string,
  providersArray: ProviderDef[],
): ProviderConfigMatch | undefined {
  for (const provider of providersArray) {
    const normalized = normalizeProviderDef(provider);
    if (!normalized) {
      continue;
    }

    if (normalized.id === providerString) {
      return createProviderMatch(provider, normalized, 'id');
    }

    if (normalized.label === providerString) {
      return createProviderMatch(provider, normalized, 'label');
    }
  }
}

/**
 * Match by prompt/provider index for legacy configs that cannot be matched by id.
 */
function getFallbackProviderMatch(
  providersArray: ProviderDef[],
  fallbackIndex: number | undefined,
): ProviderConfigMatch | undefined {
  if (fallbackIndex === undefined || fallbackIndex < 0 || fallbackIndex >= providersArray.length) {
    return undefined;
  }

  const provider = providersArray[fallbackIndex];
  const normalized = normalizeProviderDef(provider);
  return {
    config: normalized
      ? mergeProviderConfig(provider, normalized)
      : typeof provider === 'string'
        ? { id: provider }
        : provider,
    matchType: 'index',
  };
}

/**
 * Find the provider config that matches a prompt's provider string.
 *
 * The providers array can contain:
 * - Strings: "openai:gpt-4o"
 * - Objects: { id: "openai:gpt-4o", label: "My GPT", config: {...} }
 * - Records: { "openai:gpt-4o": { config: {...} } }
 *
 * @param providerString - The provider string from CompletedPrompt (e.g., "google:gemini-3-flash-preview")
 * @param providersArray - The config.providers array
 * @param fallbackIndex - Index to fall back to if no match found (for backwards compatibility)
 */
export function findProviderConfig(
  providerString: string,
  providersArray: ProviderDef[] | undefined,
  fallbackIndex?: number,
): ProviderConfigMatch {
  if (!providersArray || !Array.isArray(providersArray)) {
    return { config: undefined, matchType: 'none' };
  }

  return (
    findIdOrLabelMatch(providerString, providersArray) ??
    getFallbackProviderMatch(providersArray, fallbackIndex) ?? {
      config: undefined,
      matchType: 'none',
    }
  );
}

/**
 * Extract displayable config badges from a provider config.
 * Provider-aware: knows where to find key fields for different providers.
 *
 * @param providerString - The provider string (used to detect provider type)
 * @param providerConfig - The matched provider config object
 */
export function extractConfigBadges(
  _providerString: string,
  providerConfig: ProviderOptions | undefined,
): ConfigBadge[] {
  if (!providerConfig) {
    return [];
  }

  const config = getBadgeSourceConfig(providerConfig);

  return [
    ...getReasoningBadges(config),
    ...getGoogleThinkingBadges(config),
    ...getAnthropicThinkingBadges(config),
    ...getSamplingBadges(config),
  ];
}

/**
 * Provider badge fields usually live under config, but some call sites pass them
 * directly on the provider object.
 */
function getBadgeSourceConfig(providerConfig: ProviderOptions): BadgeSourceConfig {
  return (providerConfig.config || providerConfig) as BadgeSourceConfig;
}

/**
 * Extract reasoning/effort controls across OpenAI-compatible and Anthropic configs.
 */
function getReasoningBadges(config: BadgeSourceConfig): ConfigBadge[] {
  const badges: ConfigBadge[] = [];

  if (config.reasoning_effort) {
    badges.push({
      label: 'reasoning',
      value: String(config.reasoning_effort),
      tooltip: 'Reasoning effort level for o-series models',
    });
  }

  if (config.model_reasoning_effort) {
    badges.push({
      label: 'reasoning',
      value: String(config.model_reasoning_effort),
      tooltip: 'Model reasoning effort for Codex SDK',
    });
  }

  if (config.effort) {
    badges.push({
      label: 'effort',
      value: String(config.effort),
      tooltip: 'Output effort level for Anthropic models',
    });
  }

  return badges;
}

/**
 * Extract Gemini thinking settings, preferring level over budget when both exist.
 */
function getGoogleThinkingBadges(config: BadgeSourceConfig): ConfigBadge[] {
  if (config.generationConfig?.thinkingConfig) {
    const thinkingConfig = config.generationConfig.thinkingConfig;
    if (thinkingConfig.thinkingLevel) {
      return [
        {
          label: 'thinking',
          value: thinkingConfig.thinkingLevel.toLowerCase(),
          tooltip: thinkingConfig.thinkingBudget
            ? `Thinking level with budget: ${thinkingConfig.thinkingBudget} tokens`
            : 'Thinking level for Gemini models',
        },
      ];
    }

    if (thinkingConfig.thinkingBudget) {
      return [
        {
          label: 'thinking',
          value: `${thinkingConfig.thinkingBudget} tokens`,
          tooltip: 'Thinking budget for Gemini models',
        },
      ];
    }
  }

  return [];
}

/**
 * Extract Claude extended-thinking settings when thinking is explicitly enabled.
 */
function getAnthropicThinkingBadges(config: BadgeSourceConfig): ConfigBadge[] {
  if (
    config.thinking?.type !== 'enabled' &&
    config.thinking?.type !== 'adaptive' &&
    !config.thinking?.budget_tokens
  ) {
    return [];
  }

  return [
    {
      label: 'thinking',
      value: config.thinking.budget_tokens
        ? `${formatNumber(config.thinking.budget_tokens)} tokens`
        : (config.thinking.type ?? 'enabled'),
      tooltip: 'Extended thinking for Claude models',
    },
  ];
}

/**
 * Extract sampling and reproducibility controls that are useful at a glance.
 */
function getSamplingBadges(config: BadgeSourceConfig): ConfigBadge[] {
  const badges: ConfigBadge[] = [];

  if (config.temperature !== undefined && config.temperature !== 1) {
    badges.push({
      label: 'temp',
      value: String(config.temperature),
    });
  }

  if (config.max_tokens) {
    badges.push({
      label: 'max',
      value: formatNumber(config.max_tokens),
      tooltip: `Max tokens: ${config.max_tokens}`,
    });
  }

  if (config.response_format?.type && config.response_format.type !== 'text') {
    badges.push({
      label: 'format',
      value: config.response_format.type.replace('_', ' '),
    });
  }

  if (config.stream === true) {
    badges.push({
      label: 'stream',
      value: 'on',
    });
  }

  if (config.top_p !== undefined && config.top_p !== 1) {
    badges.push({
      label: 'top_p',
      value: String(config.top_p),
    });
  }

  if (config.presence_penalty && config.presence_penalty !== 0) {
    badges.push({
      label: 'pres',
      value: String(config.presence_penalty),
    });
  }

  if (config.frequency_penalty && config.frequency_penalty !== 0) {
    badges.push({
      label: 'freq',
      value: String(config.frequency_penalty),
    });
  }

  if (config.seed !== undefined) {
    badges.push({
      label: 'seed',
      value: String(config.seed),
    });
  }

  return badges;
}

/**
 * Format a number for compact display.
 */
function formatNumber(num: number): string {
  if (num >= 1000000) {
    const val = num / 1000000;
    return `${Number.isInteger(val) ? val : val.toFixed(1)}M`;
  }
  if (num >= 1000) {
    const val = num / 1000;
    return `${Number.isInteger(val) ? val : val.toFixed(1)}k`;
  }
  return String(num);
}

/**
 * Get the display name for a provider.
 * Returns the label if set, otherwise formats the provider ID.
 *
 * @param providerString - The string used to match/identify this provider
 * @param providerConfig - The full provider configuration object
 * @param matchType - How the provider was matched (affects display logic)
 */
export function getProviderDisplayName(
  providerString: string,
  providerConfig: ProviderOptions | undefined,
  matchType?: ProviderConfigMatch['matchType'],
): { prefix: string; name: string; label?: string } {
  // When matched by label, the providerString IS the label.
  // Return it directly to avoid incorrect prefix:name splitting.
  // Example: label="My GPT" would incorrectly split to prefix="My GPT", name="My GPT"
  if (matchType === 'label' && providerString) {
    return { prefix: '', name: providerString, label: providerString };
  }

  const parts = providerString.split(':');
  const prefix = parts[0];
  const name = parts.slice(1).join(':') || prefix;

  // Check for custom label in config (for id/record-key matches that have a label)
  const label = providerConfig?.label;
  if (label && typeof label === 'string' && label !== providerString) {
    return { prefix, name, label };
  }

  return { prefix, name };
}
