import { getRemoteGenerationUrl } from './remoteGeneration';

import type { VarValue } from '../types';
import type { Inputs } from '../types/shared';
import type { MaterializedInputMetadata, MaterializedInputVariablesResult } from './inputVariables';

export const REMOTE_MATERIALIZATION_CONTEXT_VAR = '__promptfooRemoteMaterialization';

export interface RemoteMaterializationRequestContext {
  injectVar?: string;
  inputs?: Inputs;
  materializationIndex?: number;
  pluginId?: string;
  purpose?: string;
}

export interface RemoteMaterializationResponse {
  inputMaterialization?: Record<string, unknown>;
  materializationHandled?: boolean;
  materializedVars?: Record<string, string>;
}

export function buildRemoteMaterializedInputVariables(
  response: RemoteMaterializationResponse,
  fallbackVars: Record<string, string>,
): MaterializedInputVariablesResult {
  return {
    ...(response.inputMaterialization
      ? {
          metadata: response.inputMaterialization as Record<string, MaterializedInputMetadata>,
        }
      : {}),
    vars: response.materializedVars ?? fallbackVars,
  };
}

function getRemoteMaterializationHost(): string {
  const remoteUrl = getRemoteGenerationUrl();
  try {
    const url = new URL(remoteUrl);
    return url.origin;
  } catch {
    return remoteUrl;
  }
}

export function buildRemoteMaterializationContextVars(
  context: RemoteMaterializationRequestContext,
): Record<string, VarValue> {
  return {
    [REMOTE_MATERIALIZATION_CONTEXT_VAR]: context,
  };
}

export function getRemoteMaterializationContextFromVars(
  vars: Record<string, VarValue> | undefined,
): RemoteMaterializationRequestContext | undefined {
  const raw = vars?.[REMOTE_MATERIALIZATION_CONTEXT_VAR];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  return raw as RemoteMaterializationRequestContext;
}

export function requiresRemoteMaterialization(inputs: Inputs | undefined): boolean {
  return Boolean(inputs && Object.keys(inputs).length > 0);
}

export function getRemoteMaterializationUpgradeError(operation: string): string {
  return (
    `${operation} requires remote multi-input materialization support from a newer Promptfoo server. ` +
    `Current remote endpoint: ${getRemoteMaterializationHost()}. ` +
    'Upgrade the Promptfoo server you are connected to and try again.'
  );
}

export function isRemoteMaterializationUpgradeError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('requires remote multi-input materialization support from a newer')
  );
}

export function assertRemoteMaterializationHandled(
  response: RemoteMaterializationResponse | undefined,
  operation: string,
): void {
  if (response?.materializationHandled === true) {
    return;
  }
  throw new Error(getRemoteMaterializationUpgradeError(operation));
}
