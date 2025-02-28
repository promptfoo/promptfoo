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

// Define category names as a union type
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

// Simplified type definitions using mapped types
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

// Type guards for better type safety
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

// Standalone utility functions

/**
 * Parse OpenAI moderation API response into standardized format
 */
function parseOpenAIModerationResponse(data: OpenAIModerationResponse): ProviderModerationResponse {
  const { results } = data;

  if (!results || results.length === 0) {
    return { flags: [] };
  }

  const flags: ModerationFlag[] = [];
  for (const result of results) {
    if (result.flagged) {
      for (const [category, flagged] of Object.entries(result.categories)) {
        if (flagged) {
          const appliedTo = result.category_applied_input_types?.[category];
          flags.push({
            code: category,
            description: category + (appliedTo ? ` (applied to: ${appliedTo.join(', ')})` : ''),
            confidence: result.category_scores[category],
          });
        }
      }
    }
  }

  return { flags };
}

/**
 * Format API error response
 */
function handleApiError(err: any, data?: any): ProviderModerationResponse {
  logger.error(`API error: ${String(err)}`);
  return {
    error: data
      ? `API error: ${String(err)}: ${typeof data === 'string' ? data : JSON.stringify(data)}`
      : `API call error: ${String(err)}`,
  };
}

/**
 * Generate cache key for a moderation request
 */
function getModerationCacheKey(
  modelName: string,
  config: any,
  content: string | (TextInput | ImageInput)[],
): string {
  const contentKey = typeof content === 'string' ? content : JSON.stringify(content);
  return `openai:moderation:${modelName}:${JSON.stringify(config)}:${contentKey}`;
}

/**
 * Check if the moderation model supports image input
 */
export function supportsImageInput(modelName: string): boolean {
  const model = OPENAI_MODERATION_MODELS.find((model) => model.id === modelName);
  return model?.capabilities.includes('image') ?? false;
}

/**
 * Format content based on model capabilities
 */
export function formatModerationInput(
  content: string | (TextInput | ImageInput)[],
  supportsImages: boolean,
): ModerationInput {
  // For string input, wrap in array if model supports images
  if (typeof content === 'string') {
    return supportsImages ? [{ type: 'text', text: content }] : content;
  }

  // For array input, filter out images if model doesn't support them
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
    // Validate API key
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return handleApiError(
        'OpenAI API key is not set. Set the OPENAI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    // Check if caching is enabled
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

    // Prepare request payload
    const supportsImages = supportsImageInput(this.modelName);
    const input = formatModerationInput(assistantResponse, supportsImages);
    const requestBody = JSON.stringify({
      model: this.modelName,
      input,
    });

    // Prepare headers with authentication
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(this.getOrganization() ? { 'OpenAI-Organization': this.getOrganization() } : {}),
      ...this.config.headers,
    };

    try {
      // Make API request
      const { data, status, statusText } = await fetchWithCache(
        `${this.getApiUrl()}/moderations`,
        {
          method: 'POST',
          headers,
          body: requestBody,
        },
        REQUEST_TIMEOUT_MS,
      );

      // Handle error responses
      if (status < 200 || status >= 300) {
        return handleApiError(
          `${status} ${statusText}`,
          typeof data === 'string' ? data : JSON.stringify(data),
        );
      }

      logger.debug(`\tOpenAI moderation API response: ${JSON.stringify(data)}`);

      // Parse successful response
      const response = parseOpenAIModerationResponse(data);

      // Save to cache for future requests
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
