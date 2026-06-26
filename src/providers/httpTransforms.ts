import { parse, type Token, tokenizer } from 'acorn';
import logger from '../logger';
import { safeJsonStringify } from '../util/json';
import { getProcessShim } from '../util/processShim';
import { sanitizeObject } from '../util/sanitizer';
import { normalizeResponseTransformResult } from './transformResult';

import type { FetchWithCacheResult } from '../cache';
import type { CallApiContextParams, ProviderResponse } from '../types/index';

const MAX_INLINE_TRANSFORM_LENGTH = 128 * 1024;

function normalizeParserSyntax(code: string): string {
  // Acorn does not yet recognize Node's dynamic source-phase import syntax.
  const replacements: Array<[number, number]> = [];
  const recentTokens: Token[] = [];
  for (const token of tokenizer(code, { ecmaVersion: 'latest' })) {
    recentTokens.push(token);
    if (recentTokens.length > 5) {
      recentTokens.shift();
    }
    if (recentTokens.length < 4) {
      continue;
    }
    const index = recentTokens.length - 4;
    const previousLabel = recentTokens[index - 1]?.type.label;
    if (
      previousLabel !== '.' &&
      previousLabel !== '?.' &&
      recentTokens[index].type.label === 'import' &&
      recentTokens[index + 1].type.label === '.' &&
      code.slice(recentTokens[index + 2].start, recentTokens[index + 2].end) === 'source' &&
      recentTokens[index + 3].type.label === '('
    ) {
      replacements.push([recentTokens[index].start, recentTokens[index + 2].end]);
    }
  }

  let normalized = '';
  let cursor = 0;
  for (const [start, end] of replacements) {
    normalized += `${code.slice(cursor, start)}import`;
    cursor = end;
  }
  return normalized + code.slice(cursor);
}

function parseExpression(code: string) {
  try {
    const source = normalizeParserSyntax(code);
    const program = parse(`function __promptfooTransformContext() { return (${source}\n); }`, {
      ecmaVersion: 'latest',
    });
    const declaration = program.body[0];
    const statement =
      program.body.length === 1 &&
      declaration.type === 'FunctionDeclaration' &&
      declaration.body.body.length === 1 &&
      declaration.body.body[0];
    return statement && statement.type === 'ReturnStatement' ? statement.argument : undefined;
  } catch {
    return undefined;
  }
}

function hasExpressionBeforeTrailingSemicolons(code: string): boolean {
  try {
    let trailingSemicolonStart: number | undefined;
    for (const token of tokenizer(code, { ecmaVersion: 'latest' })) {
      if (token.type.label === ';') {
        trailingSemicolonStart ??= token.start;
      } else {
        trailingSemicolonStart = undefined;
      }
    }
    return (
      trailingSemicolonStart !== undefined &&
      Boolean(parseExpression(code.slice(0, trailingSemicolonStart)))
    );
  } catch {
    return false;
  }
}

function isSupportedFunctionExpression(
  expression: ReturnType<typeof parseExpression>,
  allowAsync: boolean,
): boolean {
  return Boolean(
    expression &&
      ((expression.type === 'ArrowFunctionExpression' && (!expression.async || allowAsync)) ||
        (expression.type === 'FunctionExpression' &&
          expression.id === null &&
          (!expression.async || allowAsync) &&
          !expression.generator)),
  );
}

function getFunctionExpression(code: string, allowAsync = false): string | false | undefined {
  if (code.length > MAX_INLINE_TRANSFORM_LENGTH) {
    throw new Error(
      `Inline HTTP transform exceeds the maximum supported length of ${MAX_INLINE_TRANSFORM_LENGTH} characters`,
    );
  }
  let end = code.length;
  while (end > 0 && code[end - 1] === ';') {
    end--;
  }
  const source = code.slice(0, end);
  if (!source) {
    return undefined;
  }
  const expression = parseExpression(source);
  if (isSupportedFunctionExpression(expression, allowAsync)) {
    return source;
  }
  return expression || hasExpressionBeforeTrailingSemicolons(code) ? false : undefined;
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
    const originalParser = parser.trim();
    const functionExpression = getFunctionExpression(originalParser);
    const parserIsFunction = Boolean(functionExpression);
    const trimmedParser = functionExpression || originalParser;
    return (data, text, context) => {
      try {
        // Add process parameter for ESM compatibility - allows process.mainModule.require to work
        const transformFn = new Function(
          'json',
          'text',
          'context',
          'process',
          parserIsFunction
            ? `try { return (${trimmedParser}\n)(json, text, context); } catch(e) { throw new Error('Transform failed: ' + e.message + ' : ' + text + ' : ' + JSON.stringify(json) + ' : ' + JSON.stringify(context)); }`
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
    const trimmedTransform = transform.trim();
    const functionExpression = getFunctionExpression(trimmedTransform, true);
    const expressionTransform = functionExpression || trimmedTransform;
    return async (prompt, vars, context) => {
      try {
        let transformFn: Function;
        try {
          // Add process parameter for ESM compatibility - allows process.mainModule.require to work
          const functionBody = functionExpression
            ? `try { return (${expressionTransform}\n)(prompt, vars, context); } catch(e) { throw new Error('Transform failed: ' + e.message) }`
            : `try { return (${expressionTransform}); } catch(e) { throw new Error('Transform failed: ' + e.message); }`;
          transformFn = new Function('prompt', 'vars', 'context', 'process', functionBody);
        } catch (error) {
          // Preserve support for raw function bodies while letting valid expressions
          // containing the word "return" compile as expressions first.
          if (
            functionExpression === undefined &&
            error instanceof SyntaxError &&
            /\breturn\b/.test(trimmedTransform)
          ) {
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
