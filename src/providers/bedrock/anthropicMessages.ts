import Anthropic from '@anthropic-ai/sdk';
import { getEnvString } from '../../envars';
import { AnthropicMessagesProvider } from '../anthropic/messages';
import { getBedrockMantleOrigin } from './mantle';

import type { EnvOverrides } from '../../types/env';
import type { ProviderOptions } from '../../types/providers';

export const DEFAULT_BEDROCK_ANTHROPIC_REGION = 'us-east-1';
const FABLE_MANTLE_REGIONS = new Set(['us-east-1', 'eu-north-1']);

export function isBedrockAnthropicMessagesModel(modelName: string): boolean {
  return /^(?:anthropic\.)claude-(?:fable|mythos)-5$/.test(modelName);
}

export function requiresBedrockAnthropicMessagesModel(modelName: string): boolean {
  return /^(?:anthropic\.)claude-mythos-5$/.test(modelName);
}

export function getBedrockAnthropicBaseUrl(region: string): string {
  return `${getBedrockMantleOrigin(region)}/anthropic`;
}

function resolveRegion(config: Record<string, any>, env?: EnvOverrides): string {
  return (
    config.region ||
    env?.AWS_BEDROCK_REGION ||
    getEnvString('AWS_BEDROCK_REGION') ||
    env?.AWS_REGION ||
    env?.AWS_DEFAULT_REGION ||
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    DEFAULT_BEDROCK_ANTHROPIC_REGION
  );
}

function resolveApiKey(config: Record<string, any>, env?: EnvOverrides): string | undefined {
  const explicitKey =
    typeof config.apiKey === 'string' && !config.apiKey.includes('{{') ? config.apiKey : undefined;
  return explicitKey || env?.AWS_BEARER_TOKEN_BEDROCK || getEnvString('AWS_BEARER_TOKEN_BEDROCK');
}

export class BedrockAnthropicMessagesProvider extends AnthropicMessagesProvider {
  constructor(modelName: string, options: ProviderOptions & { id?: string } = {}) {
    super(modelName, options);

    // Bedrock's Anthropic-compatible endpoint accepts API keys via x-api-key.
    // Keep the Anthropic SDK for request/response parity and use its API-key
    // authentication mode so it emits the expected header.
    this.anthropic = new Anthropic({
      apiKey: this.apiKey ?? null,
      authToken: null,
      baseURL: this.getApiBaseUrl(),
    });
  }
}

export function createBedrockAnthropicMessagesProvider(
  modelName: string,
  providerOptions: ProviderOptions & { id?: string } = {},
): BedrockAnthropicMessagesProvider {
  const config: Record<string, any> = providerOptions.config ?? {};
  const region = resolveRegion(config, providerOptions.env);
  const apiKey = resolveApiKey(config, providerOptions.env);

  if (!apiKey) {
    throw new Error(
      `Amazon Bedrock model "${modelName}" is served through Bedrock's Anthropic-compatible ` +
        `Messages API. Set AWS_BEARER_TOKEN_BEDROCK (or config.apiKey). See ` +
        `https://www.promptfoo.dev/docs/providers/aws-bedrock/#claude-fable-and-mythos-models`,
    );
  }

  if (
    !config.apiBaseUrl &&
    requiresBedrockAnthropicMessagesModel(modelName) &&
    region !== 'us-east-1'
  ) {
    throw new Error(
      `Amazon Bedrock model "${modelName}" is only available in us-east-1. ` +
        `Set config.region or AWS_BEDROCK_REGION to us-east-1.`,
    );
  }

  if (
    !config.apiBaseUrl &&
    /^(?:anthropic\.)claude-fable-5$/.test(modelName) &&
    !FABLE_MANTLE_REGIONS.has(region)
  ) {
    throw new Error(
      `Amazon Bedrock model "${modelName}" is available through the Anthropic Messages ` +
        `endpoint only in us-east-1 and eu-north-1. Set config.region or ` +
        `AWS_BEDROCK_REGION to a supported region.`,
    );
  }

  const apiBaseUrl = config.apiBaseUrl || getBedrockAnthropicBaseUrl(region);

  return new BedrockAnthropicMessagesProvider(modelName, {
    ...providerOptions,
    config: { ...config, apiBaseUrl, apiKey },
  });
}
