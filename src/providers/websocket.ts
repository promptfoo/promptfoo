import path from 'path';

import WebSocket, { type ClientOptions } from 'ws';
import cliState from '../cliState';
import { importModule } from '../esm';
import logger from '../logger';
import invariant from '../util/invariant';
import { safeJsonStringify } from '../util/json';
import { getProcessShim } from '../util/processShim';
import { getNunjucksEngine } from '../util/templates';
import { getSafeProviderId, sanitizeProviderObject } from './providerLogging';
import { getRequestTimeoutMs } from './shared';
import { normalizeResponseTransformResult } from './transformResult';
import { parseFileTransformReference } from './transformUtils';

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/index';

export const processResult = normalizeResponseTransformResult;

function normalizeWebSocketProtocols(protocols: string | string[] | undefined): string[] {
  if (!protocols) {
    return [];
  }

  const values = Array.isArray(protocols) ? protocols : [protocols];
  return values
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function getSafeWebSocketError(event: WebSocket.ErrorEvent): Error {
  const sourceError = event.error instanceof Error ? event.error : new Error(event.message);
  const sourceCode = (sourceError as NodeJS.ErrnoException).code;
  const isAbortError = ['AbortError', 'AbortException'].includes(sourceError.name);

  if (isAbortError) {
    const error = new Error('WebSocket connection failed');
    error.name = sourceError.name;
    return error;
  }

  const isSafeTransportCode = ['ECONNRESET', 'ECONNREFUSED', 'EPIPE'].includes(sourceCode ?? '');
  const isPermanentProtocolError =
    /wrong version number|self signed|unable to verify|unknown ca|cert|alert protocol version|unsupported protocol/i.test(
      sourceError.message,
    );
  let safeReason: string | undefined;

  if (isSafeTransportCode) {
    safeReason = sourceCode;
  } else if (sourceCode === 'ETIMEDOUT') {
    safeReason = 'TIMEOUT';
  } else if (sourceCode === 'EPROTO' && !isPermanentProtocolError) {
    safeReason = sourceCode;
  } else if (sourceCode === undefined) {
    const status = sourceError.message.match(
      /^Unexpected server response:\s*(429|502|503|504)\b/i,
    )?.[1];

    if (status) {
      safeReason = status;
    } else {
      const transientReason = sourceError.message.match(
        /^(?:(?:read|write|connect)\s+)?(ECONNRESET|ECONNREFUSED|EPROTO)\b|^(socket hang up|(?:SSL routines:\s*)?bad record mac|(?:request\s+)?timeout|network(?: error)?|rate limit|too many requests)\b/i,
      );
      const candidate = (transientReason?.[1] ?? transientReason?.[2])
        ?.toUpperCase()
        .replace(/^(?:REQUEST\s+|SSL ROUTINES:\s*)/, '');

      if (candidate !== 'EPROTO' || !isPermanentProtocolError) {
        safeReason = candidate;
      }
    }
  }

  const status =
    safeReason && /^(?:429|502|503|504)$/.test(safeReason) ? Number(safeReason) : undefined;
  const displayReason = status === undefined ? safeReason : `HTTP ${status}`;
  const error = new Error(
    `WebSocket connection failed${displayReason ? ` (${displayReason})` : ''}`,
  );

  if (isSafeTransportCode) {
    (error as NodeJS.ErrnoException).code = sourceCode;
  } else if (safeReason === 'TIMEOUT' && sourceCode === 'ETIMEDOUT') {
    (error as NodeJS.ErrnoException).code = sourceCode;
  }
  if (status !== undefined) {
    (error as Error & { status: number }).status = status;
  }

  return error;
}

interface WebSocketProviderConfig {
  messageTemplate: string;
  url?: string;

  timeoutMs?: number;
  protocols?: string | string[];
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
    const { filename, functionName } = parseFileTransformReference(transform);
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
  private readonly providerId: string;
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
    this.providerId = getSafeProviderId(this.url);
    this.timeoutMs = this.config.timeoutMs || getRequestTimeoutMs();
    this.transformResponse = createTransformResponse(
      this.config.transformResponse || this.config.responseParser,
    );
    this.streamResponse = this.config.streamResponse
      ? createStreamResponse(this.config.streamResponse)
      : undefined;
    invariant(
      this.config.messageTemplate,
      `Expected WebSocket provider ${this.providerId} to have a config containing {messageTemplate}, but got ${safeJsonStringify(
        sanitizeProviderObject(this.config, 'provider config'),
      )}`,
    );
  }

  id(): string {
    return this.providerId;
  }

  toString(): string {
    return `[WebSocket Provider ${this.providerId}]`;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const vars = {
      ...(context?.vars || {}),
      prompt,
    };
    const nunjucks = getNunjucksEngine(context?.filters);
    const url = nunjucks.renderString(this.url, vars);
    const message = nunjucks.renderString(this.config.messageTemplate, vars);
    const streamResponse = this.streamResponse == null ? undefined : await this.streamResponse;

    logger.debug(`Sending WebSocket message: ${message}`);
    let accumulator: ProviderResponse = { error: 'unknown error occurred' };
    return new Promise<ProviderResponse>((resolve, reject) => {
      const wsOptions: ClientOptions = {};
      const protocols = normalizeWebSocketProtocols(this.config.protocols);
      if (this.config.headers) {
        wsOptions.headers = this.config.headers;
      }
      try {
        new URL(url);
      } catch {
        reject(new Error('Failed to create WebSocket connection'));
        return;
      }
      const ws =
        protocols.length > 0
          ? new WebSocket(url, protocols, wsOptions)
          : new WebSocket(url, wsOptions);
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

      ws.onerror = (event) => {
        clearTimeout(timeout);
        ws.close();
        logger.error(`[WebSocket Provider] Connection failed`);
        reject(getSafeWebSocketError(event));
      };

      ws.onopen = () => {
        logger.debug(`[WebSocket Provider] Message sent: ${safeJsonStringify(message)}`);
        ws.send(message);
      };
    });
  }
}
