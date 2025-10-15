import path from 'path';

import cliState from '../cliState';
import { importModule } from '../esm';
import logger from '../logger';
import { isJavascriptFile } from '../util/fileExtensions';
import { safeJsonStringify } from '../util/json';
import { sanitizeObject } from '../util/sanitizer';

import type { FetchWithCacheResult } from '../cache';
import type { CallApiContextParams, ProviderResponse } from '../types/index';

export interface TransformResponseContext {
  response: FetchWithCacheResult<any>;
}

// This is in another module so it can be imported by the frontend
// Useful to test these in the UI before running an eval
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
        if (typeof result === 'object') {
          return result;
        } else {
          return { output: result };
        }
      } catch (err) {
        logger.error(
          `[Http Provider] Error in response transform function: ${String(err)}. Data: ${safeJsonStringify(data)}. Text: ${text}. Context: ${safeJsonStringify(context)}.`,
        );
        throw err;
      }
    };
  }
  if (typeof parser === 'string' && parser.startsWith('file://')) {
    let filename = parser.slice('file://'.length);
    let functionName: string | undefined;
    if (filename.includes(':')) {
      const splits = filename.split(':');
      if (splits[0] && isJavascriptFile(splits[0])) {
        [filename, functionName] = splits;
      }
    }
    const requiredModule = await importModule(
      path.resolve(cliState.basePath || '', filename),
      functionName,
    );
    if (typeof requiredModule === 'function') {
      return requiredModule;
    }
    throw new Error(
      `Response transform malformed: ${filename} must export a function or have a default export as a function`,
    );
  } else if (typeof parser === 'string') {
    return (data, text, context) => {
      try {
        const trimmedParser = parser.trim();
        // Check if it's a function expression (either arrow or regular)
        const isFunctionExpression = /^(\(.*?\)\s*=>|function\s*\(.*?\))/.test(trimmedParser);
        const transformFn = new Function(
          'json',
          'text',
          'context',
          isFunctionExpression
            ? `try { return (${trimmedParser})(json, text, context); } catch(e) { throw new Error('Transform failed: ' + e.message + ' : ' + text + ' : ' + JSON.stringify(json) + ' : ' + JSON.stringify(context)); }`
            : `try { return (${trimmedParser}); } catch(e) { throw new Error('Transform failed: ' + e.message + ' : ' + text + ' : ' + JSON.stringify(json) + ' : ' + JSON.stringify(context)); }`,
        );
        let resp: ProviderResponse | string;
        if (context) {
          resp = transformFn(data || null, text, context);
        } else {
          resp = transformFn(data || null, text);
        }

        if (typeof resp === 'string') {
          return { output: resp };
        }
        return resp;
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
    let filename = transform.slice('file://'.length);
    let functionName: string | undefined;
    if (filename.includes(':')) {
      const splits = filename.split(':');
      if (splits[0] && isJavascriptFile(splits[0])) {
        [filename, functionName] = splits;
      }
    }
    const requiredModule = await importModule(
      path.resolve(cliState.basePath || '', filename),
      functionName,
    );
    if (typeof requiredModule === 'function') {
      return async (prompt, vars, context) => {
        try {
          return await requiredModule(prompt, vars, context);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          const wrappedError = new Error(
            `Error in request transform function from ${filename}: ${errorMessage}`,
          );
          logger.error(wrappedError.message);
          throw wrappedError;
        }
      };
    }
    throw new Error(
      `Request transform malformed: ${filename} must export a function or have a default export as a function`,
    );
  } else if (typeof transform === 'string') {
    return async (prompt, vars, context) => {
      try {
        const trimmedTransform = transform.trim();
        // Check if it's a function expression (either arrow or regular)
        const isFunctionExpression = /^(\(.*?\)\s*=>|function\s*\(.*?\))/.test(trimmedTransform);

        let transformFn: Function;
        if (isFunctionExpression) {
          // For function expressions, call them with the arguments
          transformFn = new Function(
            'prompt',
            'vars',
            'context',
            `try { return (${trimmedTransform})(prompt, vars, context); } catch(e) { throw new Error('Transform failed: ' + e.message) }`,
          );
        } else {
          // Check if it contains a return statement
          const hasReturn = /\breturn\b/.test(trimmedTransform);

          if (hasReturn) {
            // Use as function body if it has return statements
            transformFn = new Function(
              'prompt',
              'vars',
              'context',
              `try { ${trimmedTransform} } catch(e) { throw new Error('Transform failed: ' + e.message); }`,
            );
          } else {
            // Wrap simple expressions with return
            transformFn = new Function(
              'prompt',
              'vars',
              'context',
              `try { return (${trimmedTransform}); } catch(e) { throw new Error('Transform failed: ' + e.message); }`,
            );
          }
        }

        let result: any;
        if (context) {
          result = await transformFn(prompt, vars, context);
        } else {
          result = await transformFn(prompt, vars);
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
