import WebSocket from 'ws';
import logger from '../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../types';
import invariant from '../util/invariant';
import { safeJsonStringify } from '../util/json';
import { getNunjucksEngine } from '../util/templates';

const nunjucks = getNunjucksEngine();

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const CONNECTION_TIMEOUT = 5000; // 5 seconds

interface WebSocketProviderConfig {
  messageTemplate: string;
  url?: string;
  timeoutMs?: number; // Document that this defaults to DEFAULT_TIMEOUT
  transformResponse?: string | Function;
  beforeConnect?: string | Function;
  maintainConnectionBetweenCalls?: boolean;
  /**
   * @deprecated
   */
  responseParser?: string | Function;
}

interface WebSocketContext {
  ws?: WebSocket;
  connectionContext?: any;
}

export function createTransformResponse(parser: any): (data: any) => ProviderResponse {
  if (typeof parser === 'function') {
    return parser;
  }
  if (typeof parser === 'string') {
    // Wrap in an IIFE to allow multiple statements
    const fn = new Function(
      'data',
      `
      try {
        const result = (function() {
          ${parser}
        })();
        return result;
      } catch (e) {
        console.error('Transform function error:', e);
        throw e;
      }
    `,
    ) as (data: any) => ProviderResponse;

    // Return a wrapped version that ensures we return a ProviderResponse
    return (data: any) => {
      try {
        const result = fn(data);
        return typeof result === 'string' ? { output: result } : result;
      } catch (e) {
        logger.error(`Transform wrapper error: ${e}`);
        return { error: String(e) };
      }
    };
  }
  return (data) => ({ output: data });
}

export function createBeforeConnect(fn: any): () => Promise<any> {
  if (typeof fn === 'function') {
    logger.debug('Using provided beforeConnect function');
    return fn;
  }
  if (typeof fn === 'string') {
    logger.debug('Creating beforeConnect function from string');

    return async () => {
      try {
        // Execute the string as async code directly
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const asyncFn = new AsyncFunction(
          'fetch',
          `
          ${fn}
        `,
        );
        return await asyncFn(fetch);
      } catch (error) {
        logger.error(`Error in beforeConnect: ${error}`);
        throw error;
      }
    };
  }

  logger.debug('Using default empty beforeConnect function');
  return async () => ({});
}

/**
 * WebSocket provider for making API calls over WebSocket connections.
 *
 * Note: When running with multiple workers, each worker maintains its own WebSocket
 * connections. This means conversation history and connection state is not shared
 * between workers. For multi-turn conversations, it's recommended to run with a
 * single worker or use a different provider type that supports shared state.
 */
export class WebSocketProvider implements ApiProvider {
  url: string;
  config: WebSocketProviderConfig;
  transformResponse: (data: any) => ProviderResponse;
  beforeConnect: () => Promise<any>;
  context: WebSocketContext;

