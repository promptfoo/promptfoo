import * as path from 'path';

import { isApiProvider, isProviderOptions, type TestCase } from '../types';

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
    // isProviderOptions guarantees provider.id is a non-empty string
    return canonicalizeProviderId(provider.id);
  }

  // Handle any other object with id property
  if (typeof provider === 'object' && 'id' in provider && typeof provider.id === 'string') {
    return canonicalizeProviderId(provider.id);
  }

  return undefined;
}
