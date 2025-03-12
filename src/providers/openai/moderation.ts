import { OpenAiGenericProvider } from '.';
import { fetchWithCache, getCache, isCacheEnabled } from '../../cache';
import logger from '../../logger';
import type {
  ApiModerationProvider,
  ModerationFlag,
  ProviderModerationResponse,
} from '../../types';
import { REQUEST_TIMEOUT_MS } from '../shared';

export const OPENAI_MODERATION_MODELS = [
  { id: 'omni-moderation-latest', maxTokens: 32768, capabilities: ['text', 'image'] },
  { id: 'omni-moderation-2024-09-26', maxTokens: 32768, capabilities: ['text', 'image'] },
  { id: 'text-moderation-latest', maxTokens: 32768, capabilities: ['text'] },
  { id: 'text-moderation-stable', maxTokens: 32768, capabilities: ['text'] },
  { id: 'text-moderation-007', maxTokens: 32768, capabilities: ['text'] },
];

export type OpenAIModerationModelId = string;

export type ModerationCategory =
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

export type ModerationInput = string | (TextInput | ImageInput)[];

export function isTextInput(input: TextInput | ImageInput): input is TextInput {
  return input.type === 'text';
}

export function isImageInput(input: TextInput | ImageInput): input is ImageInput {
  return input.type === 'image_url';
}

export interface OpenAIModerationConfig {
  apiKey?: string;
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
  logger.error(`API error: ${String(err)}`);
  return {
    error: data
      ? `API error: ${String(err)}: ${typeof data === 'string' ? data : JSON.stringify(data)}`
      : `API call error: ${String(err)}`,
  };
}

function getModerationCacheKey(
  modelName: string,
  config: any,
  content: string | (TextInput | ImageInput)[],
): string {
  const contentKey = typeof content === 'string' ? content : JSON.stringify(content);
  return `openai:moderation:${modelName}:${JSON.stringify(config)}:${contentKey}`;
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
  static MODERATION_MODELS = OPENAI_MODERATION_MODELS;
  static MODERATION_MODEL_IDS = OPENAI_MODERATION_MODELS.map((model) => model.id);

  constructor(
    modelName: OpenAIModerationModelId = 'text-moderation-latest',
    options: { config?: OpenAIModerationConfig; id?: string; env?: any } = {},
  ) {
    super(modelName, options);
    if (!OpenAiModerationProvider.MODERATION_MODEL_IDS.includes(modelName)) {
      logger.warn(`Using unknown OpenAI moderation model: ${modelName}`);
    }
  }

  async callModerationApi(
    userPrompt: string,
    assistantResponse: string | (TextInput | ImageInput)[],
  ): Promise<ProviderModerationResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return handleApiError(
        'OpenAI API key is not set. Set the OPENAI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    const useCache = isCacheEnabled();
    let cacheKey = '';

    if (useCache) {
      cacheKey = getModerationCacheKey(this.modelName, this.config, assistantResponse);
      const cache = await getCache();
      const cachedResponse = await cache.get(cacheKey);

      if (cachedResponse) {
        logger.debug('Returning cached moderation response');
        return JSON.parse(cachedResponse as string);
      }
    }

    logger.debug(`Calling OpenAI moderation API with model ${this.modelName}`);

    const supportsImages = supportsImageInput(this.modelName);
    const input = formatModerationInput(assistantResponse, supportsImages);
    const requestBody = JSON.stringify({
      model: this.modelName,
      input,
    });

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(this.getOrganization() ? { 'OpenAI-Organization': this.getOrganization() } : {}),
      ...this.config.headers,
    };

    try {
      const { data, status, statusText } = await fetchWithCache(
        `${this.getApiUrl()}/moderations`,
        {
          method: 'POST',
          headers,
          body: requestBody,
        },
        REQUEST_TIMEOUT_MS,
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
        const cache = await getCache();
        await cache.set(cacheKey, JSON.stringify(response));
      }

      return response;
    } catch (err) {
      return handleApiError(err);
    }
  }
}
