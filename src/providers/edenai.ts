import { getEnvString, getProviderEnvString } from '../envars';
import { sanitizeObject } from '../util/sanitizer';
import { OpenAiChatCompletionProvider } from './openai/chat';

import type { EnvVarKey } from '../envars';
import type { ApiProvider, ProviderOptions } from '../types/index';
import type { OpenAiChatCompletionCostData } from './openai/chat';
import type { OpenAiCompletionOptions } from './openai/types';

const EDENAI_API_BASE_URL = 'https://api.edenai.run/v3';
const EDENAI_API_KEY_ENVAR = 'EDENAI_API_KEY';
const DEFAULT_EDENAI_MODEL = 'openai/gpt-4o-mini';

type EdenAiConfig = OpenAiCompletionOptions;

type EdenAiProviderOptions = Omit<ProviderOptions, 'config'> & {
  config?: EdenAiConfig;
};

class EdenAiProvider extends OpenAiChatCompletionProvider {
  config: EdenAiConfig;

  constructor(modelName: string, providerOptions: EdenAiProviderOptions) {
    const edenaiConfig = providerOptions.config ?? {};
    if (edenaiConfig.stream) {
      throw new Error('The Eden AI provider only supports non-streaming chat completions');
    }
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
  // vendors promptfoo has no price table for). The evaluator accounts for
  // incurred cost separately on cache replay.
  protected override calculateResponseCost(
    data: OpenAiChatCompletionCostData,
    config: OpenAiCompletionOptions,
    cached: boolean,
  ): number | undefined {
    const edenCost = (data as { cost?: unknown }).cost;
    if (typeof edenCost === 'number' && Number.isFinite(edenCost)) {
      return edenCost;
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
      config: sanitizeObject({ ...this.config, apiKey: undefined }, { sanitizeUrls: true }),
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
  const model = providerPath.split(':').slice(1);
  if (model[0] === 'chat') {
    model.shift();
  }
  const modelName = model.join(':') || DEFAULT_EDENAI_MODEL;
  if (!/^[^/:]+\/.+$/.test(modelName)) {
    throw new Error(
      `Eden AI provider only supports chat completions. Use "edenai:<vendor/model>" ` +
        `or "edenai:chat:<vendor/model>" (received "${providerPath}").`,
    );
  }
  return new EdenAiProvider(modelName, options);
}
