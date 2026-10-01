import { type EnvVarKey, getEnvString } from '../envars';
import { OpenAiChatCompletionProvider } from './openai/chat';

import type { EnvOverrides } from '../types/env';
import type { ProviderOptions } from '../types/providers';
import type { OpenAiChatCompletionCostData } from './openai/chat';
import type { OpenAiCompletionOptions } from './openai/types';

export const Y_API_API_BASE_URL = 'https://api.y-api.bestvirtualgoods.com/v1';
export const Y_API_DEFAULT_API_KEY_ENVAR = 'Y_API_API_KEY';

/**
 * Sub-types a `y-api:` path can syntactically carry but Y-API does not serve.
 * Routed to a fail-fast error instead of silently constructing a chat provider,
 * per the prefix/sub-type contract in `src/providers/AGENTS.md`.
 */
const UNSUPPORTED_SUBTYPES = [
  'completion',
  'embedding',
  'embeddings',
  'image',
  'moderation',
  'audio',
  'transcription',
  'realtime',
  'responses',
] as const;

export interface YApiProviderFactoryOptions {
  config?: OpenAiCompletionOptions;
  id?: string;
  env?: EnvOverrides;
}

/**
 * Y-API provider — an OpenAI-compatible gateway that serves several vendors' models
 * under one key, using slash-namespaced model IDs (`deepseek/deepseek-v4-pro`,
 * `anthropic/claude-sonnet-5`, …) copied verbatim from the model catalog.
 *
 * Implemented on the wire: non-streaming and streaming `/chat/completions`, `tools`
 * (function calling), and `response_format: json_object`. The gateway also serves the
 * Anthropic Messages protocol at `/v1/messages`, but that surface is not exposed here —
 * use `y-api:<model>` for chat completions.
 *
 * Extends `OpenAiChatCompletionProvider` so it inherits tool handling, streaming,
 * caching and error normalization. Deliberate deviations from the base class:
 *
 *  - `getApiKey()` never falls back to `OPENAI_API_KEY`. Sending an OpenAI key to a
 *    different host is the wrong default.
 *  - `getApiUrl()` ignores `OPENAI_API_HOST` / `OPENAI_API_BASE_URL` / `OPENAI_BASE_URL`,
 *    which are meant for the `openai` provider and would otherwise misroute `y-api:`
 *    traffic to whatever OpenAI-compatible endpoint the user configured for OpenAI.
 *    `config.apiBaseUrl` is the supported override.
 *  - `calculateResponseCost()` always returns `undefined` — see the comment there.
 *
 * Model-specific parameter behaviour (reasoning-model detection, `temperature`
 * suppression) is inherited unchanged rather than guessed at, because Y-API's catalog
 * IDs are its own namespaced strings and we have not probed each upstream's tolerance.
 */
export class YApiProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: ProviderOptions = {}) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiBaseUrl: providerOptions.config?.apiBaseUrl || Y_API_API_BASE_URL,
        apiKeyEnvar: providerOptions.config?.apiKeyEnvar || Y_API_DEFAULT_API_KEY_ENVAR,
      },
    });
  }

  id(): string {
    return `y-api:${this.modelName}`;
  }

  toString(): string {
    return `[Y-API Provider ${this.modelName}]`;
  }

  /**
   * Resolve the credential without the base class's `OPENAI_API_KEY` fallback.
   */
  getApiKey(): string | undefined {
    const envar = this.config?.apiKeyEnvar || Y_API_DEFAULT_API_KEY_ENVAR;
    return (
      this.config.apiKey ||
      this.env?.[envar as keyof EnvOverrides] ||
      getEnvString(envar as EnvVarKey)
    );
  }

  /**
   * Y-API has no OpenAI organization, and `OPENAI_ORGANIZATION` must not leak into
   * requests to a third-party host.
   */
  getOrganization(): undefined {
    return undefined;
  }

  /**
   * Ignore `OPENAI_API_HOST` / `OPENAI_API_BASE_URL` / `OPENAI_BASE_URL` — those env
   * vars are meant for the OpenAI provider and would otherwise misroute `y-api:`
   * traffic to whatever OpenAI-compatible host the user wired up for OpenAI.
   * `apiBaseUrl` is always populated by the constructor (default
   * `https://api.y-api.bestvirtualgoods.com/v1`), so only that is consulted.
   */
  getApiUrl(): string {
    return this.config.apiBaseUrl || Y_API_API_BASE_URL;
  }

  protected getGenAISystem(): string {
    return 'y-api';
  }

  protected getMissingApiKeyErrorMessage(): string {
    return `API key is not set. Set the ${this.config.apiKeyEnvar || Y_API_DEFAULT_API_KEY_ENVAR} environment variable or add \`apiKey\` to the provider config.`;
  }

  /**
   * Y-API meters in account credit, not USD, and the credit-to-cash conversion is
   * currently promotional (1:20) with a scheduled drop to the standard 1:10. Any USD
   * figure baked into the provider would be wrong within days, so no `cost` is reported
   * and eval results fall back to token counts. Live prices: https://y-api.bestvirtualgoods.com/pricing.json
   *
   * This also avoids a concrete misreporting bug inherited from the base class: it
   * resolves billing rates from `modelName.split('/').pop()`, so a Y-API model ID such as
   * `openai/gpt-5.6-luna` collapses to `gpt-5.6-luna` and matches OpenAI's *direct*
   * rate table. Without this override promptfoo would publish OpenAI's list price as
   * though it were what the Y-API call cost.
   */
  protected calculateResponseCost(
    _data: OpenAiChatCompletionCostData,
    _config: OpenAiCompletionOptions,
    _cached: boolean,
  ): undefined {
    return undefined;
  }
}

/**
 * Parse a `y-api:` provider path.
 *
 * Routing:
 *   y-api:<vendor/model>        → chat completion (canonical form)
 *   y-api:chat:<vendor/model>   → chat completion (explicit alias)
 *   y-api:<unsupported>         → throws (see UNSUPPORTED_SUBTYPES)
 */
export function createYApiProvider(
  providerPath: string,
  options: YApiProviderFactoryOptions = {},
): YApiProvider {
  const splits = providerPath.split(':');
  const remainder = splits.slice(1).join(':');

  // Model IDs contain slashes but never colons, so the segment after the prefix is
  // either a sub-type token or the beginning of the model ID itself.
  const subType = splits[1];
  if (
    subType &&
    subType !== 'chat' &&
    (UNSUPPORTED_SUBTYPES as readonly string[]).includes(subType)
  ) {
    throw new Error(
      `Y-API serves OpenAI-style chat completions only, so "${providerPath}" cannot be resolved. ` +
        `Use \`y-api:<vendor/model>\` for chat and a provider that exposes ${subType} for that surface ` +
        `(for example \`openai:${subType}:<model>\`).`,
    );
  }

  const modelName = subType === 'chat' ? splits.slice(2).join(':') : remainder;
  if (!modelName) {
    throw new Error(
      'Y-API provider requires a model in the format y-api:<vendor/model> (for example y-api:deepseek/deepseek-v4-pro).',
    );
  }

  return new YApiProvider(modelName, {
    config: options.config,
    id: options.id,
    env: options.env,
  });
}
