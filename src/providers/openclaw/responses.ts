import { OpenAiResponsesProvider } from '../openai/responses';
import {
  buildOpenClawModelName,
  buildOpenClawProviderOptions,
  DEFAULT_GATEWAY_HOST,
  DEFAULT_GATEWAY_PORT,
  normalizeOpenClawAgentId,
} from './shared';

import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
} from '../../types/providers';

/**
 * OpenClaw Responses API Provider
 *
 * Extends OpenAI Responses API provider with OpenClaw-specific configuration.
 * Routes through the OpenClaw gateway's /v1/responses endpoint.
 *
 * Requires `gateway.http.endpoints.responses.enabled=true` in OpenClaw config.
 *
 * Usage:
 *   openclaw:responses       - configured default agent
 *   openclaw:responses:main  - explicit agent ID
 *   openclaw:responses:X     - custom agent ID
 */
export class OpenClawResponsesProvider extends OpenAiResponsesProvider {
  private agentId: string | undefined;

  constructor(agentId: string | undefined, providerOptions: ProviderOptions = {}) {
    const normalizedAgentId = normalizeOpenClawAgentId(agentId);
    super(
      buildOpenClawModelName(normalizedAgentId),
      buildOpenClawProviderOptions(normalizedAgentId, providerOptions),
    );
    this.agentId = normalizedAgentId;
  }

  id(): string {
    return `openclaw:responses:${this.agentId ?? 'default'}`;
  }

  toString(): string {
    return `[OpenClaw Responses Provider ${this.agentId ?? 'default'}]`;
  }

  getApiUrlDefault(): string {
    return `http://${DEFAULT_GATEWAY_HOST}:${DEFAULT_GATEWAY_PORT}/v1`;
  }

  // Prevent fallback to OPENAI_API_KEY — only use OpenClaw-resolved auth
  getApiKey(): string | undefined {
    return this.config.apiKey;
  }

  // Prevent fallback to OPENAI_API_HOST / OPENAI_BASE_URL
  getApiUrl(): string {
    return this.config.apiBaseUrl || this.getApiUrlDefault();
  }

  async getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ) {
    const result = await super.getOpenAiBody(prompt, context, callApiOptions);
    // OpenClaw's Responses endpoint doesn't support the `text` format parameter
    if ('text' in result.body) {
      delete (result.body as Record<string, unknown>).text;
    }
    return result;
  }
}
