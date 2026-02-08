import { OpenAiResponsesProvider } from '../openai/responses';
import { buildOpenClawProviderOptions, DEFAULT_GATEWAY_HOST, DEFAULT_GATEWAY_PORT } from './shared';

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
 *   openclaw:responses       - default agent (main)
 *   openclaw:responses:main  - explicit agent ID
 *   openclaw:responses:X     - custom agent ID
 */
export class OpenClawResponsesProvider extends OpenAiResponsesProvider {
  private agentId: string;

  constructor(agentId: string, providerOptions: ProviderOptions = {}) {
    super(`openclaw:${agentId}`, buildOpenClawProviderOptions(agentId, providerOptions));
    this.agentId = agentId;
  }

  id(): string {
    return `openclaw:responses:${this.agentId}`;
  }

  toString(): string {
    return `[OpenClaw Responses Provider ${this.agentId}]`;
  }

  getApiUrlDefault(): string {
    return `http://${DEFAULT_GATEWAY_HOST}:${DEFAULT_GATEWAY_PORT}/v1`;
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
