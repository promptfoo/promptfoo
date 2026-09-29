import { getEnvString } from '../envars';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';

import type { EnvVarKey } from '../envars';
import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/index';
import type { OpenAiCompletionOptions } from './openai/types';

const NOVITA_API_BASE_URL = 'https://api.novita.ai/openai/v1';
const NOVITA_API_KEY_ENV_VAR = 'NOVITA_API_KEY';
const NOVITA_SUBTYPES = new Set(['chat', 'completion', 'embedding', 'embeddings']);

type NovitaProviderOptions = {
  config?: OpenAiCompletionOptions;
  id?: string;
  env?: EnvOverrides;
};

function getProviderEnvString(env: EnvOverrides | undefined, key: EnvVarKey): string | undefined {
  if (env && Object.prototype.hasOwnProperty.call(env, key)) {
    const value = env[key as keyof EnvOverrides];
    return value === undefined ? undefined : String(value);
  }
  return undefined;
}

function getNovitaApiKey(
  config: OpenAiCompletionOptions,
  env: EnvOverrides | undefined,
): string | undefined {
  if (config.apiKey !== undefined) {
    return config.apiKey;
  }
  const apiKeyEnvar = (config.apiKeyEnvar ?? NOVITA_API_KEY_ENV_VAR) as EnvVarKey;
  return getProviderEnvString(env, apiKeyEnvar) ?? getEnvString(apiKeyEnvar);
}

function getNovitaConfig(
  config: OpenAiCompletionOptions | undefined,
  includeTextDefaults = true,
): OpenAiCompletionOptions {
  return {
    ...config,
    apiBaseUrl: config?.apiBaseUrl ?? NOVITA_API_BASE_URL,
    apiKeyEnvar: config?.apiKeyEnvar ?? NOVITA_API_KEY_ENV_VAR,
    ...(includeTextDefaults && config?.temperature === undefined ? { temperature: 1 } : {}),
  };
}

function getNovitaMissingApiKeyErrorMessage(config: OpenAiCompletionOptions): string {
  return `Novita API key is not set. Set the ${config.apiKeyEnvar ?? NOVITA_API_KEY_ENV_VAR} environment variable or add \`apiKey\` to the provider config.`;
}

export class NovitaChatCompletionProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, options: NovitaProviderOptions = {}) {
    super(modelName, {
      ...options,
      config: getNovitaConfig(options.config),
    });
  }

  override id(): string {
    return `novita:chat:${this.modelName}`;
  }

  override getApiKey(): string | undefined {
    return getNovitaApiKey(this.config, this.env);
  }

  override getOrganization(): undefined {
    return undefined;
  }

  override getApiUrl(): string {
    return this.config.apiBaseUrl ?? NOVITA_API_BASE_URL;
  }

  protected override getMissingApiKeyErrorMessage(): string {
    return getNovitaMissingApiKeyErrorMessage(this.config);
  }
}

export class NovitaCompletionProvider extends OpenAiCompletionProvider {
  constructor(modelName: string, options: NovitaProviderOptions = {}) {
    super(modelName, {
      ...options,
      config: getNovitaConfig(options.config),
    });
  }

  override id(): string {
    return `novita:completion:${this.modelName}`;
  }

  override getApiKey(): string | undefined {
    return getNovitaApiKey(this.config, this.env);
  }

  override getOrganization(): undefined {
    return undefined;
  }

  override getApiUrl(): string {
    return this.config.apiBaseUrl ?? NOVITA_API_BASE_URL;
  }

  protected override getMissingApiKeyErrorMessage(): string {
    return getNovitaMissingApiKeyErrorMessage(this.config);
  }
}

export class NovitaEmbeddingProvider extends OpenAiEmbeddingProvider {
  declare config: OpenAiCompletionOptions;

  constructor(modelName: string, options: NovitaProviderOptions = {}) {
    super(modelName, {
      ...options,
      config: getNovitaConfig(options.config, false),
    });
  }

  override id(): string {
    return `novita:embedding:${this.modelName}`;
  }

  override getApiKey(): string | undefined {
    return getNovitaApiKey(this.config, this.env);
  }

  override getOrganization(): undefined {
    return undefined;
  }

  override getApiUrl(): string {
    return this.config.apiBaseUrl ?? NOVITA_API_BASE_URL;
  }

  protected override getMissingApiKeyErrorMessage(): string {
    return getNovitaMissingApiKeyErrorMessage(this.config);
  }
}

export function createNovitaProvider(
  providerPath: string,
  options: { config?: ProviderOptions; id?: string; env?: EnvOverrides } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const type = splits[1];
  const isTypedProvider = NOVITA_SUBTYPES.has(type);

  // Reject `novita:<unknown-subtype>:<model>` rather than silently treating
  // `<unknown-subtype>` as part of the model name. A model identifier always
  // contains either a `/` or `.` (e.g. `meta/llama-3.1-8b-instruct`, `qwen/qwen-2.5`),
  // so a bare alphabetic segment followed by more `:` segments is the user
  // signaling a sub-type that this provider does not support.
  if (!isTypedProvider && splits.length >= 3 && /^[a-z][a-z0-9_-]*$/i.test(type)) {
    throw new Error(
      `Unknown Novita provider sub-type "${type}". Supported sub-types are: chat, completion, embedding, embeddings. ` +
        'Use `novita:<model>` for chat, or `novita:<sub-type>:<model>` for an explicit sub-type.',
    );
  }

  const modelName = (isTypedProvider ? splits.slice(2) : splits.slice(1)).join(':');

  if (!modelName.trim()) {
    throw new Error(
      'Novita model name is required. Use `novita:<model-name>` or `novita:chat:<model-name>`.',
    );
  }

  const novitaOptions: NovitaProviderOptions = {
    id: options.id ?? options.config?.id,
    env: options.env ?? options.config?.env,
    config: (options.config?.config ?? {}) as OpenAiCompletionOptions,
  };

  if (type === 'chat') {
    return new NovitaChatCompletionProvider(modelName, novitaOptions);
  } else if (type === 'completion') {
    return new NovitaCompletionProvider(modelName, novitaOptions);
  } else if (type === 'embedding' || type === 'embeddings') {
    return new NovitaEmbeddingProvider(modelName, novitaOptions);
  }

  return new NovitaChatCompletionProvider(modelName, novitaOptions);
}
