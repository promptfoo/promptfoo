import { buildIsolatedAnthropicClientOptions } from '../anthropic/generic';
import { AnthropicMessagesProvider } from '../anthropic/messages';
import {
  getBedrockMantleOrigin,
  resolveBedrockMantleApiKey,
  resolveBedrockMantleRegion,
} from './mantle';
import type Anthropic from '@anthropic-ai/sdk';
import type { ClientOptions } from '@anthropic-ai/sdk';

import type { ProviderOptions } from '../../types/providers';
import type { AnthropicMessageOptions } from '../anthropic/types';

export const DEFAULT_BEDROCK_ANTHROPIC_REGION = 'us-east-1';
const FABLE_MANTLE_REGIONS = new Set(['us-east-1', 'eu-north-1']);
const MYTHOS_PREVIEW_MANTLE_REGIONS = new Set(['us-east-1', 'ap-southeast-4']);
const BEDROCK_ANTHROPIC_PROTECTED_HEADERS = new Set([
  'authorization',
  'x-api-key',
  'anthropic-version',
]);
const BEDROCK_NATIVE_HOSTNAME =
  /^(?:[a-z0-9-]+\.)?bedrock(?:-mantle|-runtime)?(?:-fips)?\.[a-z0-9-]+(?:\.vpce)?\.(?:api\.aws|amazonaws\.com(?:\.cn)?)$/;

function isConfiguredBedrockProxy(apiBaseUrl: string | undefined): boolean {
  if (!apiBaseUrl) {
    return false;
  }
  try {
    const { protocol, hostname } = new URL(apiBaseUrl);
    return (
      (protocol === 'https:' || protocol === 'http:') &&
      !BEDROCK_NATIVE_HOSTNAME.test(hostname.replace(/\.+$/, ''))
    );
  } catch {
    return false;
  }
}

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
  'anthropic.claude-mythos-preview',
  'anthropic.claude-opus-4-7',
  'anthropic.claude-opus-4-8',
  'anthropic.claude-opus-5',
  'anthropic.claude-sonnet-5',
];
const BEDROCK_ANTHROPIC_MESSAGES_ONLY_MODELS = new Set([
  'anthropic.claude-mythos-5',
  'anthropic.claude-mythos-preview',
]);

export function isBedrockAnthropicMessagesModel(modelName: string): boolean {
  return BEDROCK_ANTHROPIC_MESSAGES_MODELS.includes(modelName);
}

export function requiresBedrockAnthropicMessagesModel(modelName: string): boolean {
  return BEDROCK_ANTHROPIC_MESSAGES_ONLY_MODELS.has(modelName);
}

export function getBedrockAnthropicBaseUrl(region: string, useRuntime = false): string {
  // Validate the region before interpolating either host, which receives an API key.
  const mantleOrigin = getBedrockMantleOrigin(region);
  return useRuntime
    ? `https://bedrock-runtime.${region}.amazonaws.com/anthropic`
    : `${mantleOrigin}/anthropic`;
}

export class BedrockAnthropicMessagesProvider extends AnthropicMessagesProvider {
  protected override calculateMessageCost(
    config: AnthropicMessageOptions,
    message: Anthropic.Messages.Message,
  ): number | undefined {
    const modelName =
      typeof config.extra_body?.model === 'string' ? config.extra_body.model : this.modelName;
    let endpointRegion: string | undefined;
    try {
      endpointRegion = /^bedrock-mantle\.([a-z0-9-]+)\.api\.aws$/.exec(
        new URL(this.getApiBaseUrl() ?? '').hostname,
      )?.[1];
    } catch {
      // Opaque provisioned endpoints retain the factory's resolved billing region.
    }
    const region =
      endpointRegion ??
      resolveBedrockMantleRegion(this.config, this.env, DEFAULT_BEDROCK_ANTHROPIC_REGION);
    const usesGovCloudOpusPricing =
      modelName === 'anthropic.claude-opus-4-8' &&
      (region === 'us-gov-west-1' || region === 'us-gov-east-1');
    // AWS publishes these GovCloud rates directly. Selecting them at billing time
    // preserves prompt-level flat overrides and avoids the commercial 1.1 premium.
    const pricingConfig =
      usesGovCloudOpusPricing && config.cost == null
        ? {
            ...config,
            inputCost: config.inputCost ?? 6 / 1e6,
            outputCost: config.outputCost ?? 30 / 1e6,
          }
        : config;
    return super.calculateMessageCost(pricingConfig, message, modelName);
  }

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
  protected override sanitizeRequestHeaders(
    headers: Record<string, string>,
  ): Record<string, string> {
    // A configured proxy may require its own explicit bearer credential or API key.
    // Native AWS credentials and Anthropic-scoped defaults stay isolated.
    const allowProxyCredentials = isConfiguredBedrockProxy(this.config.apiBaseUrl);
    return {
      ...Object.fromEntries(
        Object.entries(headers).filter(
          ([name]) =>
            (allowProxyCredentials &&
              (name.toLowerCase() === 'authorization' || name.toLowerCase() === 'x-api-key')) ||
            !BEDROCK_ANTHROPIC_PROTECTED_HEADERS.has(name.toLowerCase()),
        ),
      ),
      // The SDK merges request headers after the null defaults used to suppress
      // ambient Anthropic headers, so restore Bedrock's required version here.
      'anthropic-version': '2023-06-01',
    };
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
    modelName === 'anthropic.claude-mythos-preview' &&
    !MYTHOS_PREVIEW_MANTLE_REGIONS.has(region)
  ) {
    throw new Error(
      `Amazon Bedrock model "${modelName}" is only available in us-east-1 and ` +
        `ap-southeast-4. Set config.region or AWS_BEDROCK_REGION to a supported region.`,
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
  const resolvedConfig = { ...config, region, apiBaseUrl, apiKey };

  return new BedrockAnthropicMessagesProvider(modelName, {
    ...providerOptions,
    config: resolvedConfig,
  });
}
