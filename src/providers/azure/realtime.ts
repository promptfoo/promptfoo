import { getEnvString } from '../../envars';
import { generateIdFromPrompt } from '../../models/prompt';
import { OpenAiRealtimeProvider } from '../openai/realtime';
import { providerRegistry } from '../providerRegistry';
import { AzureGenericProvider } from './generic';
import { calculateAzureCost, throwConfigurationError } from './util';

import type { EnvVarKey } from '../../envars';
import type { EnvOverrides } from '../../types/env';
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

function hasSameRealtimeConnection(
  current: OpenAiRealtimeOptions,
  next: OpenAiRealtimeOptions,
): boolean {
  if (
    current.apiHost !== next.apiHost ||
    current.apiBaseUrl !== next.apiBaseUrl ||
    current.apiKey !== next.apiKey
  ) {
    return false;
  }

  const currentHeaders = current.headers ?? {};
  const nextHeaders = next.headers ?? {};
  const headerNames = new Set([...Object.keys(currentHeaders), ...Object.keys(nextHeaders)]);
  return [...headerNames].every((name) => currentHeaders[name] === nextHeaders[name]);
}

export class AzureRealtimeProvider extends AzureGenericProvider {
  private readonly realtimeProviders = new Map<string, OpenAiRealtimeProvider>();
  private nextStatelessProviderId = 0;
  private registeredForShutdown = false;

  constructor(deploymentName: string, options: ProviderOptions = {}) {
    super(deploymentName, options);
  }

  override async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const promptConfig = context?.prompt?.config as
      | (OpenAiRealtimeOptions & { apiKeyEnvar?: string })
      | undefined;
    const effectiveConfig = {
      ...this.config,
      ...promptConfig,
    } as OpenAiRealtimeOptions & { apiKeyEnvar?: string };
    const promptApiKey =
      promptConfig?.apiKey ??
      (promptConfig?.apiKeyEnvar
        ? (getEnvString(promptConfig.apiKeyEnvar as EnvVarKey) ??
          this.env?.[promptConfig.apiKeyEnvar as keyof EnvOverrides])
        : undefined);
    const effectiveApiKey = promptApiKey ?? this.getApiKey();

    if (promptApiKey) {
      await this.ensureInitialized().catch(() => undefined);
    } else {
      await this.ensureInitialized();
    }

    const promptHost = promptConfig?.apiHost?.replace(/\/+$/, '');
    const configuredHost = effectiveConfig.apiHost?.replace(/\/+$/, '');
    const baseUrl =
      promptConfig?.apiBaseUrl?.replace(/\/+$/, '') ??
      (promptHost
        ? /^https?:\/\//i.test(promptHost)
          ? promptHost
          : `https://${promptHost}`
        : undefined) ??
      effectiveConfig.apiBaseUrl?.replace(/\/+$/, '') ??
      (configuredHost
        ? /^https?:\/\//i.test(configuredHost)
          ? configuredHost
          : `https://${configuredHost}`
        : this.getApiBaseUrl());
    if (!baseUrl) {
      throwConfigurationError('Azure API host or base URL must be set for realtime deployments.');
    }

    const bearerToken = this.authHeaders?.Authorization?.replace(/^Bearer\s+/i, '');
    const inheritedAuthHeaders = effectiveApiKey
      ? Object.fromEntries(
          Object.entries(this.authHeaders ?? {}).filter(
            ([key]) => key.toLowerCase() !== 'authorization' && key.toLowerCase() !== 'api-key',
          ),
        )
      : this.authHeaders;
    const realtimeBaseUrl = getAzureRealtimeBaseUrl(baseUrl);
    const realtimeUrl = new URL(realtimeBaseUrl);
    const conversationId = context?.test?.metadata?.conversationId;
    const hasConversationId =
      typeof conversationId === 'string' || typeof conversationId === 'number';
    const realtimeConfig: OpenAiRealtimeOptions = {
      ...effectiveConfig,
      apiHost:
        realtimeUrl.protocol === 'https:'
          ? `${realtimeUrl.host}${realtimeUrl.pathname.replace(/\/v1$/i, '')}`
          : undefined,
      apiBaseUrl: realtimeBaseUrl,
      apiKey: effectiveApiKey ?? bearerToken,
      maintainContext: hasConversationId && (effectiveConfig.maintainContext ?? true),
      headers: {
        ...inheritedAuthHeaders,
        ...effectiveConfig.headers,
        ...(effectiveApiKey ? { 'api-key': effectiveApiKey } : {}),
      },
    };

