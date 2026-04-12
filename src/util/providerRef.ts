import fs from 'fs';
import path from 'path';

import yaml from 'js-yaml';
import { maybeLoadConfigFromExternalFile } from './file';
import invariant from './invariant';

import type { ProviderOptions, ProviderOptionsMap } from '../types/providers';

export type ProviderRefKind = 'named' | 'file' | 'function' | 'options' | 'map' | 'unknown';

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
  modulePath: string;
  relativePath: string;
  wasArray: boolean;
}

export function isValidProviderId(id: unknown): id is string {
  return id !== null && id !== undefined && typeof id === 'string' && id !== '';
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
 */
export function readProviderConfigFile(
  providerPath: string,
  basePath?: string,
): ProviderConfigFile {
  const relativePath = providerPath.slice('file://'.length);
  const modulePath = path.isAbsolute(relativePath)
    ? relativePath
    : path.join(basePath || process.cwd(), relativePath);

  const rawContent = yaml.load(fs.readFileSync(modulePath, 'utf8'));
  const fileContent = maybeLoadConfigFromExternalFile(rawContent) as
    | ProviderOptions
    | ProviderOptions[];
  invariant(fileContent, `Provider config ${relativePath} is undefined`);

  return {
    configs: [fileContent].flat() as ProviderOptions[],
    modulePath,
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
 * Converts every supported provider reference shape into one descriptor used by
 * provider loading, filtering, and id extraction.
 */
export function normalizeProviderRef(
  provider: unknown,
  options: { index?: number; functionId?: string; unknownId?: string } = {},
): ProviderRefDescriptor {
  const { index } = options;

  if (typeof provider === 'string') {
    const kind = isProviderConfigFileReference(provider) ? 'file' : 'named';
    return {
      kind,
      id: provider,
      loadProviderPath: provider,
    } as NamedProviderRef | FileProviderRef;
  }

  if (typeof provider === 'function') {
    const label = getProviderLabel(provider);
    return {
      kind: 'function',
      id:
        label ??
        options.functionId ??
        (index === undefined ? 'custom-function' : `custom-function-${index}`),
      label,
    };
  }

  if (typeof provider === 'object' && provider !== null) {
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
    if (keys.length > 0) {
      const originalId = keys[0];
      const providerObject = (provider as ProviderOptionsMap)[originalId];
      if (
        typeof providerObject === 'object' &&
        providerObject !== null &&
        !Array.isArray(providerObject) &&
        isValidProviderId(originalId) &&
        !PROVIDER_OPTION_KEYS.has(originalId)
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
    id: options.unknownId ?? (index === undefined ? 'unknown' : `unknown-${index}`),
  };
}
