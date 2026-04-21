import { OpenAiChatCompletionProvider } from '../openai/chat';
import {
  buildOpenClawModelName,
  buildOpenClawProviderOptions,
  DEFAULT_GATEWAY_HOST,
  DEFAULT_GATEWAY_PORT,
} from './shared';

import type { ProviderOptions } from '../../types/providers';

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
 *   openclaw              - default agent (main)
 *   openclaw:main         - specific agent
 *   openclaw:coding-agent - named agent
 */
export class OpenClawChatProvider extends OpenAiChatCompletionProvider {
  private agentId: string;

  constructor(agentId: string, providerOptions: ProviderOptions = {}) {
    super(buildOpenClawModelName(agentId), buildOpenClawProviderOptions(agentId, providerOptions));
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
