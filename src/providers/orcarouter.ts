import { type EnvVarKey, getEnvString } from '../envars';
import { OpenAiChatCompletionProvider } from './openai/chat';

import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
} from '../types/providers';

/**
 * OrcaRouter provider — OpenAI-compatible meta-router (https://www.orcarouter.ai).
 *
 * Architecturally, this is a thin set of overrides on top of
 * `OpenAiChatCompletionProvider` so we inherit refusal / content-filter handling,
 * tool / MCP callbacks, multi-choice metadata, `latencyMs` propagation,
 * `deleteFromCache` on errors, and `metadata.http.headers` exposure (useful for
 * OrcaRouter's `X-Orca-*` routing-audit headers).
 *
 * What we customize:
 *  - `apiBaseUrl` and `apiKeyEnvar` default to OrcaRouter rather than OpenAI.
 *  - `getApiKey()` does NOT fall back to `OPENAI_API_KEY` — sending an OpenAI key
 *    to OrcaRouter is the wrong default.
 *  - `getApiUrl()` ignores `OPENAI_API_HOST` / `OPENAI_API_BASE_URL` /
 *    `OPENAI_BASE_URL` so OrcaRouter traffic does not get misrouted to a
 *    different OpenAI-compatible host the user wired up for OpenAI.
 *  - `supportsTemperature()` suppresses `temperature` for upstream reasoning
 *    families OrcaRouter routes to that reject the field
 *    (`anthropic/claude-opus-4+`, `deepseek/deepseek-reasoner` / `-r1`).
 *    We deliberately do NOT override `isReasoningModel()` for these — that
 *    would also drop `max_tokens`, which Anthropic / DeepSeek do accept.
 *  - Attribution headers (`HTTP-Referer`, `X-Title`) are injected via
 *    `config.headers` so the base class still owns the request.
 *  - OrcaRouter-specific routing fields (`models`, `route`) are forwarded via
 *    `config.passthrough` so they appear at the top level of the request body.
 */
export class OrcaRouterProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: ProviderOptions) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiBaseUrl: providerOptions.config?.apiBaseUrl || 'https://api.orcarouter.ai/v1',
        apiKeyEnvar: providerOptions.config?.apiKeyEnvar || 'ORCAROUTER_API_KEY',
        headers: {
          // User-supplied headers win — `??=` is set inline below via spread order.
          'HTTP-Referer': 'https://promptfoo.dev/',
          'X-Title': 'promptfoo',
          ...providerOptions.config?.headers,
        },
        passthrough: {
          ...(providerOptions.config?.models && { models: providerOptions.config.models }),
          ...(providerOptions.config?.route && { route: providerOptions.config.route }),
          ...(providerOptions.config?.passthrough || {}),
        },
      },
    });
  }

  id(): string {
    return `orcarouter:${this.modelName}`;
  }

  toString(): string {
    return `[OrcaRouter Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'orcarouter',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.config.apiKey && { apiKey: undefined }),
      },
    };
  }

  /**
   * Resolve the API key without the base class's `OPENAI_API_KEY` fallback — users
   * should not accidentally send an OpenAI key to OrcaRouter.
   */
  getApiKey(): string | undefined {
    const envar = this.config?.apiKeyEnvar || 'ORCAROUTER_API_KEY';
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
    return `API key is not set. Set the ${this.config.apiKeyEnvar || 'ORCAROUTER_API_KEY'} environment variable or add \`apiKey\` to the provider config.`;
  }

  /**
   * Ignore `OPENAI_API_HOST` / `OPENAI_API_BASE_URL` / `OPENAI_BASE_URL` — those env
   * vars are meant for the OpenAI provider and would otherwise misroute OrcaRouter
   * traffic to whatever OpenAI-compatible host the user has wired up for OpenAI.
   * `apiBaseUrl` is always populated by the constructor (default
   * `https://api.orcarouter.ai/v1`) so we only need to consult that.
   */
  getApiUrl(): string {
    return this.config.apiBaseUrl || 'https://api.orcarouter.ai/v1';
  }

  protected getGenAISystem(): string {
    return 'orcarouter';
  }

  async getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ) {
    const result = await super.getOpenAiBody(prompt, context, callApiOptions);
    const config = result.config as typeof result.config & {
      models?: unknown;
      route?: unknown;
    };
    const body = result.body as typeof result.body & {
      models?: unknown;
      route?: unknown;
    };

    if (config.models !== undefined && body.models === undefined) {
      body.models = config.models;
    }
    if (config.route !== undefined && body.route === undefined) {
      body.route = config.route;
    }

    return result;
  }

  /**
   * Suppress `temperature` for OrcaRouter upstream reasoning families that reject it.
   * Done via `supportsTemperature` (not `isReasoningModel`) so we do not also strip
   * `max_tokens` — Anthropic / DeepSeek native APIs accept `max_tokens`, only the
   * OpenAI-style `temperature` is the parameter they reject.
   * Reference: https://docs.orcarouter.ai/advanced/reasoning
   */
  protected supportsTemperature(): boolean {
    if (!super.supportsTemperature()) {
      return false;
    }
    const m = this.modelName;
    // Anthropic Claude Opus 4+ (Opus 2/3 still accept `temperature`).
    if (/(^|\/)claude-opus-(?!2|3)\d/.test(m)) {
      return false;
    }
    // DeepSeek Reasoner / R1 family.
    if (/(^|\/)deepseek-(reasoner|r1)\b/.test(m)) {
      return false;
    }
    return true;
  }
}

export function createOrcaRouterProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: Record<string, string | undefined>;
  } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(1).join(':');

  const providerOptions: ProviderOptions = options.config ? { ...options.config } : {};
  if (options.env && !providerOptions.env) {
    providerOptions.env = options.env as ProviderOptions['env'];
  }
  if (options.id && !providerOptions.id) {
    providerOptions.id = options.id;
  }

  return new OrcaRouterProvider(modelName, providerOptions);
}
