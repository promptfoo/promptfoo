import { createHash } from 'crypto';

import { isCloudProvider } from '../cloud';
import { normalizeProviderRef } from '../providerRef';
import { redactSecretLeaves } from '../sanitizer';

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

function getProviderFingerprint(
  provider: RuntimeProvider,
  sourceFingerprintInput: unknown,
): string {
  // Retain `basePath` in the fingerprint: a relative file-backed provider ref
  // (`python:provider.py`, `file://./p.js`) resolves to different code under a
  // different base directory, so dropping it would let replay run a different
  // implementation under the same identity. `redactSecretLeaves` strips only the
  // credential leaves while preserving the resolved provenance and the non-secret
  // authentication/session structure needed to detect endpoint/auth drift.
  const fingerprintInput = {
    runtime: {
      callApi: provider.callApi,
      config: redactSecretLeaves(provider.config ?? {}),
      id: getRuntimeProviderId(provider),
      label: provider.label,
    },
    source: redactSecretLeaves(sourceFingerprintInput),
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

/**
 * Least-privilege permission identity for a single provider reference. Accepts the
 * shapes an effective provider can take: a resolved `ApiProvider` instance (id is a
 * function), a bare id string, or a `{ id, label?, config }` reference. Inline JS
 * function providers have no cloud target to authorize and are skipped.
 */
function toPermissionProvider(provider: unknown): PermissionProvider | undefined {
  if (!provider) {
    return undefined;
  }
  if (typeof provider === 'string') {
    return isCloudProvider(provider) ? provider : { id: provider };
  }
  if (typeof provider === 'function' || typeof provider !== 'object') {
    return undefined;
  }
  const record = provider as {
    id?: unknown;
    label?: unknown;
    config?: { linkedTargetId?: unknown };
  };
  const id = typeof record.id === 'function' ? (record.id as () => string)() : record.id;
  if (typeof id !== 'string' || id.length === 0) {
    return undefined;
  }
  if (isCloudProvider(id)) {
    return id;
  }
  const linkedTargetId =
    typeof record.config?.linkedTargetId === 'string' ? record.config.linkedTargetId : undefined;
  return {
    id,
    ...(typeof record.label === 'string' ? { label: record.label } : {}),
    ...(linkedTargetId ? { config: { linkedTargetId } } : {}),
  };
}

interface EffectiveProviderTest {
  provider?: unknown;
  options?: { provider?: unknown } | unknown;
  assert?: unknown;
}

interface EffectiveProviderSource {
  tests?: unknown;
  defaultTest?: unknown;
  redteam?: { provider?: unknown } | unknown;
}

function collectTestProviderPermissions(test: unknown, into: PermissionProvider[]): void {
  if (!test || typeof test !== 'object') {
    return;
  }
  const record = test as EffectiveProviderTest;
  const push = (provider: unknown) => {
    const permission = toPermissionProvider(provider);
    if (permission) {
      into.push(permission);
    }
  };
  // Target override executed by callActiveProvider.
  push(record.provider);
  // Grader override (test.options.provider) executed for model-graded assertions.
  if (record.options && typeof record.options === 'object') {
    push((record.options as { provider?: unknown }).provider);
  }
  // Per-assertion grader providers.
  if (Array.isArray(record.assert)) {
    for (const assertion of record.assert) {
      if (assertion && typeof assertion === 'object') {
        push((assertion as { provider?: unknown }).provider);
      }
    }
  }
}

/**
 * Collect the least-privilege identities of every provider that a filtered run can
 * actually execute beyond the top-level matrix: per-test `provider` target
 * overrides, `defaultTest` providers, model-graded assertion graders, and the
 * red-team provider. Without these, a per-test `test.provider` escapes the
 * projected permission boundary that `buildProviderPermissionConfig` enforces.
 */
export function collectEffectiveTestProviderPermissions(
  source: EffectiveProviderSource,
): PermissionProvider[] {
  const collected: PermissionProvider[] = [];
  if (Array.isArray(source.tests)) {
    for (const test of source.tests) {
      collectTestProviderPermissions(test, collected);
    }
  }
  collectTestProviderPermissions(source.defaultTest, collected);
  if (source.redteam && typeof source.redteam === 'object') {
    const redteamProvider = (source.redteam as { provider?: unknown }).provider;
    const permission = toPermissionProvider(redteamProvider);
    if (permission) {
      collected.push(permission);
    }
  }

  const seen = new Set<string>();
  return collected.filter((permission) => {
    const key = JSON.stringify(permission);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function buildProviderPermissionConfig(
  config: object,
  selection: ProviderSelection,
  effectiveSource?: EffectiveProviderSource,
): Record<string, unknown> {
  const metadata = getPermissionMetadata(config);
  const hasRedteam = Boolean((config as { redteam?: unknown }).redteam);
  const selectionProviders = getPermissionProviders(selection);
  // Authorize per-test/default/grader/red-team providers alongside the selected
  // matrix so a filtered MCP run cannot execute an unauthorized `test.provider`.
  const effectiveProviders = effectiveSource
    ? collectEffectiveTestProviderPermissions({
        ...effectiveSource,
        redteam: effectiveSource.redteam ?? (config as { redteam?: unknown }).redteam,
      })
    : [];
  const seen = new Set(selectionProviders.map((provider) => JSON.stringify(provider)));
  const providers = [...selectionProviders];
  for (const provider of effectiveProviders) {
    const key = JSON.stringify(provider);
    if (!seen.has(key)) {
      seen.add(key);
      providers.push(provider);
    }
  }
  return {
    providers,
    prompts: [],
    ...(metadata ? { metadata } : {}),
    ...(hasRedteam ? { redteam: {} } : {}),
  };
}

export function buildProviderShareConfig<TConfig extends object>(
  config: TConfig,
  selection: ProviderSelection,
): TConfig {
  // Never spread the raw config into a remote share: it carries secrets in `env`,
  // per-test `provider`, `defaultTest`, and assertion/grader/red-team provider
  // configs. Drop local env data, project top-level providers to their
  // least-privilege identity, and redact credential leaves on every remaining
  // provider-bearing surface while preserving non-secret structure.
  const {
    env: _omittedEnv,
    providers: _omittedProviders,
    ...rest
  } = config as Record<string, unknown>;
  return {
    ...(redactSecretLeaves(rest) as Record<string, unknown>),
    providers: getPermissionProviders(selection),
  } as unknown as TConfig;
}
