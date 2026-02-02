import path from 'path';

import WebSocket, { type ClientOptions } from 'ws';
import cliState from '../cliState';
import { importModule } from '../esm';
import logger from '../logger';
import { type TargetSpanContext, withTargetSpan } from '../tracing/targetTracer';
import { isJavascriptFile } from '../util/fileExtensions';
import invariant from '../util/invariant';
import { safeJsonStringify } from '../util/json';
import { getProcessShim } from '../util/processShim';
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
    // Add process parameter for ESM compatibility - allows process.mainModule.require to work
    const fn = new Function('data', 'process', `return ${parser}`) as (
      data: any,
      process: typeof globalThis.process,
    ) => ProviderResponse;
    return (data) => fn(data, getProcessShim());
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
      const trimmedTransform = transform.trim();
      // Check if it's a function expression (either arrow or regular)
      const isFunctionExpression = /^(\(.*?\)\s*=>|function\s*\(.*?\))/.test(trimmedTransform);

      let transformFn: Function;
      // Add process parameter for ESM compatibility - allows process.mainModule.require to work
      if (isFunctionExpression) {
        // For function expressions, call them with the arguments
        transformFn = new Function(
          'accumulator',
          'data',
          'context',
          'process',
          `try { return (${trimmedTransform})(accumulator, data, context); } catch(e) { throw new Error('Error executing streamResponse function: ' + e.message) }`,
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
            'process',
            `try { ${trimmedTransform} } catch(e) { throw new Error('Error executing streamResponse function: ' + e.message); }`,
          );
        } else {
          // Wrap simple expressions with return
          transformFn = new Function(
            'accumulator',
            'data',
            'context',
            'process',
            `try { return (${trimmedTransform}); } catch(e) { throw new Error('Error executing streamResponse function: ' + e.message); }`,
          );
        }
      }

      const result: [ProviderResponse, boolean] = transformFn(
        accumulator,
        data,
        context,
        getProcessShim(),
      );
      return result;
    };
  }

  throw new Error(
    `Unsupported request transform type: ${typeof transform}. Expected a function, a string starting with 'file://' pointing to a JavaScript file, or a string containing a JavaScript expression.`,
  );
}

export class WebSocketProvider implements ApiProvider {
  url: string;
  config: WebSocketProviderConfig;
  label?: string;
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
    this.label = options.label;
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
    // Set up tracing context for target span
    const spanContext: TargetSpanContext = {
      targetType: 'websocket',
      url: this.url,
      providerId: this.id(),
      label: this.label,
      // W3C Trace Context for linking to evaluation trace
      traceparent: context?.traceparent,
      // Promptfoo context from test case if available
      promptLabel: context?.prompt?.label,
      evalId: context?.evaluationId || context?.test?.metadata?.evaluationId,
      testIndex: context?.test?.vars?.__testIdx as number | undefined,
      iteration: context?.iteration,
    };

    return withTargetSpan(spanContext, () => this.callApiInternal(prompt, context));
  }

  private async callApiInternal(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const vars = {
      ...(context?.vars || {}),
      prompt,
    };
    const message = nunjucks.renderString(this.config.messageTemplate, vars);
    const streamResponse = this.streamResponse != null ? await this.streamResponse : undefined;

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
            logger.debug(`[WebSocket Provider] Data Received: ${JSON.stringify(event.data)}`);
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
            logger.debug(`[WebSocket Provider]: ${(err as Error).message}`);
            ws.close();
            reject(new Error(`Error executing streamResponse function: ${(err as Error).message}`));
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
              logger.debug(`[WebSocket Provider] Data Received: ${safeJsonStringify(data)}`);
            }
            try {
              const result = processResult(this.transformResponse(data));

              if (result.error) {
                logger.debug(`[WebSocket Provider]: Error from provider ${result.error}`);
                ws.close();
                reject(new Error(result.error));
              } else if (result.output === undefined) {
                ws.close();
                reject(new Error('No output from provider'));
              }
              ws.close();
              resolve(result);
            } catch (err) {
              logger.debug(
                `[WebSocket Provider]: Error in transform response: ${(err as Error).message}`,
              );
              ws.close();
              reject(new Error(`Failed to process response: ${(err as Error).message}`));
            }
          } catch (err) {
            logger.debug(
              `[WebSocket Provider]: Error processing response: ${(err as Error).message}`,
            );
            ws.close();
            reject(new Error(`Failed to process response: ${(err as Error).message}`));
          }
        }
      };

      ws.onerror = (err) => {
        clearTimeout(timeout);
        ws.close();
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
