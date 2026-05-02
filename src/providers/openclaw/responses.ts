import { calculateObservableOpenAIToolCost, calculateOpenAIUsageCost } from '../openai/billing';
import { OpenAiResponsesProvider } from '../openai/responses';
import {
  buildOpenClawModelName,
  buildOpenClawProviderOptions,
  DEFAULT_GATEWAY_HOST,
  DEFAULT_GATEWAY_PORT,
  resolveOpenClawBillingModelName,
} from './shared';

import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../../types/providers';
import type { OpenAiCompletionOptions } from '../openai/types';

function inferCachedInputTokensFromOpenClawUsage(usage: any): number {
  const explicitCachedTokens = usage?.input_tokens_details?.cached_tokens;
  if (typeof explicitCachedTokens === 'number') {
    return explicitCachedTokens;
  }

  const inputTokens = usage?.input_tokens;
  const outputTokens = usage?.output_tokens;
  const totalTokens = usage?.total_tokens;
  if (
    typeof inputTokens !== 'number' ||
    typeof outputTokens !== 'number' ||
    typeof totalTokens !== 'number'
  ) {
    return 0;
  }

  // OpenClaw's Responses surface currently reports uncached `input_tokens` but includes cache reads
  // in `total_tokens`, so preserve that hidden spend when the gap is unambiguous.
  return Math.max(totalTokens - inputTokens - outputTokens, 0);
}

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
    super(buildOpenClawModelName(agentId), buildOpenClawProviderOptions(agentId, providerOptions));
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

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const result = await super.callApi(prompt, context, callApiOptions);
    const usage = result.raw?.usage;
    const inferredCachedTokens = inferCachedInputTokensFromOpenClawUsage(usage);
    if (inferredCachedTokens <= 0) {
      return result;
    }

    const config = {
      ...this.config,
      ...context?.prompt?.config,
    };
    const billingUsage = {
      ...usage,
      input_tokens: (usage?.input_tokens ?? 0) + inferredCachedTokens,
      input_tokens_details: {
        ...usage?.input_tokens_details,
        cached_tokens: inferredCachedTokens,
      },
    };
    const billingModelName = this.getBillingModelName(config);
    const responseCost = calculateOpenAIUsageCost(billingModelName, config, billingUsage, {
      cachedResponse: result.cached,
      serviceTier:
        (result.raw as { service_tier?: string | null })?.service_tier ?? config.service_tier,
    });
    const observableToolCost = result.cached
      ? 0
      : calculateObservableOpenAIToolCost(result.raw, billingModelName, config);

    return {
      ...result,
      tokenUsage: result.tokenUsage
        ? {
            ...result.tokenUsage,
            prompt: (result.tokenUsage.prompt ?? 0) + inferredCachedTokens,
            cached: inferredCachedTokens,
            completionDetails: {
              ...result.tokenUsage.completionDetails,
              cacheReadInputTokens: inferredCachedTokens,
            },
          }
        : result.tokenUsage,
      ...(responseCost === undefined ? {} : { cost: responseCost + observableToolCost }),
    };
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
