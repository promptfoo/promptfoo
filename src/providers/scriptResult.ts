import logger from '../logger';
import { scriptInputDigest } from '../util/scriptInputDigest';
import { getScriptCacheVars } from './scriptContext';

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
): [string, ProviderOptions, CallApiContextParams?] {
  return apiType === 'call_api'
    ? [prompt, optionsWithProcessedConfig, sanitizedContext]
    : [prompt, optionsWithProcessedConfig];
}

/** Keep the worker's full context, except correlation IDs generated for this run. */
function scriptCacheContext(context: CallApiContextParams | undefined) {
  if (!context) {
    return context;
  }
  const stable = { ...context };
  const runId = context.vars?.__evalId;
  const vars = getScriptCacheVars(context.vars);
  if (vars) {
    stable.vars = vars;
  }
  if (typeof runId === 'string') {
    if (context.evaluationId === runId) {
      delete stable.evaluationId;
      if (context.test?.metadata?.tracingEnabled === true) {
        delete stable.traceparent;
      }
    }
    const metadata = context.test?.metadata;
    if (context.test && metadata?.tracingEnabled === true && metadata.evaluationId === runId) {
      const { evaluationId: _runId, ...authoredMetadata } = metadata;
      stable.test = { ...context.test, metadata: authoredMetadata };
    }
  }
  return stable;
}

/** Include source identity as well as the options actually delivered to the worker. */
export function getScriptInputDigest(
  path: string,
  functionName: string,
  sourceOptions: ProviderOptions | undefined,
  args: ReturnType<typeof buildScriptArgs>,
) {
  const [prompt, options, context] = args;
  const inputs = args.length === 3 ? [prompt, options, scriptCacheContext(context)] : args;
  return scriptInputDigest({ path, functionName, sourceOptions, inputs });
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
