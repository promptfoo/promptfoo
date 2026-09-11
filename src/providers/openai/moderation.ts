import { createHmac } from 'crypto';

import { fetchWithCache, getCache, getScopedCacheKey, isCacheEnabled } from '../../cache';
import logger from '../../logger';
import {
  type ApiModerationProvider,
  type CallApiContextParams,
  type CallApiOptionsParams,
  inheritProviderCapabilities,
  type ModerationFlag,
  type ProviderModerationResponse,
} from '../../types/providers';
import { awaitProviderOperation, getRequestTimeoutMs } from '../shared';
import { OpenAiGenericProvider } from '.';
import { appendOpenAiApiPath } from './util';

const OPENAI_MODERATION_MODELS = [
  { id: 'omni-moderation-latest', maxTokens: 32768, capabilities: ['text', 'image'] },
  { id: 'omni-moderation-2024-09-26', maxTokens: 32768, capabilities: ['text', 'image'] },
];

type OpenAIModerationModelId = string;

type ModerationCategory =
  | 'sexual'
  | 'sexual/minors'
  | 'harassment'
  | 'harassment/threatening'
  | 'hate'
  | 'hate/threatening'
  | 'illicit'
  | 'illicit/violent'
  | 'self-harm'
  | 'self-harm/intent'
  | 'self-harm/instructions'
  | 'violence'
  | 'violence/graphic';

type OpenAIModerationCategories = Record<ModerationCategory | string, boolean>;
type OpenAIModerationCategoryScores = Record<ModerationCategory | string, number>;
type OpenAIModerationCategoryAppliedInputTypes = Record<
  ModerationCategory | string,
  string[] | undefined
>;

interface OpenAIModerationResult {
  flagged: boolean;
  categories: OpenAIModerationCategories;
  category_scores: OpenAIModerationCategoryScores;
  category_applied_input_types?: OpenAIModerationCategoryAppliedInputTypes;
}

interface OpenAIModerationResponse {
  id: string;
  model: string;
  results: OpenAIModerationResult[];
}

export type TextInput = {
  type: 'text';
  text: string;
};

export type ImageInput = {
  type: 'image_url';
  image_url: {
    url: string;
  };
};

type ModerationInput = string | (TextInput | ImageInput)[];

const OPENAI_MODERATION_CACHE_HASH_KEY = 'promptfoo:openai:moderation-cache-key:v1';
const OPENAI_MODERATION_INFLIGHT_REQUESTS = new Map<string, Promise<OpenAIModerationFetchResult>>();

type OpenAIModerationFetchResult = {
  data: OpenAIModerationResponse;
  status: number;
  statusText: string;
  cached: boolean;
};

function hashModerationCacheValue(value: unknown): string {
  const serialized = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
  return createHmac('sha256', OPENAI_MODERATION_CACHE_HASH_KEY).update(serialized).digest('hex');
}

function getOpenAIModerationAuthCacheNamespace(apiKey: string): string {
  return createHmac('sha256', apiKey).update(OPENAI_MODERATION_CACHE_HASH_KEY).digest('hex');
}

const scopedModerationRequests = new WeakMap<
  AbortSignal,
  Map<string, Promise<OpenAIModerationFetchResult>>
>();

function fetchOpenAIModerationWithDedupe(
  inflightCacheKey: string,
  fetcher: () => Promise<OpenAIModerationFetchResult>,
  abortSignal?: AbortSignal,
): Promise<OpenAIModerationFetchResult> {
  // Requests share work only when their cancellation scope also matches.
  let requests = OPENAI_MODERATION_INFLIGHT_REQUESTS;
  if (abortSignal) {
    requests = scopedModerationRequests.get(abortSignal) ?? new Map();
    scopedModerationRequests.set(abortSignal, requests);
  }
  let inflightRequest = requests.get(inflightCacheKey);
  if (!inflightRequest) {
    inflightRequest = fetcher().finally(() => {
      requests.delete(inflightCacheKey);
    });
    requests.set(inflightCacheKey, inflightRequest);
  }
  return inflightRequest;
}

export function isTextInput(input: TextInput | ImageInput): input is TextInput {
  return input.type === 'text';
}

export function isImageInput(input: TextInput | ImageInput): input is ImageInput {
  return input.type === 'image_url';
}

interface OpenAIModerationConfig {
  apiKey?: string;
  apiKeyEnvar?: string;
  headers?: Record<string, string>;
  passthrough?: Record<string, any>;
}

function parseOpenAIModerationResponse(data: OpenAIModerationResponse): ProviderModerationResponse {
  const { results } = data;

  if (!results || results.length === 0) {
    return { flags: [] };
  }

  // Use a Map to keep track of unique flag codes and their highest confidence score
  const flagMap = new Map<string, number>();

  for (const result of results) {
    if (result.flagged) {
      for (const [category, flagged] of Object.entries(result.categories)) {
        if (flagged) {
          // If this category already exists in our map, keep the higher confidence score
          const existingConfidence = flagMap.get(category);
          const currentConfidence = result.category_scores[category];

          if (existingConfidence === undefined || currentConfidence > existingConfidence) {
            flagMap.set(category, currentConfidence);
          }
        }
      }
    }
  }

  // Convert the map to an array of ModerationFlag objects
  const flags: ModerationFlag[] = Array.from(flagMap.entries()).map(([code, confidence]) => ({
    code,
    description: code,
    confidence,
  }));

  return { flags };
}

