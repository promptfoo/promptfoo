import { buildIsolatedAnthropicClientOptions } from '../anthropic/generic';
import { AnthropicMessagesProvider } from '../anthropic/messages';
import {
  getBedrockMantleOrigin,
  resolveBedrockMantleApiKey,
  resolveBedrockMantleRegion,
} from './mantle';
import type { ClientOptions } from '@anthropic-ai/sdk';

import type { ProviderOptions } from '../../types/providers';

export const DEFAULT_BEDROCK_ANTHROPIC_REGION = 'us-east-1';
const FABLE_MANTLE_REGIONS = new Set(['us-east-1', 'eu-north-1']);
const RUNTIME_MESSAGES_MODELS = new Set([
  'us.anthropic.claude-fable-5-1',
  'global.anthropic.claude-fable-5-1',
  'us.anthropic.claude-mythos-5-1',
  'global.anthropic.claude-mythos-5-1',
]);

const BEDROCK_ANTHROPIC_MESSAGES_MODELS = [
  'anthropic.claude-fable-5',
  'anthropic.claude-mythos-5',
  'anthropic.claude-fable-5-1',
  ...RUNTIME_MESSAGES_MODELS,
];

export function isBedrockAnthropicMessagesModel(modelName: string): boolean {
  return BEDROCK_ANTHROPIC_MESSAGES_MODELS.includes(modelName);
}

export function requiresBedrockAnthropicMessagesModel(modelName: string): boolean {
  return modelName === 'anthropic.claude-mythos-5';
}

export function getBedrockAnthropicBaseUrl(region: string, useRuntime = false): string {
  // Validate the region before interpolating either host, which receives an API key.
  const mantleOrigin = getBedrockMantleOrigin(region);
  return useRuntime
    ? `https://bedrock-runtime.${region}.amazonaws.com/anthropic`
    : `${mantleOrigin}/anthropic`;
}

export class BedrockAnthropicMessagesProvider extends AnthropicMessagesProvider {
  // Bedrock's Anthropic-compatible endpoint authenticates with an API key via
  // x-api-key (the factory guarantees one). Never fall back to a local Claude
  // Code OAuth session — that would send an Anthropic OAuth token to the
  // Bedrock host.
  static override readonly SUPPORTS_CLAUDE_CODE_OAUTH = false;

  protected override buildAnthropicClientOptions(options: ClientOptions): ClientOptions {
    return buildIsolatedAnthropicClientOptions(options, this.env, this.apiKey);
  }

  protected override hasCustomHeaders(): boolean {
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
  const apiKey = resolveBedrockMantleApiKey(config, providerOptions.env);

  if (!apiKey) {
    throw new Error(
      `Amazon Bedrock model "${modelName}" is served through Bedrock's Anthropic-compatible ` +
        `Messages API. Set AWS_BEARER_TOKEN_BEDROCK (or config.apiKey). See ` +
        `https://www.promptfoo.dev/docs/providers/aws-bedrock/#claude-fable-and-mythos-models`,
    );
  }

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
    config.apiBaseUrl || getBedrockAnthropicBaseUrl(region, RUNTIME_MESSAGES_MODELS.has(modelName));

  return new BedrockAnthropicMessagesProvider(modelName, {
    ...providerOptions,
    config: { ...config, apiBaseUrl, apiKey },
  });
}
