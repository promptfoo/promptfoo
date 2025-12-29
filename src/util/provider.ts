import * as path from 'path';

import { isApiProvider, isProviderOptions, type TestCase } from '../types';

import type { ApiProvider } from '../types/providers';

function canonicalizeProviderId(id: string): string {
  // Handle file:// prefix
  if (id.startsWith('file://')) {
    const filePath = id.slice('file://'.length);
    return path.isAbsolute(filePath) ? id : `file://${path.resolve(filePath)}`;
  }

  // Handle other executable prefixes with file paths
  const executablePrefixes = ['exec:', 'python:', 'golang:'];
  for (const prefix of executablePrefixes) {
    if (id.startsWith(prefix)) {
      const filePath = id.slice(prefix.length);
      if (filePath.includes('/') || filePath.includes('\\')) {
        return `${prefix}${path.resolve(filePath)}`;
      }
      return id;
    }
  }

  // For JavaScript/TypeScript files without file:// prefix
  if (
    (id.endsWith('.js') || id.endsWith('.ts') || id.endsWith('.mjs')) &&
    (id.includes('/') || id.includes('\\'))
  ) {
    return `file://${path.resolve(id)}`;
  }

  return id;
}

function getProviderLabel(provider: any): string | undefined {
  return provider?.label && typeof provider.label === 'string' ? provider.label : undefined;
}

export function providerToIdentifier(
  provider: TestCase['provider'] | { id?: string; label?: string } | undefined,
): string | undefined {
  if (!provider) {
    return undefined;
  }

  if (typeof provider === 'string') {
    return canonicalizeProviderId(provider);
  }

  // Check for label first on any provider type
  const label = getProviderLabel(provider);
  if (label) {
    return label;
  }

  if (isApiProvider(provider)) {
    return canonicalizeProviderId(provider.id());
  }

  if (isProviderOptions(provider)) {
    if (provider.id) {
      return canonicalizeProviderId(provider.id);
    }
    return undefined;
  }

  // Handle any other object with id property
  if (typeof provider === 'object' && 'id' in provider && typeof provider.id === 'string') {
    return canonicalizeProviderId(provider.id);
  }

  return undefined;
}

/**
 * Gets the identifier string for a provider (label or id).
 */
export function getProviderIdentifier(provider: ApiProvider): string {
  return provider.label || provider.id();
}

/**
 * Checks if a provider reference matches a given provider.
 * Supports exact matching and wildcard patterns.
 */
export function doesProviderRefMatch(ref: string, provider: ApiProvider): boolean {
  const label = provider.label;
  const id = provider.id();

  // Exact label match
  if (label && label === ref) {
    return true;
  }

  // Exact ID match
  if (id === ref) {
    return true;
  }

  // Wildcard match: 'openai:*' matches 'openai:gpt-4', etc.
  if (ref.endsWith('*')) {
    const prefix = ref.slice(0, -1);
    if (label?.startsWith(prefix) || id.startsWith(prefix)) {
      return true;
    }
  }

  // Legacy prefix match: 'openai' matches 'openai:gpt-4'
  if (label?.startsWith(`${ref}:`) || id.startsWith(`${ref}:`)) {
    return true;
  }

  return false;
}

/**
 * Checks if a provider is allowed based on a list of allowed references.
 */
export function isProviderAllowed(
  provider: ApiProvider,
  allowedProviders: string[] | undefined,
): boolean {
  if (!Array.isArray(allowedProviders)) {
    return true; // No filter = all allowed
  }
  if (allowedProviders.length === 0) {
    return false; // Empty array = none allowed
  }
  return allowedProviders.some((ref) => doesProviderRefMatch(ref, provider));
}
