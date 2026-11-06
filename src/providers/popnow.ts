import { resolveConfiguredApiKey } from './credentials';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { serializeProvider } from './serialization';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/providers';

const POPNOW_API_BASE = 'https://api.popnow.ai/v1';

// PopNow model ids end with a task suffix, e.g. `openai/gpt-6.1-terra/chat`.
const POPNOW_TASK_SUFFIX = /\/chat$/;

export class PopNowProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: ProviderOptions = {}) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiBaseUrl: providerOptions.config?.apiBaseUrl || POPNOW_API_BASE,
        apiKeyEnvar: providerOptions.config?.apiKeyEnvar || 'POPNOW_API_KEY',
      },
    });
  }

  /** Strip the task suffix for capability checks while keeping the wire model id. */
  protected normalizeCapabilityModelName(modelName: string): string {
    return modelName.replace(POPNOW_TASK_SUFFIX, '');
  }

  protected getCapabilityModelName(): string {
    return this.normalizeCapabilityModelName(this.modelName);
  }

  // Resolve the key from the PopNow config or envar only. Falling back to
  // OPENAI_API_KEY like the base provider would send an OpenAI key to PopNow.
  override getApiKey(): string | undefined {
    return resolveConfiguredApiKey(this);
  }

  // PopNow has no concept of an OpenAI organization; suppress the header so a
  // stray OPENAI_ORGANIZATION env var doesn't leak onto PopNow requests. A
  // deliberately configured custom header is still sent.
  override getOrganization(): undefined {
    return undefined;
  }

  // PopNow sets its own per-model rates. Billing on the full wire id keeps calls
  // out of the OpenAI price catalog, while rates set in the config still apply.
  protected override getBillingModelName(): string {
    return this.modelName;
  }

  id(): string {
    return `popnow:${this.modelName}`;
  }

  toString(): string {
    return `[PopNow Provider ${this.modelName}]`;
  }

  toJSON() {
    return serializeProvider(this, 'popnow');
  }
}

export function createPopNowProvider(
  providerPath: string,
  options: { config?: ProviderOptions; env?: EnvOverrides } = {},
): ApiProvider {
  const modelName = providerPath.split(':').slice(1).join(':');
  if (!POPNOW_TASK_SUFFIX.test(modelName)) {
    throw new Error(
      `Unsupported PopNow model "${modelName}": only chat models (ids ending in /chat) are available through this provider.`,
    );
  }
  return new PopNowProvider(modelName, {
    ...options.config,
    env: options.config?.env ?? options.env,
  });
}