  constructor(url: string, options: ProviderOptions) {
    logger.debug(`Initializing WebSocket provider for ${url}`);
    this.config = options.config as WebSocketProviderConfig;
    this.url = this.config.url || url;
    this.transformResponse = createTransformResponse(
      this.config.transformResponse || this.config.responseParser,
    );
    this.beforeConnect = createBeforeConnect(this.config.beforeConnect);
    this.context = {};

    logger.debug(`WebSocket provider config: ${JSON.stringify(this.config)}`);

    invariant(
      this.config.messageTemplate,
      `Expected WebSocket provider ${this.url} to have a config containing messageTemplate, but got ${safeJsonStringify(
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

  private async closeWebSocket(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.context.ws) {
        resolve();
        return;
      }

      // If already closing or closed, just cleanup state
      if (
        this.context.ws.readyState === WebSocket.CLOSING ||
        this.context.ws.readyState === WebSocket.CLOSED
      ) {
        this.context.ws = undefined;
        this.context.connectionContext = undefined;
        resolve();
        return;
      }

      // For open connections, wait for close
      if (this.context.ws.readyState === WebSocket.OPEN) {
        this.context.ws.once('close', () => {
          this.context.ws = undefined;
          this.context.connectionContext = undefined;
          resolve();
        });
        this.context.ws.close();
      }
    });
  }

  private async withCleanup<T>(
    operation: () => Promise<T>,
    options: {
      ws?: WebSocket;
      shouldCleanup?: boolean;
      forceCleanupOnError?: boolean;
    } = {},
  ): Promise<T> {
    const {
      ws,
      shouldCleanup = !this.config.maintainConnectionBetweenCalls,
      forceCleanupOnError = true,
    } = options;

    try {
      const result = await operation();
      if (shouldCleanup) {
        await this.closeWebSocket();
      }
      return result;
    } catch (error) {
      if (forceCleanupOnError) {
        if (ws) {
          ws.close();
        } else {
          await this.closeWebSocket();
        }
      }
      throw error;
    }
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    logger.debug(`callApi called with prompt: ${prompt}`);

    if (
      this.config.maintainConnectionBetweenCalls &&
      this.context.ws?.readyState === WebSocket.OPEN
    ) {
      logger.debug('Using existing WebSocket connection');
      return this.withCleanup(() => this.sendMessage(prompt, context));
    }

    logger.debug('Creating new WebSocket connection');
    return this.withCleanup(async () => {
      await this.connect();
      return this.sendMessage(prompt, context);
    });
  }

  private async connect(): Promise<void> {
    logger.debug('Starting WebSocket connection');

    try {
      logger.debug('Calling beforeConnect function');
      this.context.connectionContext = await this.beforeConnect();
      logger.debug(`Connection context set to: ${JSON.stringify(this.context.connectionContext)}`);
    } catch (error) {
      logger.error(`Error in beforeConnect: ${error}`);
      throw error; // Propagate the error to prevent connection without context
    }

    return new Promise<void>((resolve, reject) => {
      try {
        logger.debug(`Opening WebSocket connection to ${this.url}`);
        const ws = new WebSocket(this.url);

        ws.onopen = () => {
          logger.debug('WebSocket connection opened successfully');
          this.context.ws = ws;
          resolve();
        };

        ws.onerror = (err) => {
          const errMsg = `WebSocket connection error: ${JSON.stringify(err)}`;
          logger.error(errMsg);
          reject(new Error(errMsg));
        };

        ws.onclose = () => {
          logger.debug('WebSocket connection closed');
          if (this.context.ws === ws) {
            this.context.ws = undefined;
          }
        };

        setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            ws.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, CONNECTION_TIMEOUT);
      } catch (error) {
        logger.error(`Error creating WebSocket: ${error}`);
        reject(error);
      }
    });
  }

  private async sendMessage(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const ws = this.context.ws;
    if (!ws) {
      throw new Error('No WebSocket connection available');
    }

    logger.debug('Building message vars with:');
    logger.debug(`- Context vars: ${JSON.stringify(context?.vars)}`);
    logger.debug(`- Connection context: ${JSON.stringify(this.context.connectionContext)}`);

    const vars = {
      ...(context?.vars || {}),
      prompt,
      conversationId:
        context?.vars?.conversationId || this.context.connectionContext?.conversationId,
      context: this.context.connectionContext,
    };

    logger.debug(`Final template vars: ${JSON.stringify(vars)}`);

    const message = nunjucks.renderString(this.config.messageTemplate, vars);
    logger.debug(`Sending WebSocket message to ${this.url}: ${message}`);

    return this.withCleanup(
      () =>
        new Promise<ProviderResponse>((resolve) => {
          const timeout = setTimeout(() => {
            if (!this.config.maintainConnectionBetweenCalls) {
              ws.close();
            }
            resolve({ error: 'WebSocket request timed out' });
          }, this.config.timeoutMs || DEFAULT_TIMEOUT);

          ws.onmessage = (event) => {
            clearTimeout(timeout);
            try {
              let data = event.data;
              if (typeof data === 'string') {
                try {
                  data = JSON.parse(data);
                } catch {
                  logger.debug('Failed to parse response as JSON');
                }
              }
              const result = this.transformResponse(data);
              if (!this.config.maintainConnectionBetweenCalls) {
                ws.close();
              }
              resolve({ output: result });
            } catch (err) {
              ws.close();
              resolve({ error: `Failed to process response: ${JSON.stringify(err)}` });
            }
          };

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
          } else {
            throw new Error('WebSocket not in OPEN state');
          }
        }),
      { ws: this.context.ws, forceCleanupOnError: true },
    );
  }

  async cleanup(): Promise<void> {
    logger.debug('Cleaning up WebSocket provider');
    await this.closeWebSocket();
  }
}
