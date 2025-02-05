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

interface WebSocketProviderConfig {
  messageTemplate: string;
  url?: string;
  timeoutMs?: number;
  transformResponse?: string | Function;
  beforeConnect?: string | Function;
  prepareRequest?: string | Function;
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
        console.log('Transform function returning:', result);
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
    logger.warn('createBeforeConnect: Using provided function');
    return fn;
  }
  if (typeof fn === 'string') {
    logger.warn('createBeforeConnect: Creating function from string');
    logger.debug(`beforeConnect function string: ${fn}`);

    // Create a function that uses the global fetch API
    return async () => {
      try {
        const response = await fetch('http://localhost:4000/conversation');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        logger.warn(`beforeConnect returning: ${data}`);
        return data;
      } catch (error) {
        logger.error(`Error in beforeConnect: ${error}`);
        return {};
      }
    };
  }
  logger.warn('createBeforeConnect: Using default empty function');
  return async () => ({});
}

export function createPrepareRequest(fn: any): (prompt: string, context: any) => string {
  if (typeof fn === 'function') {
    return fn;
  }
  if (typeof fn === 'string') {
    return new Function('prompt', 'context', `return ${fn}`) as (
      prompt: string,
      context: any,
    ) => string;
  }
  return (prompt) => prompt;
}

export class WebSocketProvider implements ApiProvider {
  url: string;
  config: WebSocketProviderConfig;
  transformResponse: (data: any) => ProviderResponse;
  beforeConnect: () => Promise<any>;
  prepareRequest: (prompt: string, context: any) => string;
  context: WebSocketContext;

  constructor(url: string, options: ProviderOptions) {
    logger.warn(`Initializing WebSocket provider for ${url}`);
    this.config = options.config as WebSocketProviderConfig;
    this.url = this.config.url || url;
    this.transformResponse = createTransformResponse(
      this.config.transformResponse || this.config.responseParser,
    );
    this.beforeConnect = createBeforeConnect(this.config.beforeConnect);
    this.prepareRequest = createPrepareRequest(this.config.prepareRequest);
    this.context = {};

    logger.warn(`WebSocket provider config: ${JSON.stringify(this.config)}`);

    invariant(
      this.config.messageTemplate || this.config.prepareRequest,
      `Expected WebSocket provider ${this.url} to have a config containing either {messageTemplate} or {prepareRequest}, but got ${safeJsonStringify(
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

  private cleanup() {
    logger.warn('Cleaning up WebSocket provider');
    if (this.context.ws) {
      if (this.context.ws.readyState === WebSocket.OPEN) {
        logger.warn('Closing WebSocket connection');
        this.context.ws.close();
      }
      this.context.ws = undefined;
      this.context.connectionContext = undefined;
    }
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    logger.warn(`callApi called with prompt: ${prompt}`);
    try {
      // If we're maintaining connections and already have one, use it
      if (
        this.config.maintainConnectionBetweenCalls &&
        this.context.ws?.readyState === WebSocket.OPEN
      ) {
        logger.warn('Using existing WebSocket connection');
        return await this.sendMessage(prompt, context);
      }

      // Otherwise, create a new connection
      logger.warn('Creating new WebSocket connection');
      await this.connect();
      const result = await this.sendMessage(prompt, context);

      // Clean up if we're not maintaining connections
      if (!this.config.maintainConnectionBetweenCalls) {
        this.cleanup();
      }

      return result;
    } catch (error) {
      // Always cleanup on error
      this.cleanup();
      throw error;
    }
  }

  private async connect(): Promise<void> {
    logger.warn('Starting WebSocket connection');

    try {
      // Run beforeConnect hook if provided
      logger.warn('Calling beforeConnect function');
      this.context.connectionContext = await this.beforeConnect();
      logger.warn(`beforeConnect returned: ${JSON.stringify(this.context.connectionContext)}`);
    } catch (error) {
      logger.error(`Error in beforeConnect: ${error}`);
      // Continue with connection attempt even if beforeConnect fails
    }

    return new Promise<void>((resolve, reject) => {
      try {
        logger.warn(`Opening WebSocket connection to ${this.url}`);
        const ws = new WebSocket(this.url);

        ws.onopen = () => {
          logger.warn('WebSocket connection opened successfully');
          this.context.ws = ws;
          resolve();
        };

        ws.onerror = (err) => {
          const errMsg = `WebSocket connection error: ${JSON.stringify(err)}`;
          logger.error(errMsg);
          reject(new Error(errMsg));
        };

        ws.onclose = () => {
          logger.warn('WebSocket connection closed');
          if (this.context.ws === ws) {
            this.context.ws = undefined;
          }
        };

        // Add timeout for connection attempt
        setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            ws.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, 5000); // 5 second timeout
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

    // Debug the connection context
    logger.warn(`Connection context: ${JSON.stringify(this.context.connectionContext)}`);

    const vars = {
      ...(context?.vars || {}),
      prompt,
      context: this.context.connectionContext, // Simplified - just use the connection context directly
    };

    // Debug the template variables
    logger.warn(`Template vars: ${JSON.stringify(vars)}`);

    const message = nunjucks.renderString(this.config.messageTemplate, vars);

    logger.warn(`Sending WebSocket message to ${this.url}: ${message}`);

    return new Promise<ProviderResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.config.maintainConnectionBetweenCalls) {
          this.cleanup();
        }
        resolve({ error: 'WebSocket request timed out' });
      }, this.config.timeoutMs || 30000);

      ws.onmessage = (event) => {
        clearTimeout(timeout);
        logger.warn(`Received WebSocket response raw: ${event.data}`);
        try {
          let data = event.data;
          if (typeof data === 'string') {
            try {
              data = JSON.parse(data);
              logger.warn(`Parsed WebSocket data: ${JSON.stringify(data)}`);
            } catch {
              logger.warn('Failed to parse response as JSON');
            }
          }
          // Pass the parsed data to transform
          const result = this.transformResponse(data);
          logger.warn(`Transform result: ${JSON.stringify(result)}`);

          if (!this.config.maintainConnectionBetweenCalls) {
            this.cleanup();
          }

          resolve({ output: result });
        } catch (err) {
          logger.error(`Failed to process response: ${err}`);
          this.cleanup();
          resolve({ error: `Failed to process response: ${JSON.stringify(err)}` });
        }
      };

      ws.onerror = (err) => {
        clearTimeout(timeout);
        logger.error(`WebSocket error during message: ${JSON.stringify(err)}`);
        this.cleanup();
        reject(new Error(`WebSocket error: ${JSON.stringify(err)}`));
      };

      ws.send(message);
    });
  }
}
