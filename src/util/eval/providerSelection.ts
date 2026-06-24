import { createHash } from 'crypto';

import { isCloudProvider } from '../cloud';
import { normalizeProviderRef } from '../providerRef';
import { sanitizeObject } from '../sanitizer';

interface RuntimeProvider {
  id: string | (() => string);
  label?: string;
  config?: Record<string, unknown>;
  callApi?: unknown;
}

interface ProviderSelectionEntry {
  index: number;
  id: string;
  label?: string;
  cloudProviderId?: string;
  linkedTargetId?: string;
  fingerprint: string;
}

interface ProviderSelection {
  providers: ProviderSelectionEntry[];
}

type PermissionProvider =
  | string
  | {
      id: string;
      label?: string;
      config?: { linkedTargetId: string };
    };

function getRuntimeProviderId(provider: RuntimeProvider): string {
  return typeof provider.id === 'function' ? provider.id() : provider.id;
}

function stableSerialize(value: unknown, seen = new WeakSet<object>()): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'bigint') {
    return JSON.stringify({ bigint: value.toString() });
  }
  if (typeof value === 'function') {
    return JSON.stringify({ function: Function.prototype.toString.call(value) });
  }
  if (typeof value === 'symbol') {
    return JSON.stringify({ symbol: String(value) });
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value) ?? String(value);
  }
  if (seen.has(value)) {
    return '"[Circular]"';
  }
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => stableSerialize(item, seen)).join(',')}]`;
    }
    if (value instanceof Date) {
      return JSON.stringify(value.toISOString());
    }
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key], seen)}`)
      .join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

function canonicalizeFunctions(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'function') {
    return { __promptfooFunction: Function.prototype.toString.call(value) };
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => canonicalizeFunctions(item, seen));
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, canonicalizeFunctions(item, seen)]),
    );
  } finally {
    seen.delete(value);
  }
}

function getProviderFingerprint(
  provider: RuntimeProvider,
  sourceFingerprintInput: unknown,
): string {
  const { basePath: _ignoredBasePath, ...runtimeConfig } = provider.config ?? {};
  const fingerprintInput = {
    runtime: {
      callApi: provider.callApi,
      config: sanitizeObject(canonicalizeFunctions(runtimeConfig), {
        context: 'provider replay fingerprint',
        maxDepth: 100,
      }),
      id: getRuntimeProviderId(provider),
      label: provider.label,
    },
    source: sanitizeObject(canonicalizeFunctions(sourceFingerprintInput), {
      context: 'provider replay source fingerprint',
      maxDepth: 100,
    }),
  };
  return createHash('sha256').update(stableSerialize(fingerprintInput)).digest('hex');
}

function getSourceProviderMetadata(source: unknown, index: number) {
  const descriptor = normalizeProviderRef(source, { index });
  const sourceIds = [
    descriptor.id,
    'loadProviderPath' in descriptor ? descriptor.loadProviderPath : undefined,
  ];
  const cloudProviderId = sourceIds.find(
    (id): id is string => typeof id === 'string' && isCloudProvider(id),
  );
  const sourceConfig =
    'loadOptions' in descriptor && descriptor.loadOptions.config
      ? descriptor.loadOptions.config
      : undefined;
  const linkedTargetId =
    typeof sourceConfig?.linkedTargetId === 'string' ? sourceConfig.linkedTargetId : undefined;
  const sourceImplementation =
    typeof source === 'function'
      ? source
      : typeof source === 'object' &&
          source !== null &&
          'callApi' in source &&
          typeof source.callApi === 'function'
        ? source.callApi
        : undefined;
  const sourceFingerprintInput = {
    descriptor:
      'loadOptions' in descriptor
        ? descriptor.loadOptions
        : {
            id: descriptor.id,
            kind: descriptor.kind,
            label: descriptor.label,
            ...('loadProviderPath' in descriptor
              ? { loadProviderPath: descriptor.loadProviderPath }
              : {}),
          },
    implementation: sourceImplementation
      ? Function.prototype.toString.call(sourceImplementation)
      : undefined,
  };

  return { cloudProviderId, linkedTargetId, sourceFingerprintInput };
}

function createSelectionEntry(
  provider: RuntimeProvider,
  source: unknown,
  index: number,
): ProviderSelectionEntry {
  const {
    cloudProviderId,
    linkedTargetId: sourceLinkedTargetId,
    sourceFingerprintInput,
  } = getSourceProviderMetadata(source, index);
  const linkedTargetId =
    typeof provider.config?.linkedTargetId === 'string'
      ? provider.config.linkedTargetId
      : sourceLinkedTargetId;

  return {
    index,
    id: getRuntimeProviderId(provider),
    fingerprint: getProviderFingerprint(provider, sourceFingerprintInput),
    ...(provider.label ? { label: provider.label } : {}),
    ...(cloudProviderId ? { cloudProviderId } : {}),
    ...(linkedTargetId ? { linkedTargetId } : {}),
  };
}

