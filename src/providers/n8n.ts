import { fetchWithCache } from '../cache';
import logger from '../logger';
import { REQUEST_TIMEOUT_MS } from './shared';

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/index';

export interface N8nProviderConfig {
  /**
   * The n8n webhook URL to call
   */
  url?: string;

  /**
   * HTTP method to use (default: POST)
   */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH';

  /**
   * Additional headers to include in requests
   */
  headers?: Record<string, string>;

  /**
   * Request body template. Supports Nunjucks templating.
   * Default: { "prompt": "{{prompt}}" }
   */
  body?: Record<string, any> | string;

  /**
   * Transform response to extract the output.
   * Can be a JavaScript expression (e.g., 'json.output') or a function.
   * Default: extracts from common n8n response formats
   */
  transformResponse?: string | ((json: any, text: string) => any);

  /**
   * Request timeout in milliseconds
   */
  timeout?: number;

  /**
   * Session ID header name for multi-turn conversations
   */
  sessionHeader?: string;

  /**
   * Extract session ID from response for multi-turn conversations
   * JavaScript expression to extract session ID from response
   */
  sessionParser?: string;

  /**
   * Field name in request body for session ID
   */
  sessionField?: string;
}

/**
 * Extracts output from common n8n response formats
 */
function extractN8nOutput(data: any): string | any {
  if (!data) {
    return '';
  }

  // String response
  if (typeof data === 'string') {
    return data;
  }

  // Direct output field
  if (data.output !== undefined) {
    return data.output;
  }

  // n8n AI Agent response format
  if (data.response !== undefined) {
    return data.response;
  }

  // n8n workflow output array (common pattern)
  if (Array.isArray(data) && data.length > 0) {
    const firstItem = data[0];
    if (firstItem.output !== undefined) {
      return firstItem.output;
    }
    if (firstItem.response !== undefined) {
      return firstItem.response;
    }
    if (firstItem.text !== undefined) {
      return firstItem.text;
    }
    if (firstItem.message !== undefined) {
      return firstItem.message;
    }
    // Return first item's json if it has one
    if (firstItem.json !== undefined) {
      return extractN8nOutput(firstItem.json);
    }
  }

  // Nested in json field (n8n webhook response pattern)
  if (data.json !== undefined) {
    return extractN8nOutput(data.json);
  }

  // Message content (chat format)
  if (data.message?.content !== undefined) {
    return data.message.content;
  }

  // Text field
  if (data.text !== undefined) {
    return data.text;
  }

  // Content field
  if (data.content !== undefined) {
    return data.content;
  }

  // Return the whole object as JSON if we can't find a specific field
  return data;
}

/**
 * Extracts tool calls from n8n agent responses
 */
function extractToolCalls(data: any): any[] | undefined {
  if (!data) {
    return undefined;
  }

  // Direct tool_calls field
  if (data.tool_calls && Array.isArray(data.tool_calls)) {
    return data.tool_calls;
  }

  // Nested in response
  if (data.response?.tool_calls && Array.isArray(data.response.tool_calls)) {
    return data.response.tool_calls;
  }

  // n8n AI Agent format with actions
  if (data.actions && Array.isArray(data.actions)) {
    return data.actions.map((action: any) => ({
      name: action.tool || action.name || action.action,
      arguments: action.input || action.arguments || action.params,
    }));
  }

  // Array response (check first item)
  if (Array.isArray(data) && data.length > 0) {
    const firstItem = data[0];
    if (firstItem.tool_calls) {
      return firstItem.tool_calls;
    }
    if (firstItem.json?.tool_calls) {
      return firstItem.json.tool_calls;
    }
  }

  return undefined;
}

/**
 * n8n Provider for calling n8n workflows and AI agents
 *
 * Supports:
 * - Calling n8n webhook endpoints
 * - Extracting outputs from various n8n response formats
 * - Handling tool calls from AI agents
 * - Session management for multi-turn conversations
 *
 * @example
 * ```yaml
 * providers:
 *   - id: n8n:https://your-n8n.com/webhook/agent
 *     config:
 *       body:
 *         message: "{{prompt}}"
 *         sessionId: "{{sessionId}}"
 * ```
 */
export class N8nProvider implements ApiProvider {
  private webhookUrl: string;
  config: N8nProviderConfig;
  private providerId: string;
  private currentSessionId?: string;

  constructor(webhookUrl: string, options: ProviderOptions = {}) {
    this.webhookUrl = webhookUrl;
    this.config = (options.config as N8nProviderConfig) || {};
    this.providerId = options.id || `n8n:${webhookUrl}`;

    // Validate URL
    if (!this.webhookUrl && !this.config.url) {
      throw new Error('n8n provider requires a webhook URL');
    }
  }

  id(): string {
    return this.providerId;
  }

  toString(): string {
    return `[n8n Provider ${this.getUrl()}]`;
  }

  private getUrl(): string {
    return this.config.url || this.webhookUrl;
  }

