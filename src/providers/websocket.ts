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

interface WebSocketProviderConfig {
  messageTemplate: string;
  url?: string;
  timeoutMs?: number;
  transformResponse?: string | Function;
  setOrUpdateVars?: string | Function;
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

export function createSetOrUpdateVars(
  fn: any,
): (vars: Record<string, any>) => Promise<Record<string, any>> {
  if (typeof fn === 'function') {
    logger.debug('Using provided setOrUpdateVars function');
    return fn;
  }
  if (typeof fn === 'string') {
    logger.debug('Creating setOrUpdateVars function from string');

    return async (vars: Record<string, any>) => {
      try {
        // Execute the string as async code directly
        const AsyncFunction = Object.getPrototypeOf(async function (
          vars: Record<string, any>,
        ) {}).constructor;
        const asyncFn = new AsyncFunction(
          'fetch',
          'vars',
          `
          ${fn}
        `,
        );
        return await asyncFn(fetch, vars);
      } catch (error) {
        logger.error(`Error in setOrUpdateVars: ${error}`);
        throw error;
      }
    };
  }

  logger.debug('Using default empty setOrUpdateVars function');
  return async () => ({});
}

export class WebSocketProvider implements ApiProvider {
  url: string;
  config: WebSocketProviderConfig;
  transformResponse: (data: any) => ProviderResponse;
  setOrUpdateVars: (
    vars: Record<string, string | object>,
  ) => Promise<Record<string, string | object>>;

  constructor(url: string, options: ProviderOptions) {
    this.config = options.config as WebSocketProviderConfig;
    this.url = this.config.url || url;
    this.transformResponse = createTransformResponse(
      this.config.transformResponse || this.config.responseParser,
    );
    this.setOrUpdateVars = createSetOrUpdateVars(this.config.setOrUpdateVars);
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
    let vars = {
      ...(context?.vars || {}),
    };
    vars.prompt = prompt;
    vars = await this.setOrUpdateVars?.(vars);

    const message = nunjucks.renderString(this.config.messageTemplate, vars);

    logger.debug(`Sending WebSocket message to ${this.url}: ${message}`);

    return new Promise<ProviderResponse>((resolve) => {
      const ws = new WebSocket(this.url);
      const timeout = setTimeout(() => {
        ws.close();
        resolve({ error: 'WebSocket request timed out' });
      }, this.config.timeoutMs || DEFAULT_TIMEOUT);

      ws.onmessage = (event) => {
        clearTimeout(timeout);
        logger.debug(`Received WebSocket response: ${event.data}`);
        try {
          let data = event.data;
          if (typeof data === 'string') {
            try {
              data = JSON.parse(data);
            } catch {
              // If parsing fails, assume it's a text response
            }
          }
          resolve({ output: this.transformResponse(data) });
        } catch (err) {
          resolve({ error: `Failed to process response: ${JSON.stringify(err)}` });
        }
        ws.close();
      };

      ws.onerror = (err) => {
        clearTimeout(timeout);
        resolve({ error: `WebSocket error: ${JSON.stringify(err)}` });
      };

      ws.onopen = () => {
        ws.send(message);
      };
    });
  }
}