function handleApiError(err: any, data?: any): ProviderModerationResponse {
  logger.error('OpenAI moderation API error', {
    error: err instanceof Error ? err.message : String(err),
    hasData: data !== undefined,
    dataLength: typeof data === 'string' ? data.length : undefined,
  });
  return {
    error: data
      ? `API error: ${String(err)}: ${typeof data === 'string' ? data : JSON.stringify(data)}`
      : `API call error: ${String(err)}`,
  };
}

function getModerationCacheKey(
  modelName: string,
  config: any,
  content: ModerationInput,
  identity: { apiKey?: string; apiUrl?: string; organization?: string | undefined } = {},
): string {
  const headers = config?.headers as Record<string, string> | undefined;
  const cacheConfig = {
    ...config,
    apiKey: undefined,
    apiKeyEnvar: undefined,
    apiUrl: identity.apiUrl,
    organization: identity.organization,
    headers:
      headers && Object.keys(headers).length > 0
        ? hashModerationCacheValue(
            Object.keys(headers)
              .sort()
              .map((key) => [key, hashModerationCacheValue(headers[key])]),
          )
        : undefined,
  };

  return `openai:moderation:${modelName}:${hashModerationCacheValue(cacheConfig)}:${identity.apiKey ? getOpenAIModerationAuthCacheNamespace(identity.apiKey) : 'no-api-key'}:${hashModerationCacheValue(content)}`;
}

export function supportsImageInput(modelName: string): boolean {
  const model = OPENAI_MODERATION_MODELS.find((model) => model.id === modelName);
  return model?.capabilities.includes('image') ?? false;
}

export function formatModerationInput(
  content: string | (TextInput | ImageInput)[],
  supportsImages: boolean,
): ModerationInput {
  if (typeof content === 'string') {
    return supportsImages ? [{ type: 'text', text: content }] : content;
  }

  if (!supportsImages) {
    logger.warn('Using image inputs with a text-only moderation model. Images will be ignored.');
    const textContent = content
      .filter(isTextInput)
      .map((item) => item.text)
      .join(' ');
    return textContent;
  }

  return content;
}

export class OpenAiModerationProvider
  extends OpenAiGenericProvider
  implements ApiModerationProvider
{
  static readonly declaredProviderCapabilities = ['callModerationApi'] as const;
  readonly promptfooCapabilities = inheritProviderCapabilities(
    OpenAiModerationProvider.declaredProviderCapabilities,
  );

  static MODERATION_MODELS = OPENAI_MODERATION_MODELS;
  static MODERATION_MODEL_IDS = OPENAI_MODERATION_MODELS.map((model) => model.id);

  constructor(
    modelName: OpenAIModerationModelId = 'omni-moderation-latest',
    options: { config?: OpenAIModerationConfig; id?: string; env?: any } = {},
  ) {
    super(modelName, options);
    if (!OpenAiModerationProvider.MODERATION_MODEL_IDS.includes(modelName)) {
      logger.warn(`Using unknown OpenAI moderation model: ${modelName}`);
    }
  }

  async callModerationApi(
    _userPrompt: string,
    assistantResponse: string | (TextInput | ImageInput)[],
    _context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderModerationResponse> {
    options?.abortSignal?.throwIfAborted();
    const apiKey = this.getApiKey();
    if (this.requiresApiKey() && !apiKey) {
      return handleApiError(this.getMissingApiKeyErrorMessage());
    }

    const useCache = isCacheEnabled();
    const supportsImages = supportsImageInput(this.modelName);
    const input = formatModerationInput(assistantResponse, supportsImages);
    const cacheKey = getModerationCacheKey(this.modelName, this.config, input, {
      apiKey,
      apiUrl: this.getApiUrl(),
      organization: this.getOrganization(),
    });

    if (useCache) {
      const cache = getCache();
      const cachedResponse = await awaitProviderOperation(
        cache.get(cacheKey),
        options?.abortSignal,
      );
      options?.abortSignal?.throwIfAborted();

      if (cachedResponse) {
        logger.debug('Returning cached moderation response');
        return { ...JSON.parse(cachedResponse as string), cached: true };
      }
    }

    logger.debug(`Calling OpenAI moderation API with model ${this.modelName}`);

    const requestBody = JSON.stringify({
      model: this.modelName,
      input,
    });

    const headers = {
      'Content-Type': 'application/json',
      'x-promptfoo-silent': 'true',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...this.getOpenAiRequestHeaders(),
    };

    try {
      const { data, status, statusText } = await fetchOpenAIModerationWithDedupe(
        getScopedCacheKey(cacheKey),
        async () =>
          fetchWithCache<OpenAIModerationResponse>(
            appendOpenAiApiPath(this.getApiUrl(), 'moderations'),
            {
              method: 'POST',
              signal: options?.abortSignal,
              headers,
              body: requestBody,
            },
            getRequestTimeoutMs(),
            'json',
            true,
            this.config.maxRetries,
          ),
        options?.abortSignal,
      );

      if (status < 200 || status >= 300) {
        return handleApiError(
          `${status} ${statusText}`,
          typeof data === 'string' ? data : JSON.stringify(data),
        );
      }

      logger.debug(`\tOpenAI moderation API response: ${JSON.stringify(data)}`);

      const response = parseOpenAIModerationResponse(data);

      if (useCache) {
        options?.abortSignal?.throwIfAborted();
        const cache = getCache();
        await awaitProviderOperation(
          cache.set(cacheKey, JSON.stringify(response)),
          options?.abortSignal,
        );
      }

      options?.abortSignal?.throwIfAborted();
      return response;
    } catch (err) {
      return handleApiError(err);
    }
  }
}
