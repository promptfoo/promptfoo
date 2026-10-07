import { getEnvString } from '../envars';
import { renderVarsInObject } from '../util/index';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiEmbeddingProvider } from './openai/embedding';

import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
} from '../types/index';
import type { OpenAiCompletionOptions } from './openai/types';

export const FLEXAI_API_BASE_URL = 'https://api.flex.ai/v1';
export const FLEXAI_API_KEY_ENVAR = 'FLEXAI_API_KEY';
export const DEFAULT_FLEXAI_CHAT_MODEL = 'DeepSeek-V4-Flash-0731';
export const DEFAULT_FLEXAI_EMBEDDING_MODEL = 'bge-m3';

const EMBEDDING_SUBTYPES = new Set(['embedding', 'embeddings']);

// Subtypes that may appear in `flexai:<subtype>:<model>` paths but are not
// implemented by this provider. Fail fast instead of sending them to chat.
const UNSUPPORTED_SUBTYPES = new Set([
  'audio',
  'completion',
  'image',
  'moderation',
  'realtime',
  'responses',
  'transcription',
]);

type FlexAiProviderOptions = Omit<ProviderOptions, 'config'> & {
  config?: OpenAiCompletionOptions;
};

// Point the OpenAI-compatible base classes at FlexAI. Setting `apiBaseUrl`
// keeps OPENAI_BASE_URL / OPENAI_API_BASE_URL from rerouting requests, and
// setting `apiKeyEnvar` keeps the base class from falling back to
// OPENAI_API_KEY, so an OpenAI key is never sent to FlexAI.
function withFlexAiDefaults<T extends { apiBaseUrl?: string; apiKeyEnvar?: string }>(
  config: T | undefined,
): T & { apiBaseUrl: string; apiKeyEnvar: string } {
  return {
    ...(config ?? ({} as T)),
    apiBaseUrl: config?.apiBaseUrl || FLEXAI_API_BASE_URL,
    apiKeyEnvar: config?.apiKeyEnvar || FLEXAI_API_KEY_ENVAR,
  };
}

function redactApiKey<T extends { apiKey?: string }>(config: T): T {
  return config.apiKey ? { ...config, apiKey: undefined } : config;
}

// FlexAI serves open-weight models behind an OpenAI-compatible API.
// https://docs.flex.ai/inference-api/reference/openai-compatibility
export class FlexAiChatCompletionProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: FlexAiProviderOptions = {}) {
    super(modelName, {
      ...providerOptions,
      config: withFlexAiDefaults(providerOptions.config),
    });
  }

  // OpenAI-Organization is OpenAI-specific; don't forward OPENAI_ORGANIZATION.
  override getOrganization(): undefined {
    return undefined;
  }

  id(): string {
    return `flexai:${this.modelName}`;
  }

  toString(): string {
    return `[FlexAI Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'flexai',
      model: this.modelName,
      config: redactApiKey(this.config),
    };
  }

  override async getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ) {
    const result = await super.getOpenAiBody(prompt, context, callApiOptions);
    const { body, config } = result;

    // The OpenAI base class only sends reasoning_effort for OpenAI reasoning
    // model names (and gpt-oss), so it would be dropped for models such as
    // DeepSeek-V4-Flash. FlexAI accepts it on its reasoning-capable models and
    // translates the level per model.
    if (config.reasoning_effort !== undefined && body.reasoning_effort === undefined) {
      body.reasoning_effort = renderVarsInObject(config.reasoning_effort, context?.vars);
    }

    // The base class injects max_tokens: 1024 when none is configured.
    // Reasoning tokens count against that budget, so a thinking model can
    // spend it all before answering. FlexAI applies its own default (none for
    // reasoning models), so only send a limit the user asked for.
    if (
      config.max_tokens === undefined &&
      config.passthrough?.max_tokens === undefined &&
      getEnvString('OPENAI_MAX_TOKENS') === undefined
    ) {
      delete body.max_tokens;
    }

    return result;
  }
}

export class FlexAiEmbeddingProvider extends OpenAiEmbeddingProvider {
  constructor(modelName: string, providerOptions: FlexAiProviderOptions = {}) {
    super(modelName, {
      ...providerOptions,
      config: withFlexAiDefaults(providerOptions.config),
    });
  }

  override getOrganization(): undefined {
    return undefined;
  }

  id(): string {
    return `flexai:embedding:${this.modelName}`;
  }

  toString(): string {
    return `[FlexAI Embedding Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'flexai',
      model: this.modelName,
      config: redactApiKey(this.config),
    };
  }
}

export function createFlexAiProvider(
  providerPath: string,
  options: FlexAiProviderOptions & { env?: EnvOverrides } = {},
): ApiProvider {
  // FlexAI model ids contain no colons, but keep everything after the optional
  // subtype as the model id so an unexpected one is passed through unchanged.
  const rest = providerPath.split(':').slice(1);
  const subtype = rest[0];

  if (EMBEDDING_SUBTYPES.has(subtype)) {
    const modelName = rest.slice(1).join(':') || DEFAULT_FLEXAI_EMBEDDING_MODEL;
    return new FlexAiEmbeddingProvider(modelName, options);
  }
  if (UNSUPPORTED_SUBTYPES.has(subtype)) {
    throw new Error(
      `flexai:${subtype} is not supported. Use flexai:<model> or flexai:chat:<model> for chat ` +
        'completions, or flexai:embedding:<model> for embeddings.',
    );
  }
  if (subtype === 'chat') {
    rest.shift();
  }
  const modelName = rest.join(':') || DEFAULT_FLEXAI_CHAT_MODEL;
  return new FlexAiChatCompletionProvider(modelName, options);
}
