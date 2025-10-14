import path from 'path';

import WebSocket, { type ClientOptions } from 'ws';
import cliState from '../cliState';
import { importModule } from '../esm';
import logger from '../logger';
import { isJavascriptFile } from '../util/fileExtensions';
import invariant from '../util/invariant';
import { safeJsonStringify } from '../util/json';
import { getNunjucksEngine } from '../util/templates';
import { REQUEST_TIMEOUT_MS } from './shared';

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/index';

const nunjucks = getNunjucksEngine();

export const processResult = (transformedResponse: any): ProviderResponse => {
  if (
    typeof transformedResponse === 'object' &&
    (transformedResponse.output || transformedResponse.error)
  ) {
    return transformedResponse;
  }
  return { output: transformedResponse };
};

interface WebSocketProviderConfig {
  messageTemplate: string;
  url?: string;

  timeoutMs?: number;
  transformResponse?: string | Function;
  streamResponse?: (
    accumulator: ProviderResponse,
    data: any,
    context: CallApiContextParams | undefined,
  ) => [ProviderResponse, boolean];
  headers?: Record<string, string>;
  /**
   * @deprecated
   */
  responseParser?: string | Function;
}

export function createTransformResponse(parser: any): (data: any) => ProviderResponse {
  if (typeof parser === 'function') {
    return parser;
  }
  if (typeof parser === 'string') {
    return new Function('data', `return ${parser}`) as (data: any) => ProviderResponse;
  }
  return (data) => ({ output: data });
}

export async function createStreamResponse(
  transform: string | Function | undefined,
): Promise<
  (
    accumulator: ProviderResponse,
    data: any,
    context: CallApiContextParams | undefined,
  ) => [ProviderResponse, boolean]
