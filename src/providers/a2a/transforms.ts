import logger from '../../logger';
import { safeJsonStringify } from '../../util/json';
import { getProcessShim } from '../../util/processShim';
import { normalizeResponseTransformResult } from '../transformResult';

import type { ProviderResponse } from '../../types/index';
import type { A2AFinalResponse } from './types';

export interface A2ATransformResponseContext {
  events: unknown[];
  message?: unknown;
  mode: 'send' | 'stream';
  raw: unknown;
  task?: unknown;
}

export function createTransformResponse(
  parser: string | Function | undefined,
): (
  json: A2AFinalResponse,
  text: string,
  context: A2ATransformResponseContext,
) => Promise<ProviderResponse> {
  if (!parser) {
    return async (_json, text) => ({ output: text });
  }

  if (typeof parser === 'function') {
    return async (json, text, context) => {
      try {
        return normalizeResponseTransformResult(await parser(json, text, context));
      } catch (error) {
        logger.error(
          `[A2A Provider] Error in response transform function: ${String(error)}. JSON: ${safeJsonStringify(
            json,
          )}. Text: ${text}. Context: ${safeJsonStringify(context)}.`,
        );
        throw error;
      }
    };
  }

  if (typeof parser === 'string' && parser.startsWith('file://')) {
    throw new Error(
      'Response transform with file:// reference should be pre-loaded before calling createTransformResponse.',
    );
  }

  if (typeof parser === 'string') {
    return async (json, text, context) => {
      try {
        const trimmedParser = parser.trim();
        const isFunctionExpression = /^(async\s+)?(\(.*?\)\s*=>|function\s*\(.*?\))/.test(
          trimmedParser,
        );
        const transformFn = new Function(
          'json',
          'text',
          'context',
          'process',
          'result',
          isFunctionExpression
            ? `return (${trimmedParser})(json, text, context);`
            : `return (${trimmedParser});`,
        );
        return normalizeResponseTransformResult(
          await transformFn(json, text, context, getProcessShim(), json),
        );
      } catch (error) {
        logger.error(
          `[A2A Provider] Error in response transform: ${String(error)}. JSON: ${safeJsonStringify(
            json,
          )}. Text: ${text}. Context: ${safeJsonStringify(context)}.`,
        );
        throw new Error(`Failed to transform A2A response: ${String(error)}`);
      }
    };
  }

  throw new Error(
    `Unsupported response transform type: ${typeof parser}. Expected a function, file:// reference, or JavaScript expression.`,
  );
}
