import logger from '../logger';

import type { CallApiContextParams, ProviderOptions } from '../types/index';

/**
 * Keys on `CallApiContextParams` that cannot be sent to a subprocess script
 * provider (Python, Ruby, etc.) because they are either non-serializable or
 * contain circular references (e.g., Timeout handles inside `logger`,
 * functions inside `filters`, or `ApiProvider` instances with methods).
 *
 * This list is the single source of truth for script-provider sanitization;
 * adding a new non-serializable field to `CallApiContextParams` requires only
 * a single update here so every script provider stays in lockstep.
 */
const NON_SERIALIZABLE_CONTEXT_KEYS = [
  'getCache',
  'logger',
  'filters',
  'originalProvider',
] as const satisfies readonly (keyof CallApiContextParams)[];

/**
 * Returns a shallow-cloned copy of `context` with non-serializable keys
 * removed. The caller's `context` is never mutated so wrappers that reuse
 * the same object across turns (e.g., redteam multi-turn strategies) are
 * safe. Logs the stripped keys at debug level for traceability when script
 * authors are investigating "missing filters/logger in my script" reports.
 *
 * @param providerLabel - Label used in debug logs (e.g., `"PythonProvider"`).
 * @param context - Caller-owned context, possibly `undefined`.
 * @returns A sanitized clone, or `undefined` if `context` was `undefined`.
 */
export function sanitizeScriptContext(
  providerLabel: string,
  context: CallApiContextParams | undefined,
): CallApiContextParams | undefined {
  if (!context) {
    return undefined;
  }

  const sanitizedContext = { ...context };
  const stripped: string[] = [];
  for (const key of NON_SERIALIZABLE_CONTEXT_KEYS) {
    if (key in sanitizedContext) {
      stripped.push(key);
      delete sanitizedContext[key];
    }
  }

  if (stripped.length > 0) {
    logger.debug(
      `${providerLabel} sanitized context: stripped non-serializable keys [${stripped.join(', ')}]`,
    );
  }

  return sanitizedContext;
}

export function hasScriptResultProperty(
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
  // Must stay consistent with the validators' own-property checks:
  // loosening this to `'error' in result` without also loosening validation
  // would let a script return an error on the prototype chain, pass validation
  // via an own `output`, and then be cached as a successful result — a
  // cache-poisoning vector.
  return (
    hasScriptResultProperty(result, 'error') &&
    result.error !== null &&
    result.error !== undefined &&
    result.error !== ''
  );
}

export function buildScriptArgs(
  apiType: 'call_api' | 'call_embedding_api' | 'call_classification_api',
  prompt: string,
  optionsWithProcessedConfig: ProviderOptions,
  sanitizedContext: CallApiContextParams | undefined,
) {
  return apiType === 'call_api'
    ? [prompt, optionsWithProcessedConfig, sanitizedContext]
    : [prompt, optionsWithProcessedConfig];
}

export function validateScriptResult(
  language: 'Python' | 'Ruby',
  apiType: 'call_api' | 'call_embedding_api' | 'call_classification_api',
  functionName: string,
  result: any,
): void {
  let property: 'output' | 'embedding' | 'classification';
  let expectedType: string;
  let errorPhrase: string;
  switch (apiType) {
    case 'call_api': {
      // Log result structure for debugging
      const resultType = result === null ? 'null' : typeof result;
      const resultKeys =
        result && typeof result === 'object' ? Object.keys(result).join(',') : 'none';
      logger.debug(`${language} provider result structure: ${resultType}, keys: ${resultKeys}`);
      if (hasScriptResultProperty(result, 'output')) {
        logger.debug(
          `${language} provider output type: ${typeof result.output}, isArray: ${Array.isArray(result.output)}`,
        );
      }
      property = 'output';
      expectedType = 'string/object';
      errorPhrase = 'got:';
      break;
    }
    case 'call_embedding_api':
      property = 'embedding';
      expectedType = 'array';
      errorPhrase = 'got';
      break;
    case 'call_classification_api':
      property = 'classification';
      expectedType = 'object';
      errorPhrase = 'of';
      break;
    default:
      throw new Error(`Unsupported apiType: ${apiType}`);
  }

  if (!hasScriptResultProperty(result, property) && !hasScriptResultProperty(result, 'error')) {
    throw new Error(
      `The ${language} script \`${functionName}\` function must return a ${language === 'Python' ? 'dict' : 'hash'} with an own \`${property}\` ${expectedType} or \`error\` string (inherited prototype properties are rejected), instead ${errorPhrase} ${JSON.stringify(
        result,
      )}`,
    );
  }
}
