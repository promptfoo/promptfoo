import { type EnvVarKey, getEnvString } from '../envars';
import { sanitizeObject } from '../util/sanitizer';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { serializeProvider } from './serialization';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/providers';
import type { OpenAiChatCompletionCostData } from './openai/chat';
import type { OpenAiCompletionOptions } from './openai/types';

const REQUESTY_API_BASE = 'https://router.requesty.ai/v1';
const REQUESTY_API_KEY_ENVAR = 'REQUESTY_API_KEY';

/**
 * Requesty provider: OpenAI-compatible LLM router (https://requesty.ai).
 *
 * A thin set of overrides on top of `OpenAiChatCompletionProvider`, so request
 * building, cancellation, caching, refusal and error handling all come from the
 * shared OpenAI chat path. What is Requesty specific:
 *  - `apiBaseUrl` and `apiKeyEnvar` default to Requesty, and the key does NOT fall
 *    back to `OPENAI_API_KEY` (an OpenAI key should not be sent to a third party).
 *  - `OPENAI_API_HOST` / `OPENAI_BASE_URL` style env vars are ignored so Requesty
 *    traffic is not routed to a host configured for the OpenAI provider.
 *  - Requesty reports the actual charge in `usage.cost` (USD). Routed model IDs
 *    like `openai/gpt-4o-mini` do not match the OpenAI price table, so the
 *    reported cost is used unless the user configured explicit rates.
 */
export class RequestyProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: ProviderOptions) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiBaseUrl: providerOptions.config?.apiBaseUrl || REQUESTY_API_BASE,
        apiKeyEnvar: providerOptions.config?.apiKeyEnvar || REQUESTY_API_KEY_ENVAR,
        headers: {
          // Optional Requesty attribution headers; user-supplied headers win.
          'HTTP-Referer': 'https://promptfoo.dev/',
          'X-Title': 'promptfoo',
          ...providerOptions.config?.headers,
        },
      },
    });
  }

  id(): string {
    return `requesty:${this.modelName}`;
  }

  toString(): string {
    return `[Requesty Provider ${this.modelName}]`;
  }

  toJSON() {
    const serialized = serializeProvider(this, 'requesty');
    return {
      ...serialized,
      config: sanitizeObject(serialized.config, {
        context: 'provider config',
        sanitizeUrls: true,
        maxDepth: Number.POSITIVE_INFINITY,
      }),
    };
  }

  getApiKey(): string | undefined {
    const envar = this.config?.apiKeyEnvar || REQUESTY_API_KEY_ENVAR;
    return (
      this.config.apiKey ||
      this.env?.[envar as keyof EnvOverrides] ||
      getEnvString(envar as EnvVarKey)
    );
  }

  getOrganization(): undefined {
    return undefined;
  }

  protected getMissingApiKeyErrorMessage(): string {
    return `API key is not set. Set the ${this.config.apiKeyEnvar || REQUESTY_API_KEY_ENVAR} environment variable or add \`apiKey\` to the provider config.`;
  }

  getApiUrl(): string {
    return this.config.apiBaseUrl || REQUESTY_API_BASE;
  }

  protected override calculateResponseCost(
    data: OpenAiChatCompletionCostData,
    config: OpenAiCompletionOptions,
    cached: boolean,
  ): number | undefined {
    const hasExplicitRates =
      config.cost !== undefined ||
      config.inputCost !== undefined ||
      config.outputCost !== undefined;
    const reportedCost = (data?.usage as { cost?: unknown } | undefined)?.cost;
    if (
      !hasExplicitRates &&
      typeof reportedCost === 'number' &&
      Number.isFinite(reportedCost) &&
      reportedCost >= 0
    ) {
      return reportedCost;
    }
    return super.calculateResponseCost(data, config, cached);
  }
}

export function createRequestyProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: Record<string, string | undefined>;
  } = {},
): ApiProvider {
  const modelName = providerPath.split(':').slice(1).join(':');

  const providerOptions: ProviderOptions = options.config ? { ...options.config } : {};
  if (options.env && !providerOptions.env) {
    providerOptions.env = options.env as ProviderOptions['env'];
  }
  if (options.id && !providerOptions.id) {
    providerOptions.id = options.id;
  }

  return new RequestyProvider(modelName, providerOptions);
}
