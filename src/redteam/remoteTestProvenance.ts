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
