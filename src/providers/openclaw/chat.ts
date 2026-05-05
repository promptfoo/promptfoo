import { OpenAiChatCompletionProvider } from '../openai/chat';
import {
  buildOpenClawModelName,
  buildOpenClawProviderOptions,
  DEFAULT_GATEWAY_HOST,
  DEFAULT_GATEWAY_PORT,
  normalizeOpenClawAgentId,
  resolveOpenClawBillingModelName,
} from './shared';

import type { ProviderOptions } from '../../types/providers';
import type { OpenAiCompletionOptions } from '../openai/types';

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
    return `openclaw:${this.agentId ?? 'default'}`;
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

  protected getBillingModelName(config: OpenAiCompletionOptions): string {
    return resolveOpenClawBillingModelName(config) || this.modelName;
  }
}
