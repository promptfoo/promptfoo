import deepEqual from 'fast-deep-equal';
import { safeJsonStringify } from '../util/json';

import type { CallApiContextParams, ProviderResponse } from '../types/index';

export const REMOTE_GENERATED_TEST_METADATA_KEY = '__promptfooRemoteGenerated';

export type RemoteGeneratedTestProvenance = {
  metadata: string[];
  unsafeRenderVars?: string[];
  vars: string[];
};

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

export function getChangedVarNames(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  return Object.keys(after).filter(
    (name) =>
      !Object.prototype.hasOwnProperty.call(before, name) || !deepEqual(before[name], after[name]),
  );
}

export function getRemoteGeneratedTestProvenance(
  metadata: Record<string, unknown> | undefined,
): RemoteGeneratedTestProvenance | undefined {
  const value = metadata?.[REMOTE_GENERATED_TEST_METADATA_KEY];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const provenance = value as Record<string, unknown>;
  const strings = (field: string) =>
    Array.isArray(provenance[field])
      ? provenance[field].filter((item): item is string => typeof item === 'string')
      : [];
  const unsafeRenderVars = strings('unsafeRenderVars');

  return {
    metadata: strings('metadata'),
    vars: strings('vars'),
    ...(unsafeRenderVars.length > 0 ? { unsafeRenderVars } : {}),
  };
}

export function getRemoteGeneratedRenderSkipVars(
  metadata: Record<string, unknown> | undefined,
  baseSkipVars: string[],
): string[] {
  const provenance = getRemoteGeneratedTestProvenance(metadata);
  return uniqueStrings([...baseSkipVars, ...(provenance?.unsafeRenderVars ?? [])]);
}

export function setRemoteGeneratedTestProvenance<T extends Record<string, unknown>>(
  metadata: T,
  provenance: RemoteGeneratedTestProvenance,
): T {
  const unsafeRenderVars = uniqueStrings(provenance.unsafeRenderVars ?? []);
  return {
    ...metadata,
    [REMOTE_GENERATED_TEST_METADATA_KEY]: {
      metadata: uniqueStrings(provenance.metadata),
      vars: uniqueStrings(provenance.vars),
      ...(unsafeRenderVars.length > 0 ? { unsafeRenderVars } : {}),
    },
  } as T;
}

// Remote-origin string values shorter than this are ignored for substring-based
// derivation checks: a 1–3 character remote value would spuriously match freshly minted
// local values, wrongly marking them as remote-derived (the very bug this guards against).
const MIN_REMOTE_DERIVED_SUBSTRING_LENGTH = 4;

function collectRemoteOriginValues(
  provenance: RemoteGeneratedTestProvenance,
  varsBeforeTransform: Record<string, unknown>,
  metadata: Record<string, unknown>,
): unknown[] {
  const values = new Set<unknown>();
  const collect = (value: unknown): void => {
    if (values.has(value)) {
      return;
    }
    values.add(value);
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) {
        collect(child);
      }
    }
  };
  for (const name of provenance.vars) {
    if (Object.prototype.hasOwnProperty.call(varsBeforeTransform, name)) {
      collect(varsBeforeTransform[name]);
    }
  }
  for (const name of provenance.metadata) {
    if (Object.prototype.hasOwnProperty.call(metadata, name)) {
      collect(metadata[name]);
    }
  }
  return [...values];
}

// Preserve copies and embedded remote content without distrusting freshly minted
// local secrets, canaries, and workspace paths used by deterministic verifiers.
function isValueDerivedFromRemoteContent(
  value: unknown,
  remoteOriginValues: unknown[],
  seen = new Set<unknown>(),
): boolean {
  for (const remoteValue of remoteOriginValues) {
    if (deepEqual(value, remoteValue)) {
      return true;
    }
    if (
      typeof value === 'string' &&
      typeof remoteValue === 'string' &&
      remoteValue.length >= MIN_REMOTE_DERIVED_SUBSTRING_LENGTH &&
      value.includes(remoteValue)
    ) {
      return true;
    }
  }
  if (!value || typeof value !== 'object' || seen.has(value)) {
    return false;
  }
  seen.add(value);
  const nestedValues = Array.isArray(value) ? value : Object.values(value);
  return nestedValues.some((nested) =>
    isValueDerivedFromRemoteContent(nested, remoteOriginValues, seen),
  );
}

export function propagateRemoteGeneratedVarProvenance<T extends Record<string, unknown>>(
  metadata: T,
  varNames: string[],
  transformedVars?: {
    metadataBeforeTransform?: Record<string, unknown>;
    varsAfterTransform: Record<string, unknown>;
    varsBeforeTransform: Record<string, unknown>;
  },
): T {
  const provenance = getRemoteGeneratedTestProvenance(metadata);
  if (!provenance || varNames.length === 0) {
    return metadata;
  }

  const remoteOriginValues = transformedVars
    ? collectRemoteOriginValues(
        provenance,
        transformedVars.varsBeforeTransform,
        transformedVars.metadataBeforeTransform ?? metadata,
      )
    : undefined;
  // New render data is skipped conservatively, while fresh local verifier controls
  // stay trusted unless they copy remote content.
  const verifierUntrustedVarNames = transformedVars
    ? varNames.filter((name) =>
        isValueDerivedFromRemoteContent(
          transformedVars.varsAfterTransform[name],
          remoteOriginValues!,
        ),
      )
    : varNames;

  return setRemoteGeneratedTestProvenance(metadata, {
    ...provenance,
    vars: [...provenance.vars, ...verifierUntrustedVarNames],
    unsafeRenderVars: [...(provenance.unsafeRenderVars ?? []), ...varNames],
  });
}

export function trustRemoteGeneratedTestVars<T extends Record<string, unknown>>(
  metadata: T,
  trustedVarNames: string[],
): T {
  const provenance = getRemoteGeneratedTestProvenance(metadata);
  if (!provenance || trustedVarNames.length === 0) {
    return metadata;
  }

  const trusted = new Set(trustedVarNames);
  return setRemoteGeneratedTestProvenance(metadata, {
    ...provenance,
    vars: provenance.vars.filter((name) => !trusted.has(name)),
    unsafeRenderVars: provenance.unsafeRenderVars?.filter((name) => !trusted.has(name)),
  });
}

function toSessionIdString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return safeJsonStringify(value);
  } catch {
    return undefined;
  }
}

export function getSessionId(
  response: ProviderResponse | undefined | null,
  context: Pick<CallApiContextParams, 'vars'> | undefined,
): string | undefined {
  return toSessionIdString(response?.sessionId) ?? toSessionIdString(context?.vars?.sessionId);
}
