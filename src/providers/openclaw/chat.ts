import { OpenAiChatCompletionProvider } from '../openai/chat';
import { buildOpenClawProviderOptions, DEFAULT_GATEWAY_HOST, DEFAULT_GATEWAY_PORT } from './shared';

import type { ProviderOptions } from '../../types/providers';

/**
 * OpenClaw chat provider extends OpenAI chat completion provider.
 *
 * OpenClaw exposes an OpenAI-compatible HTTP API at /v1/chat/completions.
 * This provider auto-detects gateway URL and auth token from:
 *   1. Explicit config (gateway_url, auth_token)
 *   2. Environment variables (OPENCLAW_GATEWAY_URL, OPENCLAW_GATEWAY_TOKEN)
 *   3. ~/.openclaw/openclaw.json
 *
 * Usage:
 *   openclaw              - default agent (main)
 *   openclaw:main         - specific agent
 *   openclaw:coding-agent - named agent
 */
export class OpenClawChatProvider extends OpenAiChatCompletionProvider {
  private agentId: string;

  constructor(agentId: string, providerOptions: ProviderOptions = {}) {
    super(`openclaw:${agentId}`, buildOpenClawProviderOptions(agentId, providerOptions));
    this.agentId = agentId;
  }

  id(): string {
    return `openclaw:${this.agentId}`;
  }

  toString(): string {
    return `[OpenClaw Provider ${this.agentId}]`;
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
}
