import logger from '../../logger';
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
        logger.error('[MCP Provider] Error in response transform function', {
          error: String(error),
          toolName: context.toolName,
        });
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
            ? `return (${trimmedParser})(result, content, context);`
            : `return (${trimmedParser});`,
        );
        const response = await transformFn(result, content, context, getProcessShim());
        return normalizeResponseTransformResult(response);
      } catch (error) {
        logger.error('[MCP Provider] Error in response transform', {
          error: String(error),
          toolName: context.toolName,
        });
        throw new Error(`Failed to transform MCP response: ${String(error)}`);
      }
    };
  }

  throw new Error(
    `Unsupported response transform type: ${typeof parser}. Expected a function, a string starting with 'file://' pointing to a JavaScript file, or a string containing a JavaScript expression.`,
  );
}
