import logger from '../logger';

import type { CallApiContextParams, ProviderOptions } from '../types/index';

export type ScriptApiType = 'call_api' | 'call_embedding_api' | 'call_classification_api';

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
  let propertyName: 'output' | 'embedding' | 'classification';
  let valueDescription: string;
  let receivedDescription: string;
  switch (apiType) {
    case 'call_api': {
      const resultType = result === null ? 'null' : typeof result;
      const resultKeys =
        result && typeof result === 'object' ? Object.keys(result).join(',') : 'none';
      logger.debug(`${language} provider result structure: ${resultType}, keys: ${resultKeys}`);
      if (hasScriptResultProperty(result, 'output')) {
        logger.debug(
          `${language} provider output type: ${typeof result.output}, isArray: ${Array.isArray(result.output)}`,
        );
      }
      propertyName = 'output';
      valueDescription = 'string/object';
      receivedDescription = 'instead got:';
      break;
    }
    case 'call_embedding_api':
      propertyName = 'embedding';
      valueDescription = 'array';
      receivedDescription = 'instead got';
      break;
    case 'call_classification_api':
      propertyName = 'classification';
      valueDescription = 'object';
      receivedDescription = 'instead of';
      break;
    default:
      throw new Error(`Unsupported apiType: ${apiType}`);
  }

  if (!hasScriptResultProperty(result, propertyName) && !hasScriptResultProperty(result, 'error')) {
    const containerName = language === 'Python' ? 'dict' : 'hash';
    throw new Error(
      `The ${language} script \`${functionName}\` function must return a ${containerName} with an own \`${propertyName}\` ${valueDescription} or \`error\` string (inherited prototype properties are rejected), ${receivedDescription} ${JSON.stringify(result)}`,
    );
  }
}
