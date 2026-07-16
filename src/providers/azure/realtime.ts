import { OpenAiRealtimeProvider } from '../openai/realtime';
import { providerRegistry } from '../providerRegistry';
import { AzureGenericProvider } from './generic';
import { calculateAzureCost, throwConfigurationError } from './util';

import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../../types/index';
import type { OpenAiRealtimeOptions } from '../openai/realtime';

function getAzureRealtimeBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  if (/\/openai\/v1$/i.test(normalized)) {
    return normalized;
  }
  if (/\/openai$/i.test(normalized)) {
    return `${normalized}/v1`;
  }
  return `${normalized}/openai/v1`;
}

export class AzureRealtimeProvider extends AzureGenericProvider {
  private realtimeProvider?: OpenAiRealtimeProvider;
  private registeredForShutdown = false;

  constructor(deploymentName: string, options: ProviderOptions = {}) {
    super(deploymentName, options);
  }

  override async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    await this.ensureInitialized();

    const baseUrl = this.getApiBaseUrl();
    if (!baseUrl) {
      throwConfigurationError('Azure API host or base URL must be set for realtime deployments.');
    }

    const bearerToken = this.authHeaders?.Authorization?.replace(/^Bearer\s+/i, '');
    const realtimeBaseUrl = getAzureRealtimeBaseUrl(baseUrl);
    const realtimeUrl = new URL(realtimeBaseUrl);
    const realtimeConfig: OpenAiRealtimeOptions = {
      ...(this.config as OpenAiRealtimeOptions),
      apiHost: `${realtimeUrl.host}${realtimeUrl.pathname.replace(/\/v1$/i, '')}`,
      apiBaseUrl: realtimeBaseUrl,
      apiKey: this.getApiKey() ?? bearerToken,
      maintainContext: (this.config as OpenAiRealtimeOptions).maintainContext ?? true,
      headers: {
        ...this.authHeaders,
        ...this.config.headers,
      },
    };

    if (this.realtimeProvider) {
      this.realtimeProvider.config = realtimeConfig;
    } else {
      this.realtimeProvider = new OpenAiRealtimeProvider(this.deploymentName, {
        config: realtimeConfig,
        env: this.env,
      });
    }

    if (!this.registeredForShutdown) {
      providerRegistry.register(this);
      this.registeredForShutdown = true;
    }

    const result = await this.realtimeProvider.callApi(prompt, context, callApiOptions);
    const usage = result.metadata?.usage as any;
    const inputDetails =
      usage?.prompt_tokens_details ?? usage?.input_tokens_details ?? usage?.input_token_details;
    const outputDetails =
      usage?.completion_tokens_details ??
      usage?.output_tokens_details ??
      usage?.output_token_details;

    return {
      ...result,
      cost: calculateAzureCost(
        this.deploymentName,
        this.config,
        usage?.prompt_tokens ?? usage?.input_tokens ?? result.tokenUsage?.prompt,
        usage?.completion_tokens ?? usage?.output_tokens ?? result.tokenUsage?.completion,
        inputDetails?.cached_tokens,
        inputDetails?.audio_tokens,
        outputDetails?.audio_tokens,
      ),
    };
  }

  cleanup(): void {
    this.realtimeProvider?.cleanup();
    if (this.registeredForShutdown) {
      providerRegistry.unregister(this);
      this.registeredForShutdown = false;
    }
  }

  async shutdown(): Promise<void> {
    this.cleanup();
  }
}
