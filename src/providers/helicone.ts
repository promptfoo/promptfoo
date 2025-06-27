import type { ProviderOptions } from '../types';
import { OpenAiChatCompletionProvider } from './openai/chat';
import type { OpenAiCompletionOptions } from './openai/types';

export interface HeliconeGatewayOptions extends OpenAiCompletionOptions {
  /** Base URL for the Helicone AI Gateway instance (defaults to http://localhost:8080) */
  baseUrl?: string;
  /** Router name for custom routing (optional, uses /ai endpoint if not specified) */
  router?: string;
  /** Model name in provider/model format (e.g., openai/gpt-4o, anthropic/claude-3-5-sonnet) */
  model?: string;
}

/**
 * Helicone AI Gateway provider
 * Routes requests through a self-hosted Helicone AI Gateway instance
 * Uses OpenAI-compatible interface with automatic provider routing
 */
export class HeliconeGatewayProvider extends OpenAiChatCompletionProvider {
  private heliconeConfig: HeliconeGatewayOptions;

  constructor(
    modelName: string,
    options: ProviderOptions & { config?: HeliconeGatewayOptions } = {},
  ) {
    const config = options.config || {};

    // Default base URL to localhost Helicone AI Gateway
    const baseUrl = config.baseUrl || 'http://localhost:8080';

    // Determine endpoint based on router configuration
    let apiBaseUrl: string;
    if (config.router) {
      apiBaseUrl = `${baseUrl}/router/${config.router}`;
    } else {
      apiBaseUrl = `${baseUrl}/ai`;
    }

    // Use the model from config or the provided modelName
    const model = config.model || modelName;

    // Create the modified config for OpenAI provider
    const openAiConfig: OpenAiCompletionOptions = {
      ...config,
      apiBaseUrl,
      // Use placeholder API key since Helicone Gateway handles authentication
      apiKey: config.apiKey || 'placeholder-api-key',
    };

    // Call parent constructor with the model and modified config
    super(model, {
      ...options,
      config: openAiConfig,
    });

    // Store the original Helicone config after super() call
    this.heliconeConfig = config;
  }

  id(): string {
    const router = this.heliconeConfig.router ? `:${this.heliconeConfig.router}` : '';
    return `helicone-gateway${router}:${this.modelName}`;
  }

  toString(): string {
    const baseUrl =
      this.config.apiBaseUrl || this.heliconeConfig.baseUrl || 'http://localhost:8080';
    return `[Helicone AI Gateway ${baseUrl}]`;
  }
}
