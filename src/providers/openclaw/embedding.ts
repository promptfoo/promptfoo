import { OpenAiEmbeddingProvider } from '../openai/embedding';
import {
  buildOpenClawModelName,
  buildOpenClawProviderOptions,
  DEFAULT_GATEWAY_HOST,
  DEFAULT_GATEWAY_PORT,
  normalizeOpenClawAgentId,
} from './shared';

import type { ProviderOptions } from '../../types/providers';

/**
 * OpenClaw embedding provider extends the OpenAI-compatible embeddings provider.
 *
 * The OpenClaw gateway accepts agent-target model ids at /v1/embeddings and
 * optionally accepts x-openclaw-model as the backend embedding-model override.
 */
export class OpenClawEmbeddingProvider extends OpenAiEmbeddingProvider {
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
    return `openclaw:embedding:${this.agentId ?? 'default'}`;
  }

  toString(): string {
    return `[OpenClaw Embedding Provider ${this.agentId ?? 'default'}]`;
  }

  getApiUrlDefault(): string {
    return `http://${DEFAULT_GATEWAY_HOST}:${DEFAULT_GATEWAY_PORT}/v1`;
  }

  // Prevent fallback to OPENAI_API_KEY — only use OpenClaw-resolved auth.
  getApiKey(): string | undefined {
    return this.config.apiKey;
  }

  // Prevent fallback to OPENAI_API_HOST / OPENAI_BASE_URL.
  getApiUrl(): string {
    return this.config.apiBaseUrl || this.getApiUrlDefault();
  }
}