export function createProviderSelection<TRuntime extends RuntimeProvider, TSource>(
  allProviders: TRuntime[],
  selectedProviderConfigs: TSource[] | undefined,
  selectedProviders: TRuntime[],
): ProviderSelection {
  if (!selectedProviderConfigs || selectedProviderConfigs.length !== allProviders.length) {
    throw new Error(
      `Provider selection provenance mismatch: resolved ${allProviders.length} providers but received ${selectedProviderConfigs?.length ?? 0} provider configs`,
    );
  }

  const entries: ProviderSelectionEntry[] = [];
  let providerIndex = 0;
  for (const selectedProvider of selectedProviders) {
    while (
      providerIndex < allProviders.length &&
      allProviders[providerIndex] !== selectedProvider
    ) {
      providerIndex++;
    }
    if (providerIndex >= allProviders.length) {
      throw new Error('Selected providers are not an ordered subset of the resolved provider list');
    }
    entries.push(
      createSelectionEntry(
        allProviders[providerIndex],
        selectedProviderConfigs[providerIndex],
        providerIndex,
      ),
    );
    providerIndex++;
  }

  return { providers: entries };
}

export function applyProviderSelection<TRuntime extends RuntimeProvider, TSource>(
  allProviders: TRuntime[],
  selectedProviderConfigs: TSource[] | undefined,
  selection: ProviderSelection,
): { providers: TRuntime[]; providerConfigs: TSource[] } {
  if (!selectedProviderConfigs || selectedProviderConfigs.length !== allProviders.length) {
    throw new Error(
      `Provider replay provenance mismatch: resolved ${allProviders.length} providers but received ${selectedProviderConfigs?.length ?? 0} provider configs`,
    );
  }

  const providers: TRuntime[] = [];
  const providerConfigs: TSource[] = [];
  let previousIndex = -1;
  for (const expected of selection.providers) {
    if (
      !Number.isSafeInteger(expected.index) ||
      expected.index <= previousIndex ||
      expected.index >= allProviders.length
    ) {
      throw new Error(`Invalid persisted provider selection index: ${expected.index}`);
    }
    previousIndex = expected.index;

    const provider = allProviders[expected.index];
    const source = selectedProviderConfigs[expected.index];
    const actual = createSelectionEntry(provider, source, expected.index);
    if (
      actual.id !== expected.id ||
      actual.label !== expected.label ||
      actual.cloudProviderId !== expected.cloudProviderId ||
      actual.linkedTargetId !== expected.linkedTargetId ||
      typeof expected.fingerprint !== 'string' ||
      actual.fingerprint !== expected.fingerprint
    ) {
      throw new Error(
        `Persisted provider selection no longer matches provider at index ${expected.index}`,
      );
    }

    providers.push(provider);
    providerConfigs.push(source);
  }

  return { providers, providerConfigs };
}

function getPermissionProviders(selection: ProviderSelection): PermissionProvider[] {
  return selection.providers.map((provider) => {
    if (provider.cloudProviderId) {
      return provider.cloudProviderId;
    }
    return {
      id: provider.id,
      ...(provider.label ? { label: provider.label } : {}),
      ...(provider.linkedTargetId ? { config: { linkedTargetId: provider.linkedTargetId } } : {}),
    };
  });
}

function getPermissionMetadata(config: object) {
  const { metadata } = config as { metadata?: unknown };
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }
  const { configId, teamId } = metadata as { configId?: unknown; teamId?: unknown };
  const permissionMetadata = {
    ...(typeof configId === 'string' ? { configId } : {}),
    ...(typeof teamId === 'string' ? { teamId } : {}),
  };
  return Object.keys(permissionMetadata).length > 0 ? permissionMetadata : undefined;
}

export function buildProviderPermissionConfig(
  config: object,
  selection: ProviderSelection,
): Record<string, unknown> {
  const metadata = getPermissionMetadata(config);
  const hasRedteam = Boolean((config as { redteam?: unknown }).redteam);
  return {
    providers: getPermissionProviders(selection),
    prompts: [],
    ...(metadata ? { metadata } : {}),
    ...(hasRedteam ? { redteam: {} } : {}),
  };
}

export function buildProviderShareConfig<TConfig extends object>(
  config: TConfig,
  selection: ProviderSelection,
): TConfig & { providers: PermissionProvider[] } {
  return {
    ...config,
    providers: getPermissionProviders(selection),
  };
}
