import { OpenAiEmbeddingProvider } from '../openai/embedding';
import {
  buildOpenClawModelName,
  buildOpenClawProviderOptions,
  DEFAULT_GATEWAY_HOST,
  DEFAULT_GATEWAY_PORT,
} from './shared';

import type { ProviderOptions } from '../../types/providers';

/**
 * OpenClaw embedding provider extends the OpenAI-compatible embeddings provider.
 *
 * The OpenClaw gateway accepts agent-target model ids at /v1/embeddings and
 * optionally accepts x-openclaw-model as the backend embedding-model override.
 */
export class OpenClawEmbeddingProvider extends OpenAiEmbeddingProvider {
  private agentId: string;

  constructor(agentId: string, providerOptions: ProviderOptions = {}) {
    super(buildOpenClawModelName(agentId), buildOpenClawProviderOptions(agentId, providerOptions));
    this.agentId = agentId;
  }

  id(): string {
    return `openclaw:embedding:${this.agentId}`;
  }

  toString(): string {
    return `[OpenClaw Embedding Provider ${this.agentId}]`;
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