> {
  if (!transform) {
    return (_accumulator, data) => [processResult(data), true];
  }

  if (typeof transform === 'function') {
    return (accumulator, data, context) => {
      try {
        // Pass accumulator, data, and context to user-provided function (extra args are safe)
        return (transform as any)(accumulator, data, context);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const wrappedError = new Error(`Error in stream response function: ${errorMessage}`);
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
      return (accumulator, data, context) => {
        try {
          return requiredModule(accumulator, data, context);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          const wrappedError = new Error(
            `Error in stream response function from ${filename}: ${errorMessage}`,
          );
          logger.error(wrappedError.message);
          throw wrappedError;
        }
      };
    }
    throw new Error(
      `stream response malformed: ${filename} must export a function or have a default export as a function`,
    );
  } else if (typeof transform === 'string') {
    return (accumulator, data, context) => {
      try {
        const trimmedTransform = transform.trim();
        // Check if it's a function expression (either arrow or regular)
        const isFunctionExpression = /^(\(.*?\)\s*=>|function\s*\(.*?\))/.test(trimmedTransform);

        let transformFn: Function;
        if (isFunctionExpression) {
          // For function expressions, call them with the arguments
          transformFn = new Function(
            'accumulator',
            'data',
            'context',
            `try { return (${trimmedTransform})(accumulator, data, context); } catch(e) { throw new Error('Stream response failed: ' + e.message) }`,
          );
        } else {
          // Check if it contains a return statement
          const hasReturn = /\breturn\b/.test(trimmedTransform);

          if (hasReturn) {
            // Use as function body if it has return statements
            transformFn = new Function(
              'accumulator',
              'data',
              'context',
              `try { ${trimmedTransform} } catch(e) { throw new Error('Transform failed: ' + e.message); }`,
            );
          } else {
            // Wrap simple expressions with return
            transformFn = new Function(
              'accumulator',
              'data',
              'context',
              `try { return (${trimmedTransform}); } catch(e) { throw new Error('Transform failed: ' + e.message); }`,
            );
          }
        }

        const result: [ProviderResponse, boolean] = transformFn(accumulator, data, context);
        return result;
      } catch (err) {
        logger.error(`[Websocket Provider] Error in stream response: ${String(err)}.`);
        throw new Error(`Failed to transform request: ${String(err)}`);
      }
    };
  }

  throw new Error(
    `Unsupported request transform type: ${typeof transform}. Expected a function, a string starting with 'file://' pointing to a JavaScript file, or a string containing a JavaScript expression.`,
  );
}

export class WebSocketProvider implements ApiProvider {
  url: string;
  config: WebSocketProviderConfig;
  timeoutMs: number;
  transformResponse: (data: any) => ProviderResponse;
  streamResponse?: Promise<
    (
      accumulator: ProviderResponse,
      data: any,
      context: CallApiContextParams | undefined,
    ) => [ProviderResponse, boolean]
  >;

  constructor(url: string, options: ProviderOptions) {
    this.config = options.config as WebSocketProviderConfig;
    this.url = this.config.url || url;
    this.timeoutMs = this.config.timeoutMs || REQUEST_TIMEOUT_MS;
    this.transformResponse = createTransformResponse(
      this.config.transformResponse || this.config.responseParser,
    );
    this.streamResponse = this.config.streamResponse
      ? createStreamResponse(this.config.streamResponse)
      : undefined;
    invariant(
      this.config.messageTemplate,
      `Expected WebSocket provider ${this.url} to have a config containing {messageTemplate}, but got ${safeJsonStringify(
        this.config,
      )}`,
    );
  }

  id(): string {
    return this.url;
  }

  toString(): string {
    return `[WebSocket Provider ${this.url}]`;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const vars = {
      ...(context?.vars || {}),
      prompt,
    };
    const message = nunjucks.renderString(this.config.messageTemplate, vars);
    const streamResponse = this.streamResponse ? await this.streamResponse : undefined;

    logger.debug(`Sending WebSocket message to ${this.url}: ${message}`);
    let accumulator: ProviderResponse = { error: 'unknown error occurred' };
    return new Promise<ProviderResponse>((resolve, reject) => {
      const wsOptions: ClientOptions = {};
      if (this.config.headers) {
        wsOptions.headers = this.config.headers;
      }
      const ws = new WebSocket(this.url, wsOptions);
      const timeout = setTimeout(() => {
        ws.close();
        logger.error(`[WebSocket Provider] Request timed out`);
        reject(new Error(`WebSocket request timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      ws.on('open', () => {
        logger.debug(`[WebSocket Provider]: WebSocket connection opened successfully`);
      });

      ws.onmessage = (event) => {
        clearTimeout(timeout);
        if (streamResponse) {
          try {
            logger.debug(`[WebSocket Provider] Data: ${JSON.stringify(event.data)}`);
          } catch {
            // ignore
          }
          try {
            const [newAccumulator, isComplete] = streamResponse(accumulator, event, context);
            accumulator = newAccumulator;
            if (isComplete) {
              ws.close();
              const response = processResult(accumulator);
              resolve(response);
            }
          } catch (err) {
            logger.debug(
              `[WebSocket Provider]: Error in stream response: ${JSON.stringify((err as Error).message)}`,
            );
            reject(
              new Error(
                `Failed to execute streamResponse function: ${JSON.stringify((err as Error).message)}`,
              ),
            );
          }
        } else {
          try {
            let data = event.data;
            if (typeof data === 'string') {
              try {
                data = JSON.parse(data);
              } catch {
                // If parsing fails, assume it's a text response
              }
              logger.debug(`[WebSocket Provider] Data: ${safeJsonStringify(data)}`);
            }
            try {
              const result = processResult(this.transformResponse(data));

              if (result.error) {
                logger.debug(`[WebSocket Provider]: Error from provider ${result.error}`);
                reject(new Error(result.error));
              } else if (result.output === undefined) {
                reject(new Error('No output from provider'));
              } else {
                resolve(result);
              }
              resolve(result);
            } catch (err) {
              logger.debug(
                `[WebSocket Provider]: Error in transform response: ${(err as Error).message}`,
              );
              reject(
                new Error(`Failed to process response: ${JSON.stringify((err as Error).message)}`),
              );
            }
          } catch (err) {
            reject(
              new Error(`Failed to process response: ${JSON.stringify((err as Error).message)}`),
            );
          } finally {
            ws.close();
          }
        }
      };

      ws.onerror = (err) => {
        clearTimeout(timeout);
        logger.error(`[WebSocket Provider] Error:${JSON.stringify(err)}`);
        reject(new Error(`WebSocket error: ${JSON.stringify(err)}`));
      };

      ws.onopen = () => {
        logger.debug(`[WebSocket Provider] Message sent: ${safeJsonStringify(message)}`);
        ws.send(message);
      };
    });
  }
}
