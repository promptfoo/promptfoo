import WebSocket, { type ClientOptions } from 'ws';
import path from 'path';
import cliState from '../cliState';
import { importModule } from '../esm';
import logger from '../logger';
import { isJavascriptFile } from '../util/fileExtensions';
import invariant from '../util/invariant';
import { safeJsonStringify } from '../util/json';
import { getNunjucksEngine } from '../util/templates';

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/index';

const nunjucks = getNunjucksEngine();

/**
 * Context passed to transformStream function
 */
interface StreamContext {
  /** All messages received so far in the stream */
  messages: any[];
  /** The current/latest message */
  message: any;
}

/**
 * Result from transformStream function
 */
interface StreamTransformResult {
  /** Set to true when streaming is complete */
  done?: boolean;
  /** The accumulated output (optional, can be set on any message) */
  output?: string;
  /** Error message if streaming failed */
  error?: string;
}

interface WebSocketProviderConfig {
  messageTemplate: string;
  url?: string;
  timeoutMs?: number;
  transformResponse?: string | Function;
  headers?: Record<string, string>;
  /**
   * Custom function to process streaming messages and determine when streaming is complete.
   * This provides maximum flexibility for handling any streaming format.
   *
   * The function receives a context object with:
   * - messages: array of all messages received so far
   * - message: the current message
   *
   * Return an object with:
   * - done: true when streaming is complete
   * - output: the accumulated response (can be built incrementally)
   * - error: error message if something went wrong
   *
   * Example:
   * ```js
   * (context) => {
   *   const { message, messages } = context;
   *   if (message.type === 'done') {
   *     return { done: true, output: messages.map(m => m.delta).join('') };
   *   }
   *   return {};
   * }
   * ```
   */
  transformStream?: string | Function;
  /**
   * @deprecated Use transformStream instead for more flexibility
   */
  stream?: boolean;
  /**
   * @deprecated Use transformStream instead
   */
  streamDeltaField?: string;
  /**
   * @deprecated Use transformStream instead
   */
  streamDoneType?: string;
  /**
   * @deprecated Use transformStream instead
   */
  streamChunkType?: string;
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

/**
 * Creates a stream transform function from various input types
 */
export async function createTransformStream(
  transform: string | Function | undefined,
): Promise<(context: StreamContext) => StreamTransformResult> {
  // No transform provided - use simple legacy mode
  if (!transform) {
    return (context) => {
      const { message } = context;
      // Simple heuristic: if message has 'done' or 'complete' type, we're done
      const isDone =
        typeof message === 'object' &&
        (message.type === 'done' ||
          message.type === 'complete' ||
          message.type === 'finished' ||
          message.done === true);

      return isDone ? { done: true, output: message.content || message.text } : {};
    };
  }

  // Function transform
  if (typeof transform === 'function') {
    return (context: StreamContext) => {
      try {
        return transform(context) || {};
      } catch (err) {
        logger.error(`[WebSocket Provider] Error in transformStream function: ${String(err)}`);
        return { error: `Stream transform error: ${String(err)}` };
      }
    };
  }

  // File-based transform
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
      return requiredModule;
    }
    throw new Error(
      `Stream transform malformed: ${filename} must export a function or have a default export as a function`,
    );
  }

  // String expression transform
  if (typeof transform === 'string') {
    return (context: StreamContext) => {
      try {
        const trimmedTransform = transform.trim();
        // Check if it's a function expression
        const isFunctionExpression = /^(\(.*?\)\s*=>|function\s*\(.*?\))/.test(trimmedTransform);

        const transformFn = new Function(
          'context',
          isFunctionExpression
            ? `try { return (${trimmedTransform})(context); } catch(e) { throw new Error('Stream transform failed: ' + e.message); }`
            : `try { return (${trimmedTransform}); } catch(e) { throw new Error('Stream transform failed: ' + e.message); }`,
        );

        const result = transformFn(context);
        return result || {};
      } catch (err) {
        logger.error(
          `[WebSocket Provider] Error in transformStream expression: ${String(err)}. Context: ${safeJsonStringify(context)}`,
        );
        return { error: `Stream transform error: ${String(err)}` };
      }
    };
  }

  throw new Error(
    `Unsupported stream transform type: ${typeof transform}. Expected a function, a string starting with 'file://', or a string containing a JavaScript expression.`,
  );
}

