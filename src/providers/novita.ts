import { fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';
import { getRequestTimeoutMs } from './shared';

import type { EnvVarKey } from '../envars';
import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/index';
import type { OpenAiCompletionOptions } from './openai/types';

const NOVITA_API_BASE_URL = 'https://api.novita.ai/openai/v1';
const NOVITA_API_KEY_ENV_VAR = 'NOVITA_API_KEY';

export interface NovitaModel {
  id: string;
}

type NovitaProviderOptions = {
  config?: OpenAiCompletionOptions;
  id?: string;
  env?: EnvOverrides;
};

let modelCache: NovitaModel[] | null = null;

export function clearNovitaModelsCache() {
  modelCache = null;
}

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

export async function fetchNovitaModels(env?: EnvOverrides): Promise<NovitaModel[]> {
  if (modelCache) {
    return modelCache;
  }

  try {
    const apiKey = getNovitaApiKey({}, env);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const { data } = await fetchWithCache<any>(
      `${NOVITA_API_BASE_URL}/models`,
      { headers },
      getRequestTimeoutMs(),
    );

    const models = data?.data || data?.models || data;
    if (Array.isArray(models)) {
      modelCache = models.map((m: any) => ({ id: m.id || m.model || m.name || m }));
    } else {
      modelCache = [];
    }
  } catch (err) {
    logger.warn(`Failed to fetch novita models: ${String(err)}`);
    modelCache = [];
  }

  return modelCache;
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
  const isTypedProvider = ['chat', 'completion', 'embedding', 'embeddings'].includes(type);
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
