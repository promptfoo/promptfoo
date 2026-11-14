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
 * 2. Provider display names that respect custom labels
 */

import type { ProviderOptions } from '@promptfoo/types';

// Provider definitions can be strings, ProviderOptions objects, or record-style
export type ProviderDef = string | ProviderOptions | Record<string, unknown>;

export interface ProviderConfigMatch {
  config: ProviderOptions | undefined;
  matchType: 'id' | 'label' | 'record-key' | 'index' | 'none';
}

type ProviderMatchType = Exclude<ProviderConfigMatch['matchType'], 'none'>;

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
