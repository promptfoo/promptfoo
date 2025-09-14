import type {
  CallApiContextParams,
  CallApiOptionsParams,
  EnvOverrides,
  ProviderEmbeddingResponse,
  ProviderOptions,
  ProviderResponse,
} from '../types';
import type { OpenAiCompletionOptions } from './openai/types';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';
import { getEnvString } from '../envars';
import { fetchWithCache } from '../cache';
import logger from '../logger';

type Model = {
  id: string;
  object: string;
  created: number;
  owned_by: string;
};

type ModelsReply = {
  data?: Model[];
};

export async function fetchLocalModels(apiBaseUrl: string): Promise<Model[]> {
  try {
    const { data } = await fetchWithCache<ModelsReply>(
      `${apiBaseUrl}/models`,
      undefined,
      undefined,
      'json',
      true,
      0,
    );
    return data?.data ?? [];
  } catch (e: any) {
    throw new Error(
      `Failed to connect to Docker Model Runner. Is it enabled? Are the API endpoints enabled? For details, see https://docs.docker.com/ai/model-runner. \n${e.message}`,
    );
  }
}

export async function hasLocalModel(modelId: string, apiBaseUrl: string): Promise<boolean> {
  const localModels = await fetchLocalModels(apiBaseUrl);
  return localModels.some(
    (model) => model && model.id?.toLocaleLowerCase() === modelId?.toLocaleLowerCase(),
  );
}

export function parseProviderPath(providerPath: string): {
  type: 'chat' | 'completion' | 'embeddings';
  model: string;
} {
  const splits = providerPath.split(':');
  const type = splits[1];
  switch (type) {
    case 'chat':
    case 'completion':
    case 'embeddings':
      return {
        type,
        model: splits.slice(2).join(':'),
      };
    case 'embedding':
      // Map 'embedding' to 'embeddings' for compatibility with the OpenAI API
      // This allows users to use either 'docker:embedding:model' or 'docker:embeddings:model'
      return {
        type: 'embeddings',
        model: splits.slice(2).join(':'),
      };
    default:
      return {
        type: 'chat',
        model: splits.slice(1).join(':'),
      };
  }
}

/**
 * Factory for creating Docker Model Runner providers using OpenAI-compatible endpoints.
 */
export function createDockerProvider(
  providerPath: string,
  options: { config?: ProviderOptions; id?: string; env?: EnvOverrides } = {},
) {
  const apiUrl =
    options?.env?.DOCKER_MODEL_RUNNER_BASE_URL ??
    getEnvString('DOCKER_MODEL_RUNNER_BASE_URL') ??
    'http://localhost:12434';
  const apiBaseUrl = apiUrl + '/engines/v1';

  const apiKey =
    options?.env?.DOCKER_MODEL_RUNNER_API_KEY ??
    getEnvString('DOCKER_MODEL_RUNNER_API_KEY') ??
    'dmr';

  const openaiOptions = {
    ...options,
    config: {
      ...(options.config || {}),
      apiBaseUrl,
      apiKey,
    } as OpenAiCompletionOptions,
  };
  const { type, model } = parseProviderPath(providerPath);
  switch (type) {
    case 'chat':
    default:
      return new DMRChatCompletionProvider(model, openaiOptions);
    case 'completion':
      return new DMRCompletionProvider(model, openaiOptions);
    case 'embeddings':
      return new DMREmbeddingProvider(model, openaiOptions);
  }
}

export class DMRChatCompletionProvider extends OpenAiChatCompletionProvider {
  public async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (!(await hasLocalModel(this.modelName, this.getApiUrl()))) {
      logger.warn(
        `Model '${this.modelName}' not found. Run 'docker model pull ${this.modelName}'.`,
      );
    }
    return super.callApi(prompt, context, callApiOptions);
  }
}

export class DMRCompletionProvider extends OpenAiCompletionProvider {
  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (!(await hasLocalModel(this.modelName, this.getApiUrl()))) {
      logger.warn(
        `Model '${this.modelName}' not found. Run 'docker model pull ${this.modelName}'.`,
      );
    }
    return super.callApi(prompt, context, callApiOptions);
  }
}

export class DMREmbeddingProvider extends OpenAiEmbeddingProvider {
  async callEmbeddingApi(text: string): Promise<ProviderEmbeddingResponse> {
    if (!(await hasLocalModel(this.modelName, this.getApiUrl()))) {
      logger.warn(
        `Model '${this.modelName}' not found. Run 'docker model pull ${this.modelName}'.`,
      );
    }
    return super.callEmbeddingApi(text);
  }
}
