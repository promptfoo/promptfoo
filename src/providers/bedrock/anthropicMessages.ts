import { buildIsolatedAnthropicClientOptions } from '../anthropic/generic';
import { AnthropicMessagesProvider } from '../anthropic/messages';
import {
  getBedrockMantleOrigin,
  resolveBedrockMantleApiKey,
  resolveBedrockMantleRegion,
} from './mantle';
import { isBedrockRuntimeMessagesModel } from './routing';
import { BedrockTokenProvider } from './tokenProvider';
import type { ClientOptions } from '@anthropic-ai/sdk';

import type { ProviderOptions } from '../../types/providers';

export const DEFAULT_BEDROCK_ANTHROPIC_REGION = 'us-east-1';
const FABLE_MANTLE_REGIONS = new Set(['us-east-1', 'eu-north-1']);

export function getBedrockAnthropicBaseUrl(region: string, useRuntime = false): string {
  // Validate the region before interpolating either host, which receives an API key.
  const mantleOrigin = getBedrockMantleOrigin(region);
  return useRuntime
    ? `https://bedrock-runtime.${region}.amazonaws.com/anthropic`
    : `${mantleOrigin}/anthropic`;
}

export class BedrockAnthropicMessagesProvider extends AnthropicMessagesProvider {
  // Bedrock's Anthropic-compatible endpoint authenticates with an API key via
  // x-api-key resolved for each HTTP request. Never fall back to a local Claude
  // Code OAuth session — that would send an Anthropic OAuth token to the
  // Bedrock host.
  static override readonly SUPPORTS_CLAUDE_CODE_OAUTH = false;

  protected override buildAnthropicClientOptions(options: ClientOptions): ClientOptions {
    const config = this.config;
    const region = resolveBedrockMantleRegion(config, this.env, DEFAULT_BEDROCK_ANTHROPIC_REGION);
    const tokens = new BedrockTokenProvider(config, this.env, region);
    const isolated = buildIsolatedAnthropicClientOptions(options, this.env, undefined);
    const fetch = options.fetch ?? globalThis.fetch;
    return {
      ...isolated,
      // Explicit nulls prevent SDK fallback to Anthropic credentials. The transport below
      // authenticates every HTTP operation, including retries and tool continuations.
      apiKey: null,
      authToken: null,
      defaultHeaders: {
        ...isolated.defaultHeaders,
        'x-api-key': null,
        authorization: null,
      },
      fetch: async (input, init) => {
        const token = await tokens.getToken(init?.signal ?? undefined);
        const headers = new Headers(init?.headers);
        // Ambient headers were suppressed above. Explicit per-request proxy auth still wins.
        if (token && !headers.has('x-api-key') && !headers.has('authorization')) {
          headers.set('x-api-key', token);
        }
        return fetch(input, { ...init, headers });
      },
    };
  }

  getApiKey(): string | undefined {
    return resolveBedrockMantleApiKey(this.config, this.env);
  }

  getApiBaseUrl(): string {
    return (
      this.config.apiBaseUrl ||
      getBedrockAnthropicBaseUrl(
        resolveBedrockMantleRegion(this.config, this.env, DEFAULT_BEDROCK_ANTHROPIC_REGION),
        isBedrockRuntimeMessagesModel(this.modelName),
      )
    );
  }

  requiresApiKey(): boolean {
    return false;
  }

  protected override validateAuthentication(): void {
    // The fetch hook validates AWS credentials at each SDK HTTP attempt, not at construction.
  }

  protected override shouldCacheResponses(): boolean {
    // AWS credentials may rotate to a different principal; we have no stable cache identity.
    return false;
  }

  protected override getGenAISystem(): string {
    return 'bedrock';
  }
}

export function createBedrockAnthropicMessagesProvider(
  modelName: string,
  providerOptions: ProviderOptions & { id?: string } = {},
): BedrockAnthropicMessagesProvider {
  const config: Record<string, any> = providerOptions.config ?? {};
  const region = resolveBedrockMantleRegion(
    config,
    providerOptions.env,
    DEFAULT_BEDROCK_ANTHROPIC_REGION,
  );
  if (!config.apiBaseUrl && modelName === 'anthropic.claude-mythos-5' && region !== 'us-east-1') {
    throw new Error(
      `Amazon Bedrock model "${modelName}" is only available in us-east-1 through the default ` +
        `Anthropic Messages endpoint. Set config.region or AWS_BEDROCK_REGION to us-east-1, ` +
        `or set config.apiBaseUrl for another provisioned endpoint.`,
    );
  }

  // AWS's Fable 5.1 model card lists Mantle only in GovCloud West. Commercial
  // regions use the Runtime Messages endpoint with a US or global inference profile.
  if (
    !config.apiBaseUrl &&
    modelName === 'anthropic.claude-fable-5-1' &&
    region !== 'us-gov-west-1'
  ) {
    throw new Error(
      `Amazon Bedrock model "${modelName}" uses Mantle only in us-gov-west-1. ` +
        `For other regions, use "bedrock:messages:us.${modelName}" or ` +
        `"bedrock:messages:global.${modelName}" with the Runtime Messages endpoint.`,
    );
  }

  if (
    !config.apiBaseUrl &&
    modelName === 'anthropic.claude-fable-5' &&
    !FABLE_MANTLE_REGIONS.has(region)
  ) {
    throw new Error(
      `Amazon Bedrock model "${modelName}" is available through the Anthropic Messages ` +
        `endpoint only in us-east-1 and eu-north-1. Set config.region or ` +
        `AWS_BEDROCK_REGION to a supported region.`,
    );
  }

  const apiBaseUrl =
    config.apiBaseUrl ||
    getBedrockAnthropicBaseUrl(region, isBedrockRuntimeMessagesModel(modelName));

  return new BedrockAnthropicMessagesProvider(modelName, {
    ...providerOptions,
    config: { ...config, apiBaseUrl },
  });
}
