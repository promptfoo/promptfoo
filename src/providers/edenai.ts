import { getEnvString } from '../envars';
import { OpenAiChatCompletionProvider } from './openai/chat';

import type { EnvVarKey } from '../envars';
import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/index';
import type { OpenAiChatCompletionCostData } from './openai/chat';
import type { OpenAiCompletionOptions } from './openai/types';

const EDENAI_API_BASE_URL = 'https://api.edenai.run/v3';
const EDENAI_API_KEY_ENVAR = 'EDENAI_API_KEY';
const DEFAULT_EDENAI_MODEL = 'openai/gpt-4o-mini';

// OpenAI-style subtypes that this chat-only provider does not implement. Eden AI
// is reached through chat completions, so reject these with a clear error instead
// of silently sending them to /chat/completions (see src/providers/AGENTS.md).
const UNSUPPORTED_EDENAI_SUBTYPES = new Set([
  'completion',
  'embedding',
  'embeddings',
  'assistant',
  'responses',
  'realtime',
  'moderation',
  'image',
  'audio',
  'transcription',
  'speech',
]);

type EdenAiConfig = OpenAiCompletionOptions;

type EdenAiProviderOptions = Omit<ProviderOptions, 'config'> & {
  config?: EdenAiConfig;
};

function getProviderEnvString(env: EnvOverrides | undefined, key: EnvVarKey): string | undefined {
  if (env && Object.prototype.hasOwnProperty.call(env, key)) {
    const value = env[key as keyof EnvOverrides];
    return value === undefined ? undefined : String(value);
  }
  return undefined;
}

// Eden AI (https://www.edenai.co) is an EU-based, OpenAI-compatible LLM gateway.
// A single API key reaches models from many providers (OpenAI, Anthropic, Google,
// Mistral, Cohere and more) with vendor-prefixed ids such as `openai/gpt-4o-mini`
// or `anthropic/claude-sonnet-4-5`, and it offers EU data residency, zero data
// retention, a DPA and SOC 2 / ISO 27001. Because it speaks the OpenAI
// /chat/completions schema, the standard chat provider handles requests once the
// base URL and key envar are pointed at it. For EU data residency, set
// `apiBaseUrl: https://api.eu.edenai.run/v3`.
// https://www.edenai.co/docs
class EdenAiProvider extends OpenAiChatCompletionProvider {
  config: EdenAiConfig;

  constructor(modelName: string, providerOptions: EdenAiProviderOptions) {
    const edenaiConfig = providerOptions.config ?? {};
    const resolvedConfig: EdenAiConfig = {
      ...edenaiConfig,
      apiKeyEnvar: edenaiConfig.apiKeyEnvar ?? EDENAI_API_KEY_ENVAR,
      apiBaseUrl: edenaiConfig.apiBaseUrl ?? EDENAI_API_BASE_URL,
    };

    super(modelName, {
      ...providerOptions,
      config: resolvedConfig,
    });

    this.config = resolvedConfig;
  }

  // Resolve the key from the Eden AI config/envar only — unlike the OpenAI base
  // provider we do NOT fall back to OPENAI_API_KEY, which would send an OpenAI
  // key to Eden AI and 401.
  override getApiKey(): string | undefined {
    if (this.config.apiKey !== undefined) {
      return this.config.apiKey;
    }
    const apiKeyEnvar = this.config.apiKeyEnvar as EnvVarKey | undefined;
    return apiKeyEnvar
      ? (getProviderEnvString(this.env, apiKeyEnvar) ?? getEnvString(apiKeyEnvar))
      : undefined;
  }

  override getApiUrl(): string {
    return this.config.apiBaseUrl ?? EDENAI_API_BASE_URL;
  }

  // Eden AI has no concept of an OpenAI organization; suppress the header so a
  // stray OPENAI_ORGANIZATION env var doesn't leak onto Eden AI requests.
  override getOrganization(): undefined {
    return undefined;
  }

  protected override getMissingApiKeyErrorMessage(): string {
    return (
      `Eden AI API key is not set. Set the ${this.config.apiKeyEnvar ?? EDENAI_API_KEY_ENVAR} ` +
      'environment variable or add `apiKey` to the provider config.'
    );
  }

  // Eden AI returns an authoritative top-level `cost` (USD) on successful
  // responses. Prefer it over the OpenAI token based estimate, which would be
  // wrong for non-OpenAI models routed through the gateway (and missing for
  // vendors promptfoo has no price table for). Cache hits defer to the base,
  // which returns no cost.
  protected override calculateResponseCost(
    data: OpenAiChatCompletionCostData,
    config: OpenAiCompletionOptions,
    cached: boolean,
  ): number | undefined {
    if (!cached) {
      const edenCost = (data as { cost?: unknown }).cost;
      if (typeof edenCost === 'number' && Number.isFinite(edenCost)) {
        return edenCost;
      }
    }
    return super.calculateResponseCost(data, config, cached);
  }

  id(): string {
    return `edenai:${this.modelName}`;
  }

  toString(): string {
    return `[Eden AI Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'edenai',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.config.apiKey && { apiKey: undefined }),
      },
    };
  }
}

export function createEdenAiProvider(
  providerPath: string,
  options: EdenAiProviderOptions = {},
): ApiProvider {
  // Accept `edenai:<vendor/model>` and `edenai:chat:<vendor/model>`; everything
  // after the optional `chat:` segment is the model id. Eden AI ids are
  // vendor-prefixed with a slash (e.g. `openai/gpt-4o-mini`), which passes
  // through the colon split unchanged.
  const splits = providerPath.split(':');
  const rest = splits.slice(1);
  if (rest[0] === 'chat') {
    rest.shift();
  } else if (UNSUPPORTED_EDENAI_SUBTYPES.has(rest[0] ?? '')) {
    throw new Error(
      `Eden AI provider only supports chat completions, but got "${providerPath}". ` +
        `The "${rest[0]}" subtype is not supported. Use "edenai:<vendor/model>" ` +
        '(for example edenai:openai/gpt-4o-mini) or "edenai:chat:<vendor/model>".',
    );
  }
  const modelName = rest.join(':') || DEFAULT_EDENAI_MODEL;
  return new EdenAiProvider(modelName, options);
}
