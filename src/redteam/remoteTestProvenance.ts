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
  const values: unknown[] = [];
  for (const name of provenance.vars) {
    if (Object.prototype.hasOwnProperty.call(varsBeforeTransform, name)) {
      values.push(varsBeforeTransform[name]);
    }
  }
  for (const name of provenance.metadata) {
    if (Object.prototype.hasOwnProperty.call(metadata, name)) {
      values.push(metadata[name]);
    }
  }
  return values;
}

/**
 * A transform-produced value is considered remote-derived only when it is an actual copy
 * of remote-origin content: it deep-equals a remote-origin value, or (for strings) embeds
 * a non-trivial remote-origin string. Fresh values minted locally by a `transformVars`
 * (new secrets, canaries, artifact/workspace paths) must NOT be treated as remote-derived,
 * otherwise the coding-agent verifier drops them from its trusted evidence controls and a
 * genuine leak passes unnoticed.
 */
function isValueDerivedFromRemoteContent(value: unknown, remoteOriginValues: unknown[]): boolean {
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
  return false;
}

export function propagateRemoteGeneratedVarProvenance<T extends Record<string, unknown>>(
  metadata: T,
  varNames: string[],
  transformedVars?: {
    varsAfterTransform: Record<string, unknown>;
    varsBeforeTransform: Record<string, unknown>;
  },
): T {
  const provenance = getRemoteGeneratedTestProvenance(metadata);
  if (!provenance || varNames.length === 0) {
    return metadata;
  }

  // Render-skip provenance stays conservative: any variable a local transform produced or
  // mutated may embed a remote-derived template, and skipping local rendering is always the
  // safe direction (the raw value is forwarded to the target verbatim).
  const renderSkipVarNames = varNames;

  // Verifier-trust provenance must stay precise. When we know the pre/post transform vars we
  // can distinguish remote-derived copies from freshly minted local verifier controls; when
  // we do not, fall back to the conservative "mark everything" behavior.
  const verifierUntrustedVarNames = transformedVars
    ? varNames.filter((name) =>
        isValueDerivedFromRemoteContent(
          transformedVars.varsAfterTransform[name],
          collectRemoteOriginValues(provenance, transformedVars.varsBeforeTransform, metadata),
        ),
      )
    : varNames;

  return setRemoteGeneratedTestProvenance(metadata, {
    ...provenance,
    vars: provenance.vars.length > 0 ? [...provenance.vars, ...verifierUntrustedVarNames] : [],
    unsafeRenderVars:
      provenance.unsafeRenderVars && provenance.unsafeRenderVars.length > 0
        ? [...provenance.unsafeRenderVars, ...renderSkipVarNames]
        : undefined,
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
