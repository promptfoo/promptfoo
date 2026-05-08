import logger from '../../logger';
import { safeJsonStringify } from '../../util/json';
import { getProcessShim } from '../../util/processShim';
import { normalizeResponseTransformResult } from '../transformResult';

import type { ProviderResponse } from '../../types/index';

export interface MCPTransformResponseContext {
  toolName: string;
  toolArgs: Record<string, unknown>;
  originalPayload?: unknown;
}

export function createTransformResponse(
  parser: string | Function | undefined,
): (
  result: unknown,
  content: string,
  context: MCPTransformResponseContext,
) => Promise<ProviderResponse> {
  if (!parser) {
    return async (_result, content) => ({ output: content });
  }

  if (typeof parser === 'function') {
    return async (result, content, context) => {
      try {
        const response = await parser(result, content, context);
        return normalizeResponseTransformResult(response);
      } catch (error) {
        logger.error(
          `[MCP Provider] Error in response transform function: ${String(error)}. Result: ${safeJsonStringify(result)}. Content: ${content}. Context: ${safeJsonStringify(context)}.`,
        );
        throw error;
      }
    };
  }

  if (typeof parser === 'string' && parser.startsWith('file://')) {
    throw new Error(
      `Response transform with file:// reference should be pre-loaded before calling createTransformResponse. This is a bug in the MCP provider implementation.`,
    );
  }

  if (typeof parser === 'string') {
    return async (result, content, context) => {
      try {
        const trimmedParser = parser.trim();
        const isFunctionExpression = /^(async\s+)?(\(.*?\)\s*=>|function\s*\(.*?\))/.test(
          trimmedParser,
        );
        const transformFn = new Function(
          'result',
          'content',
          'context',
          'process',
          isFunctionExpression
            ? `try { return (${trimmedParser})(result, content, context); } catch(e) { throw new Error('Transform failed: ' + e.message + ' : ' + content + ' : ' + JSON.stringify(result) + ' : ' + JSON.stringify(context)); }`
            : `try { return (${trimmedParser}); } catch(e) { throw new Error('Transform failed: ' + e.message + ' : ' + content + ' : ' + JSON.stringify(result) + ' : ' + JSON.stringify(context)); }`,
        );
        const response = await transformFn(result, content, context, getProcessShim());
        return normalizeResponseTransformResult(response);
      } catch (error) {
        logger.error(
          `[MCP Provider] Error in response transform: ${String(error)}. Result: ${safeJsonStringify(result)}. Content: ${content}. Context: ${safeJsonStringify(context)}.`,
        );
        throw new Error(`Failed to transform MCP response: ${String(error)}`);
      }
    };
  }

  throw new Error(
    `Unsupported response transform type: ${typeof parser}. Expected a function, a string starting with 'file://' pointing to a JavaScript file, or a string containing a JavaScript expression.`,
  );
}