    const promptId = context?.prompt ? generateIdFromPrompt(context.prompt) : 'default';
    const realtimeProviderKey = hasConversationId
      ? `prompt:${promptId}:conversation:${conversationId}`
      : `stateless:${++this.nextStatelessProviderId}`;
    let realtimeProvider = this.realtimeProviders.get(realtimeProviderKey);

    if (realtimeProvider && !hasSameRealtimeConnection(realtimeProvider.config, realtimeConfig)) {
      realtimeProvider.cleanup();
      this.realtimeProviders.delete(realtimeProviderKey);
      realtimeProvider = undefined;
    }

    if (realtimeProvider) {
      realtimeProvider.config = realtimeConfig;
    } else {
      realtimeProvider = new OpenAiRealtimeProvider(this.deploymentName, {
        config: realtimeConfig,
        env: this.env,
      });
      this.realtimeProviders.set(realtimeProviderKey, realtimeProvider);
    }

    if (!this.registeredForShutdown) {
      providerRegistry.register(this);
      this.registeredForShutdown = true;
    }

    const delegatedProvider = realtimeProvider;
    const result = await delegatedProvider.callApi(prompt, context, callApiOptions).finally(() => {
      if (!hasConversationId) {
        delegatedProvider.cleanup();
        this.realtimeProviders.delete(realtimeProviderKey);
      }
    });
    const reportedUsageEvents = result.metadata?.usageEvents;
    const usageEvents: any[] =
      Array.isArray(reportedUsageEvents) && reportedUsageEvents.length > 0
        ? reportedUsageEvents
        : result.metadata?.usage
          ? [result.metadata.usage]
          : [];
    const costForUsageEvents = usageEvents.reduce<number | undefined>((total, usage) => {
      const inputDetails =
        usage?.prompt_tokens_details ?? usage?.input_tokens_details ?? usage?.input_token_details;
      const outputDetails =
        usage?.completion_tokens_details ??
        usage?.output_tokens_details ??
        usage?.output_token_details;
      const usageCost = calculateAzureCost(
        this.deploymentName,
        effectiveConfig,
        usage?.prompt_tokens ?? usage?.input_tokens,
        usage?.completion_tokens ?? usage?.output_tokens,
        inputDetails?.cached_tokens,
        inputDetails?.audio_tokens,
        outputDetails?.audio_tokens,
        inputDetails?.image_tokens,
        inputDetails?.cached_tokens_details?.audio_tokens,
        inputDetails?.cached_tokens_details?.image_tokens,
        outputDetails?.image_tokens,
      );

      return typeof total === 'number' && typeof usageCost === 'number'
        ? total + usageCost
        : undefined;
    }, 0);
    const cost =
      usageEvents.length > 0
        ? costForUsageEvents
        : calculateAzureCost(
            this.deploymentName,
            effectiveConfig,
            result.tokenUsage?.prompt,
            result.tokenUsage?.completion,
          );
    const tokenUsage =
      usageEvents.length > 0
        ? {
            ...result.tokenUsage,
            prompt: usageEvents.reduce(
              (total, usage) => total + (usage?.prompt_tokens ?? usage?.input_tokens ?? 0),
              0,
            ),
            completion: usageEvents.reduce(
              (total, usage) => total + (usage?.completion_tokens ?? usage?.output_tokens ?? 0),
              0,
            ),
            total: usageEvents.reduce(
              (total, usage) =>
                total +
                (usage?.total_tokens ??
                  (usage?.prompt_tokens ?? usage?.input_tokens ?? 0) +
                    (usage?.completion_tokens ?? usage?.output_tokens ?? 0)),
              0,
            ),
            cached: usageEvents.reduce((total, usage) => {
              const inputDetails =
                usage?.prompt_tokens_details ??
                usage?.input_tokens_details ??
                usage?.input_token_details;
              return total + (inputDetails?.cached_tokens ?? 0);
            }, 0),
            numRequests: usageEvents.length,
          }
        : result.tokenUsage;

    return {
      ...result,
      tokenUsage,
      cost,
    };
  }

  cleanup(): void {
    for (const realtimeProvider of this.realtimeProviders.values()) {
      realtimeProvider.cleanup();
    }
    this.realtimeProviders.clear();
    if (this.registeredForShutdown) {
      providerRegistry.unregister(this);
      this.registeredForShutdown = false;
    }
  }

  async shutdown(): Promise<void> {
    this.cleanup();
  }
}
