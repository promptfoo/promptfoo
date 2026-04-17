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
function normalizeProviderDef(provider: ProviderDef): ProviderOptions | null {
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

  // First pass: try to match by id or label
  for (const provider of providersArray) {
    const normalized = normalizeProviderDef(provider);
    if (!normalized) {
      continue;
    }

    // Match by ID
    if (normalized.id === providerString) {
      return {
        // Only spread provider if it's an object (strings would spread as indexed chars)
        config:
          typeof provider === 'object' && provider !== null
            ? { ...normalized, ...provider }
            : normalized,
        matchType: 'id',
      };
    }

    // Match by label
    if (normalized.label === providerString) {
      return {
        config:
          typeof provider === 'object' && provider !== null
            ? { ...normalized, ...provider }
            : normalized,
        matchType: 'label',
      };
    }
  }

  // Second pass: check for record-style keys
  for (const provider of providersArray) {
    if (typeof provider === 'object' && provider !== null) {
      const keys = Object.keys(provider);
      if (keys.length === 1 && !PROVIDER_OPTIONS_FIELDS.has(keys[0])) {
        if (keys[0] === providerString) {
          const value = (provider as Record<string, unknown>)[keys[0]];
          return {
            config: {
              id: keys[0],
              ...(typeof value === 'object' && value !== null ? value : {}),
            } as ProviderOptions,
            matchType: 'record-key',
          };
        }
      }
    }
  }

  // Fallback to index-based matching (for backwards compatibility)
  if (fallbackIndex !== undefined && fallbackIndex < providersArray.length) {
    const provider = providersArray[fallbackIndex];
    const normalized = normalizeProviderDef(provider);
    return {
      // Only spread provider if it's an object (strings would spread as indexed chars)
      config:
        normalized && typeof provider === 'object' && provider !== null
          ? { ...normalized, ...provider }
          : normalized || (typeof provider === 'string' ? { id: provider } : provider),
      matchType: 'index',
    };
  }

  return { config: undefined, matchType: 'none' };
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
  const badges: ConfigBadge[] = [];

  if (!providerConfig) {
    return badges;
  }

  // Get the nested config object (could be at providerConfig.config or directly on providerConfig)
  const config = providerConfig.config || providerConfig;

  // OpenAI / Azure / xAI / Bedrock reasoning effort
  if (config.reasoning_effort) {
    badges.push({
      label: 'reasoning',
      value: String(config.reasoning_effort),
      tooltip: 'Reasoning effort level for o-series models',
    });
  }

  // OpenAI Codex SDK model_reasoning_effort
  if (config.model_reasoning_effort) {
    badges.push({
      label: 'reasoning',
      value: String(config.model_reasoning_effort),
      tooltip: 'Model reasoning effort for Codex SDK',
    });
  }

  // Google thinking config
  if (config.generationConfig?.thinkingConfig) {
    const thinkingConfig = config.generationConfig.thinkingConfig;
    if (thinkingConfig.thinkingLevel) {
      badges.push({
        label: 'thinking',
        value: thinkingConfig.thinkingLevel.toLowerCase(),
        tooltip: thinkingConfig.thinkingBudget
          ? `Thinking level with budget: ${thinkingConfig.thinkingBudget} tokens`
          : 'Thinking level for Gemini models',
      });
    } else if (thinkingConfig.thinkingBudget) {
      badges.push({
        label: 'thinking',
        value: `${thinkingConfig.thinkingBudget} tokens`,
        tooltip: 'Thinking budget for Gemini models',
      });
    }
  }

  // Anthropic extended thinking
  if (config.thinking?.type === 'enabled' || config.thinking?.budget_tokens) {
    badges.push({
      label: 'thinking',
      value: config.thinking.budget_tokens
        ? `${formatNumber(config.thinking.budget_tokens)} tokens`
        : 'enabled',
      tooltip: 'Extended thinking for Claude models',
    });
  }

  // Temperature (if not default 1.0)
  if (config.temperature !== undefined && config.temperature !== 1) {
    badges.push({
      label: 'temp',
      value: String(config.temperature),
    });
  }

  // Max tokens
  if (config.max_tokens) {
    badges.push({
      label: 'max',
      value: formatNumber(config.max_tokens),
      tooltip: `Max tokens: ${config.max_tokens}`,
    });
  }

  // Response format (JSON mode, etc.)
  if (config.response_format?.type && config.response_format.type !== 'text') {
    badges.push({
      label: 'format',
      value: config.response_format.type.replace('_', ' '),
    });
  }

  // Streaming
  if (config.stream === true) {
    badges.push({
      label: 'stream',
      value: 'on',
    });
  }

  // Top P (if not default)
  if (config.top_p !== undefined && config.top_p !== 1) {
    badges.push({
      label: 'top_p',
      value: String(config.top_p),
    });
  }

  // Presence/frequency penalty (if set)
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

  // Seed (for reproducibility)
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