  private buildRequestBody(
    prompt: string,
    context?: CallApiContextParams,
  ): Record<string, any> | string {
    const vars = context?.vars || {};

    // Default body structure
    if (!this.config.body) {
      const body: Record<string, any> = { prompt };

      // Include session ID if available
      const sessionField = this.config.sessionField || 'sessionId';
      if (this.currentSessionId) {
        body[sessionField] = this.currentSessionId;
      } else if (vars.sessionId) {
        body[sessionField] = vars.sessionId;
      }

      return body;
    }

    // Custom body template
    if (typeof this.config.body === 'string') {
      // String template - render with Nunjucks
      const nunjucks = require('nunjucks');
      const rendered = nunjucks.renderString(this.config.body, {
        prompt,
        ...vars,
        sessionId: this.currentSessionId || vars.sessionId,
      });
      try {
        return JSON.parse(rendered);
      } catch {
        return rendered;
      }
    }

    // Object body - render template values
    const nunjucks = require('nunjucks');
    const renderValue = (value: any): any => {
      if (typeof value === 'string') {
        return nunjucks.renderString(value, {
          prompt,
          ...vars,
          sessionId: this.currentSessionId || vars.sessionId,
        });
      }
      if (Array.isArray(value)) {
        return value.map(renderValue);
      }
      if (typeof value === 'object' && value !== null) {
        const result: Record<string, any> = {};
        for (const [k, v] of Object.entries(value)) {
          result[k] = renderValue(v);
        }
        return result;
      }
      return value;
    };

    return renderValue(this.config.body);
  }

  private parseResponse(data: any, text: string): any {
    // Custom transform response
    if (this.config.transformResponse) {
      if (typeof this.config.transformResponse === 'function') {
        return this.config.transformResponse(data, text);
      }

      // String expression (e.g., 'json.output' or 'json.response.text')
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function('json', 'text', `return ${this.config.transformResponse}`);
        return fn(data, text);
      } catch (err) {
        logger.warn(`[n8n] Failed to evaluate transformResponse: ${err}`);
      }
    }

    // Default extraction
    return extractN8nOutput(data);
  }

  private extractSessionId(data: any): string | undefined {
    if (!this.config.sessionParser) {
      // Try common session ID locations
      if (data?.sessionId) {
        return data.sessionId;
      }
      if (data?.session_id) {
        return data.session_id;
      }
      if (data?.conversationId) {
        return data.conversationId;
      }
      if (Array.isArray(data) && data[0]?.sessionId) {
        return data[0].sessionId;
      }
      return undefined;
    }

    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('data', `return ${this.config.sessionParser}`);
      return fn(data);
    } catch (err) {
      logger.warn(`[n8n] Failed to extract session ID: ${err}`);
      return undefined;
    }
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const url = this.getUrl();
    const method = this.config.method || 'POST';
    const timeout = this.config.timeout || REQUEST_TIMEOUT_MS;

    const body = this.buildRequestBody(prompt, context);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    // Add session header if configured
    if (this.config.sessionHeader && this.currentSessionId) {
      headers[this.config.sessionHeader] = this.currentSessionId;
    }

    logger.debug(`[n8n] Calling ${method} ${url}`, {
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

    let data: any;
    let cached = false;
    let latencyMs: number | undefined;

    try {
      const response = await fetchWithCache(
        url,
        {
          method,
          headers,
          body: typeof body === 'string' ? body : JSON.stringify(body),
        },
        timeout,
        'json',
      );

      data = response.data;
      cached = response.cached;
      latencyMs = response.latencyMs;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`[n8n] Request failed: ${errorMessage}`);
      return {
        error: `n8n webhook call error: ${errorMessage}`,
      };
    }

    // Extract session ID for future requests
    const sessionId = this.extractSessionId(data);
    if (sessionId) {
      this.currentSessionId = sessionId;
    }

    // Parse the response
    const output = this.parseResponse(data, JSON.stringify(data));

    // Extract tool calls if present
    const toolCalls = extractToolCalls(data);

    // Build response
    const response: ProviderResponse = {
      output,
      cached,
      latencyMs,
      raw: data,
    };

    // Include tool calls and session in metadata
    if (toolCalls || sessionId) {
      response.metadata = {};
      if (toolCalls) {
        response.metadata.toolCalls = toolCalls;
      }
      if (sessionId) {
        response.sessionId = sessionId;
      }
    }

    logger.debug(`[n8n] Response received`, {
      output:
        typeof output === 'string' ? output.slice(0, 200) : JSON.stringify(output).slice(0, 200),
      cached,
      latencyMs,
      hasToolCalls: !!toolCalls,
    });

    return response;
  }

  /**
   * Get the current session ID (for multi-turn conversations)
   */
  getSessionId(): string {
    return this.currentSessionId ?? '';
  }

  /**
   * Set the session ID (for resuming conversations)
   */
  setSessionId(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  /**
   * Clear the session ID (for starting new conversations)
   */
  clearSession(): void {
    this.currentSessionId = undefined;
  }
}

/**
 * Factory function to create n8n provider
 */
export function createN8nProvider(
  providerPath: string,
  options: ProviderOptions = {},
): N8nProvider {
  // Extract webhook URL from provider path
  // Formats: n8n:https://... or n8n:http://... or n8n (with url in config)
  let webhookUrl = '';

  if (providerPath.startsWith('n8n:')) {
    webhookUrl = providerPath.slice(4); // Remove 'n8n:' prefix
  }

  // If no URL in path, must be in config
  if (!webhookUrl && !options.config?.url) {
    throw new Error(
      'n8n provider requires a webhook URL. Use n8n:https://your-url or provide url in config',
    );
  }

  return new N8nProvider(webhookUrl, options);
}