export class WebSocketProvider implements ApiProvider {
  url: string;
  config: WebSocketProviderConfig;
  transformResponse: (data: any) => ProviderResponse;
  private transformStreamPromise: Promise<(context: StreamContext) => StreamTransformResult>;

  constructor(url: string, options: ProviderOptions) {
    this.config = options.config as WebSocketProviderConfig;
    // Normalize websocket:// protocol to ws://
    let normalizedUrl = (this.config.url || url).replace(/^websocket:\/\//, 'ws://');
    this.url = normalizedUrl;
    this.transformResponse = createTransformResponse(
      this.config.transformResponse || this.config.responseParser,
    );
    this.transformStreamPromise = createTransformStream(this.config.transformStream);
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

    logger.debug(`Sending WebSocket message to ${this.url}: ${message}`);

    // Get the stream transform function
    const transformStream = await this.transformStreamPromise;

    // Check if we should use legacy streaming mode (for backward compatibility)
    const useLegacyStreaming =
      this.config.stream === true && !this.config.transformStream;
    const streamDeltaField = this.config.streamDeltaField ?? 'delta';
    const streamDoneType = this.config.streamDoneType ?? 'done';
    const streamChunkType = this.config.streamChunkType ?? 'chunk';

    return new Promise<ProviderResponse>((resolve) => {
      const wsOptions: ClientOptions = {};
      if (this.config.headers) {
        wsOptions.headers = this.config.headers;
      }
      const ws = new WebSocket(this.url, wsOptions);
      const timeout = setTimeout(() => {
        ws.close();
        resolve({ error: 'WebSocket request timed out' });
      }, this.config.timeoutMs || 10000);

      // Collect all messages for the stream transform
      const messages: any[] = [];

      ws.onmessage = (event) => {
        logger.debug(`Received WebSocket message: ${event.data}`);
        try {
          let data: any = event.data;
          if (typeof data === 'string') {
            try {
              data = JSON.parse(data);
            } catch {
              // If parsing fails, keep as string
            }
          }

          messages.push(data);

          // Use transformStream if provided
          if (this.config.transformStream || !useLegacyStreaming) {
            const result = transformStream({ messages, message: data });

            if (result.error) {
              clearTimeout(timeout);
              resolve({ error: result.error });
              ws.close();
              return;
            }

            if (result.done) {
              clearTimeout(timeout);
              const output = result.output || this.transformResponse(data);
              resolve({ output });
              ws.close();
              return;
            }
            // Continue listening for more messages
            return;
          }

          // Legacy streaming mode (backward compatibility)
          if (useLegacyStreaming) {
            const messageType = typeof data === 'object' && data !== null ? data.type : undefined;

            if (messageType === streamDoneType || messageType === 'complete') {
              clearTimeout(timeout);
              // Accumulate chunks from all messages
              const chunks = messages
                .filter((m) => m.type === streamChunkType && m[streamDeltaField])
                .map((m) => m[streamDeltaField]);
              const accumulated = chunks.join('');
              const finalContent = data.content || accumulated || data;
              resolve({ output: this.transformResponse(finalContent) });
              ws.close();
              return;
            }

            if (messageType === 'error') {
              clearTimeout(timeout);
              resolve({ error: data.error || 'Unknown error occurred' });
              ws.close();
              return;
            }

            // Ignore other message types in streaming mode (like 'connected', chunks, etc.)
            return;
          }

          // Non-streaming mode - return first substantive message
          if (typeof data === 'object' && data.type === 'connected') {
            // Ignore connection messages
            return;
          }
          clearTimeout(timeout);
          resolve({ output: this.transformResponse(data) });
          ws.close();
        } catch (err) {
          clearTimeout(timeout);
          resolve({ error: `Failed to process response: ${JSON.stringify(err)}` });
          ws.close();
        }
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
