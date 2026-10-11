import logger from '../logger';

import type { CallApiContextParams, ProviderOptions } from '../types/providers';

const RESULT_FIELDS = {
  call_api: 'output',
  call_embedding_api: 'embedding',
  call_classification_api: 'classification',
} as const;

export type ScriptApiType = keyof typeof RESULT_FIELDS;

export function buildScriptArgs(
  apiType: ScriptApiType,
  prompt: string,
  optionsWithProcessedConfig: ProviderOptions,
  sanitizedContext: CallApiContextParams | undefined,
) {
  return apiType === 'call_api'
    ? [prompt, optionsWithProcessedConfig, sanitizedContext]
    : [prompt, optionsWithProcessedConfig];
}

function hasScriptResultProperty(
  result: any,
  propertyName: 'output' | 'error' | 'embedding' | 'classification',
): boolean {
  return (
    Boolean(result) &&
    typeof result === 'object' &&
    Object.prototype.hasOwnProperty.call(result, propertyName)
  );
}

export function hasScriptResultError(result: any): boolean {
  // Match validation's own-property check so prototype errors cannot change
  // whether a script result is considered successful and eligible for caching.
  return (
    hasScriptResultProperty(result, 'error') &&
    result.error !== null &&
    result.error !== undefined &&
    result.error !== ''
  );
}

export function applyCachedCallApiMetadata(
  apiType: ScriptApiType,
  parsedResult: any,
  language: 'Python' | 'Ruby',
) {
  if (apiType !== 'call_api' || typeof parsedResult !== 'object' || parsedResult === null) {
    return parsedResult;
  }

  logger.debug(`${language}Provider setting cached=true for cached ${apiType} result`);
  parsedResult.cached = true;

  if (parsedResult.tokenUsage) {
    const total = parsedResult.tokenUsage.total || 0;
    parsedResult.tokenUsage = {
      cached: total,
      total,
      numRequests: parsedResult.tokenUsage.numRequests ?? 1,
    };
    logger.debug(
      `Updated token usage for cached result: ${JSON.stringify(parsedResult.tokenUsage)}`,
    );
  }

  return parsedResult;
}

export function validateScriptResult(
  apiType: ScriptApiType,
  functionName: string,
  result: any,
  language: 'Python' | 'Ruby',
): void {
  const propertyName = RESULT_FIELDS[apiType];
  if (!propertyName) {
    throw new Error(`Unsupported apiType: ${apiType}`);
  }

  if (apiType === 'call_api') {
    const resultType = result === null ? 'null' : typeof result;
    const resultKeys =
      result && typeof result === 'object' ? Object.keys(result).join(',') : 'none';
    logger.debug(`${language} provider result structure: ${resultType}, keys: ${resultKeys}`);
    if (hasScriptResultProperty(result, 'output')) {
      logger.debug(
        `${language} provider output type: ${typeof result.output}, isArray: ${Array.isArray(result.output)}`,
      );
    }
  }

  if (!hasScriptResultProperty(result, propertyName) && !hasScriptResultProperty(result, 'error')) {
    const containerName = language === 'Python' ? 'dict' : 'hash';
    throw new Error(
      `The ${language} script \`${functionName}\` function must return a ${containerName} with an own \`${propertyName}\` or \`error\` property (inherited prototype properties are rejected), instead got: ${JSON.stringify(result)}`,
    );
  }
}
