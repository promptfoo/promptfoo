import { OpenAiChatCompletionProvider } from '../openai/chat';
import {
  buildOpenClawHeaders,
  buildOpenClawModelName,
  buildOpenClawProviderOptions,
  DEFAULT_GATEWAY_HOST,
  DEFAULT_GATEWAY_PORT,
  normalizeOpenClawAgentId,
  resolveOpenClawBillingModelName,
} from './shared';

import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
} from '../../types/providers';
import type { OpenAiCompletionOptions } from '../openai/types';
import type { OpenClawConfig } from './types';

/**
 * OpenClaw chat provider extends OpenAI chat completion provider.
 *
 * OpenClaw exposes an OpenAI-compatible HTTP API at /v1/chat/completions.
 * This provider auto-detects gateway URL and bearer auth from:
 *   1. Explicit config (gateway_url, auth_token, auth_password)
 *   2. Environment variables (OPENCLAW_GATEWAY_URL, OPENCLAW_GATEWAY_TOKEN, OPENCLAW_GATEWAY_PASSWORD)
 *   3. The active OpenClaw config file (OPENCLAW_CONFIG_PATH or ~/.openclaw/openclaw.json),
 *      including gateway.remote.url and gateway.tls.enabled
 *
 * Usage:
 *   openclaw              - configured default agent
 *   openclaw:main         - specific agent
 *   openclaw:coding-agent - named agent
 */
export class OpenClawChatProvider extends OpenAiChatCompletionProvider {
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
    return this.agentId ? `openclaw:${this.agentId}` : 'openclaw';
  }

  toString(): string {
    return `[OpenClaw Provider ${this.agentId ?? 'default'}]`;
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
    return {
      ...result,
      body: {
        ...result.body,
        model: this.modelName,
      },
      config: {
        ...result.config,
        headers: buildOpenClawHeaders(this.agentId, result.config as OpenClawConfig),
      },
    };
  }

  protected getBillingModelName(config: OpenAiCompletionOptions): string {
    return resolveOpenClawBillingModelName(config) || this.modelName;
  }
}
