import fs from 'fs';
import path from 'path';

import yaml from 'js-yaml';
import { maybeLoadConfigFromExternalFile } from './file';
import invariant from './invariant';

import type { ProviderOptions, ProviderOptionsMap } from '../types/providers';

// Keys belonging to the ProviderOptions interface (src/types/providers.ts).
// When an object's first key matches one of these, it is NOT treated as a
// ProviderOptionsMap (where the key would be a provider ID like "openai:responses:gpt-5.4").
// Keep this set in sync with the ProviderOptions interface.
const PROVIDER_OPTION_KEYS = new Set<string>([
  'id',
  'label',
  'config',
  'prompts',
  'transform',
  'delay',
  'env',
  'inputs',
]);

interface ProviderRefBase {
  id: string;
  label?: string;
}

export interface NamedProviderRef extends ProviderRefBase {
  kind: 'named';
  loadProviderPath: string;
}

export interface FileProviderRef extends ProviderRefBase {
  kind: 'file';
  loadProviderPath: string;
}

export interface FunctionProviderRef extends ProviderRefBase {
  kind: 'function';
}

export interface OptionsProviderRef extends ProviderRefBase {
  kind: 'options';
  loadOptions: ProviderOptions;
  loadProviderPath: string;
}

export interface MapProviderRef extends ProviderRefBase {
  kind: 'map';
  loadOptions: ProviderOptions;
  loadProviderPath: string;
}

export interface UnknownProviderRef extends ProviderRefBase {
  kind: 'unknown';
}

export type ProviderRefDescriptor =
  | NamedProviderRef
  | FileProviderRef
  | FunctionProviderRef
  | OptionsProviderRef
  | MapProviderRef
  | UnknownProviderRef;

export interface ProviderConfigFile {
  configs: ProviderOptions[];
  relativePath: string;
  wasArray: boolean;
}

/** Returns true if the value is a non-empty string suitable as a provider identifier. */
export function isValidProviderId(id: unknown): id is string {
  return typeof id === 'string' && id !== '';
}

function getProviderLabel(provider: unknown): string | undefined {
  if (
    (typeof provider === 'object' || typeof provider === 'function') &&
    provider !== null &&
    'label' in provider &&
    typeof provider.label === 'string'
  ) {
    return provider.label;
  }
  return undefined;
}

/**
 * Resolves relative file paths in provider IDs to absolute paths for consistent matching.
 * Handles file://, exec:, python:, golang: prefixes and bare .js/.ts/.mjs paths.
 */
export function canonicalizeProviderId(id: string): string {
  if (id.startsWith('file://')) {
    const filePath = id.slice('file://'.length);
    return path.isAbsolute(filePath) ? id : `file://${path.resolve(filePath)}`;
  }

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

  if (
    (id.endsWith('.js') || id.endsWith('.ts') || id.endsWith('.mjs')) &&
    (id.includes('/') || id.includes('\\'))
  ) {
    return `file://${path.resolve(id)}`;
  }

  return id;
}

/**
 * Returns true for provider refs that should be expanded from YAML/JSON config files.
 */
export function isProviderConfigFileReference(providerPath: string): boolean {
  return (
    providerPath.startsWith('file://') &&
    (providerPath.endsWith('.yaml') ||
      providerPath.endsWith('.yml') ||
      providerPath.endsWith('.json'))
  );
}

/**
 * Reads a provider config file and normalizes single-provider and multi-provider files.
 * Returns a `wasArray` flag so callers can detect multi-provider files that require
 * `loadApiProviders` instead of `loadApiProvider`.
 */
export function readProviderConfigFile(
  providerPath: string,
  basePath?: string,
): ProviderConfigFile {
  const relativePath = providerPath.slice('file://'.length);
  const resolvedPath = path.isAbsolute(relativePath)
    ? relativePath
    : path.join(basePath || process.cwd(), relativePath);

  let rawContent: unknown;
  try {
    rawContent = yaml.load(fs.readFileSync(resolvedPath, 'utf8'));
  } catch (err) {
    throw new Error(
      `Failed to load provider config ${relativePath}: ${err instanceof Error ? err.message : err}`,
    );
  }
  const fileContent = maybeLoadConfigFromExternalFile(rawContent) as
    | ProviderOptions
    | ProviderOptions[];
  invariant(fileContent, `Provider config ${relativePath} is undefined`);

  return {
    configs: [fileContent].flat() as ProviderOptions[],
    relativePath,
    wasArray: Array.isArray(fileContent),
  };
}

/**
 * Loads provider config objects from a file-backed provider reference.
 */
export function loadProviderConfigsFromFile(
  providerPath: string,
  basePath?: string,
): ProviderOptions[] {
  return readProviderConfigFile(providerPath, basePath).configs;
}

/**
 * Pure, synchronous classifier that converts every supported provider reference shape
 * into a discriminated descriptor. Does not read files or instantiate providers.
 */
export function normalizeProviderRef(
  provider: unknown,
  options: { index?: number } = {},
): ProviderRefDescriptor {
  const { index } = options;

  if (typeof provider === 'string') {
    if (!isValidProviderId(provider)) {
      return { kind: 'unknown', id: index === undefined ? 'unknown' : `unknown-${index}` };
    }
    if (isProviderConfigFileReference(provider)) {
      return { kind: 'file', id: provider, loadProviderPath: provider };
    }
    return { kind: 'named', id: provider, loadProviderPath: provider };
  }

  if (typeof provider === 'function') {
    const label = getProviderLabel(provider);
    return {
      kind: 'function',
      id: label ?? (index === undefined ? 'custom-function' : `custom-function-${index}`),
      label,
    };
  }

  if (typeof provider === 'object' && provider !== null && !Array.isArray(provider)) {
    const providerId = (provider as ProviderOptions).id;
    const label = getProviderLabel(provider);
    if (isValidProviderId(providerId)) {
      return {
        kind: 'options',
        id: providerId,
        label,
        loadOptions: provider as ProviderOptions,
        loadProviderPath: providerId,
      };
    }

    const keys = Object.keys(provider);
    if (keys.length === 1 && !PROVIDER_OPTION_KEYS.has(keys[0])) {
      const originalId = keys[0];
      const providerObject = (provider as ProviderOptionsMap)[originalId];
      if (
        typeof providerObject === 'object' &&
        providerObject !== null &&
        !Array.isArray(providerObject) &&
        isValidProviderId(originalId)
      ) {
        const id = isValidProviderId(providerObject.id) ? providerObject.id : originalId;
        return {
          kind: 'map',
          id,
          label: getProviderLabel(providerObject),
          loadOptions: {
            ...providerObject,
            id,
          },
          loadProviderPath: originalId,
        };
      }
    }

    if (isValidProviderId(label)) {
      return {
        kind: 'unknown',
        id: label,
        label,
      };
    }
  }

  return {
    kind: 'unknown',
    id: index === undefined ? 'unknown' : `unknown-${index}`,
  };
}
