import logger from '../logger';
import { safeJsonStringify } from '../util/json';
import { getProcessShim } from '../util/processShim';
import { sanitizeObject } from '../util/sanitizer';
import { normalizeResponseTransformResult } from './transformResult';

import type { FetchWithCacheResult } from '../cache';
import type { CallApiContextParams, ProviderResponse } from '../types/index';

const FUNCTION_EXPRESSION_PATTERN = /^(?:(?:\(.*?\)|[$A-Z_a-z][$\w]*)\s*=>|function\s*\(.*?\))/;
const ASYNC_FUNCTION_EXPRESSION_PATTERN = /^async(?:[ \t]*\(.*?\)|[ \t]+[$A-Z_a-z][$\w]*)\s*=>/;

function stripTrailingSemicolons(code: string): string {
  return code.replace(/;+\s*$/, '');
}

function isFunctionExpression(code: string, allowAsync = false): boolean {
  return (
    FUNCTION_EXPRESSION_PATTERN.test(code) ||
    (allowAsync && ASYNC_FUNCTION_EXPRESSION_PATTERN.test(code))
  );
}

export interface TransformResponseContext {
  response: FetchWithCacheResult<any>;
}

// This is in another module so it can be imported by the frontend
// Useful to test these in the UI before running an eval
// Note: file:// references should be pre-loaded using loadTransformModule
// before being passed to this function. This is because we can't use importModule in the frontend.
export async function createTransformResponse(
  parser: string | Function | undefined,
): Promise<(data: any, text: string, context?: TransformResponseContext) => ProviderResponse> {
  if (!parser) {
    return (data, text) => ({ output: data || text });
  }

  if (typeof parser === 'function') {
    return (data, text, context) => {
      try {
        const result = parser(data, text, context);
        return normalizeResponseTransformResult(result);
      } catch (err) {
        logger.error(
          `[Http Provider] Error in response transform function: ${String(err)}. Data: ${safeJsonStringify(data)}. Text: ${text}. Context: ${safeJsonStringify(context)}.`,
        );
        throw err;
      }
    };
  }
  if (typeof parser === 'string' && parser.startsWith('file://')) {
    // This should have been pre-loaded using loadTransformModule
    throw new Error(
      `Response transform with file:// reference should be pre-loaded before calling createTransformResponse. This is a bug in the HTTP provider implementation.`,
    );
  } else if (typeof parser === 'string') {
    return (data, text, context) => {
      try {
        const originalParser = parser.trim();
        const parserIsFunction = isFunctionExpression(originalParser);
        const trimmedParser = parserIsFunction
          ? stripTrailingSemicolons(originalParser)
          : originalParser;
        // Add process parameter for ESM compatibility - allows process.mainModule.require to work
        const transformFn = new Function(
          'json',
          'text',
          'context',
          'process',
          parserIsFunction
            ? `try { return (${trimmedParser})(json, text, context); } catch(e) { throw new Error('Transform failed: ' + e.message + ' : ' + text + ' : ' + JSON.stringify(json) + ' : ' + JSON.stringify(context)); }`
            : `try { return (${trimmedParser}); } catch(e) { throw new Error('Transform failed: ' + e.message + ' : ' + text + ' : ' + JSON.stringify(json) + ' : ' + JSON.stringify(context)); }`,
        );
        let resp: ProviderResponse | string;
        const processShim = getProcessShim();
        if (context) {
          resp = transformFn(data || null, text, context, processShim);
        } else {
          resp = transformFn(data || null, text, undefined, processShim);
        }

        return normalizeResponseTransformResult(resp);
      } catch (err) {
        logger.error(
          `[Http Provider] Error in response transform: ${String(err)}. Data: ${safeJsonStringify(data)}. Text: ${text}. Context: ${safeJsonStringify(context)}.`,
        );
        throw new Error(`Failed to transform response: ${String(err)}`);
      }
    };
  }
  throw new Error(
    `Unsupported response transform type: ${typeof parser}. Expected a function, a string starting with 'file://' pointing to a JavaScript file, or a string containing a JavaScript expression.`,
  );
}

export async function createTransformRequest(
  transform: string | Function | undefined,
): Promise<(prompt: string, vars: Record<string, any>, context?: CallApiContextParams) => any> {
  if (!transform) {
    return (prompt) => prompt;
  }

  if (typeof transform === 'function') {
    return async (prompt, vars, context) => {
      try {
        // Pass prompt, vars, and context to user-provided function (extra args are safe)
        return await (transform as any)(prompt, vars, context);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const wrappedError = new Error(`Error in request transform function: ${errorMessage}`);
        logger.error(wrappedError.message);
        throw wrappedError;
      }
    };
  }

  if (typeof transform === 'string' && transform.startsWith('file://')) {
    // This should have been pre-loaded using loadTransformModule
    throw new Error(
      `Request transform with file:// reference should be pre-loaded before calling createTransformRequest. This is a bug in the HTTP provider implementation.`,
    );
  } else if (typeof transform === 'string') {
    return async (prompt, vars, context) => {
      try {
        const trimmedTransform = transform.trim();
        const transformIsFunction = isFunctionExpression(trimmedTransform, true);
        const expressionTransform = transformIsFunction
          ? stripTrailingSemicolons(trimmedTransform)
          : trimmedTransform;

        let transformFn: Function;
        try {
          // Add process parameter for ESM compatibility - allows process.mainModule.require to work
          transformFn = transformIsFunction
            ? new Function(
                'prompt',
                'vars',
                'context',
                'process',
                `try { return (${expressionTransform})(prompt, vars, context); } catch(e) { throw new Error('Transform failed: ' + e.message) }`,
              )
            : new Function(
                'prompt',
                'vars',
                'context',
                'process',
                `try { return (${expressionTransform}); } catch(e) { throw new Error('Transform failed: ' + e.message); }`,
              );
        } catch (error) {
          // Preserve support for raw function bodies while letting valid expressions
          // containing the word "return" compile as expressions first.
          if (error instanceof SyntaxError && /\breturn\b/.test(trimmedTransform)) {
            transformFn = new Function(
              'prompt',
              'vars',
              'context',
              'process',
              `try { ${trimmedTransform} } catch(e) { throw new Error('Transform failed: ' + e.message); }`,
            );
          } else {
            throw error;
          }
        }

        let result: any;
        const processShim = getProcessShim();
        if (context) {
          result = await transformFn(prompt, vars, context, processShim);
        } else {
          result = await transformFn(prompt, vars, undefined, processShim);
        }
        return result;
      } catch (err) {
        logger.error(
          `[Http Provider] Error in request transform: ${String(err)}. Prompt: ${prompt}. Vars: ${safeJsonStringify(vars)}. Context: ${safeJsonStringify(sanitizeObject(context, { context: 'request transform' }))}.`,
        );
        throw new Error(`Failed to transform request: ${String(err)}`);
      }
    };
  }

  throw new Error(
    `Unsupported request transform type: ${typeof transform}. Expected a function, a string starting with 'file://' pointing to a JavaScript file, or a string containing a JavaScript expression.`,
  );
}
