import type { Cache } from 'cache-manager';
import OpenAI from 'openai';
import { OpenAiGenericProvider } from '.';
import { getCache, isCacheEnabled } from '../../cache';
import logger from '../../logger';
import type {
  ApiModerationProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ModerationFlag,
  ProviderModerationResponse,
  ProviderResponse,
} from '../../types';
import type { EnvOverrides } from '../../types/env';
import { safeJsonStringify } from '../../util/json';
import { ellipsize } from '../../utils/text';
import { REQUEST_TIMEOUT_MS } from '../shared';
import type { OpenAiSharedOptions } from './types';

type OpenAiImageOptions = OpenAiSharedOptions & {
  size?: string;
};

export class OpenAiImageProvider extends OpenAiGenericProvider {
  config: OpenAiImageOptions;

  constructor(
    modelName: string,
    options: { config?: OpenAiImageOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
    this.config = options.config || {};
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const cache = getCache();
    const cacheKey = `openai:image:${safeJsonStringify({ context, prompt })}`;

    if (!this.getApiKey()) {
      throw new Error(
        'OpenAI API key is not set. Set the OPENAI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    const openai = new OpenAI({
      apiKey: this.getApiKey(),
      organization: this.getOrganization(),
      baseURL: this.getApiUrl(),
      maxRetries: 3,
      timeout: REQUEST_TIMEOUT_MS,
      defaultHeaders: this.config.headers,
    });

    let response: OpenAI.Images.ImagesResponse | undefined;
    let cached = false;
    if (isCacheEnabled()) {
      // Try to get the cached response
      const cachedResponse = await cache.get(cacheKey);
      if (cachedResponse) {
        logger.debug(`Retrieved cached response for ${prompt}: ${cachedResponse}`);
        response = JSON.parse(cachedResponse as string) as OpenAI.Images.ImagesResponse;
        cached = true;
      }
    }

    if (!response) {
      response = await openai.images.generate({
        model: this.modelName,
        prompt,
        n: 1,
        size:
          ((this.config.size || process.env.OPENAI_IMAGE_SIZE) as
            | '1024x1024'
            | '256x256'
            | '512x512'
            | '1792x1024'
            | '1024x1792'
            | undefined) || '1024x1024',
      });
    }
    const url = response.data[0].url;
    if (!url) {
      return {
        error: `No image URL found in response: ${JSON.stringify(response)}`,
      };
    }

    if (!cached && isCacheEnabled()) {
      try {
        await cache.set(cacheKey, JSON.stringify(response));
      } catch (err) {
        logger.error(`Failed to cache response: ${String(err)}`);
      }
    }

    const sanitizedPrompt = prompt
      .replace(/\r?\n|\r/g, ' ')
      .replace(/\[/g, '(')
      .replace(/\]/g, ')');
    const ellipsizedPrompt = ellipsize(sanitizedPrompt, 50);
    return {
      output: `![${ellipsizedPrompt}](${url})`,
      cached,
    };
  }
}

export class OpenAiModerationProvider
  extends OpenAiGenericProvider
  implements ApiModerationProvider
{
  async callModerationApi(
    userPrompt: string, // userPrompt is not supported by OpenAI moderation API
    assistantResponse: string,
  ): Promise<ProviderModerationResponse> {
    if (!this.getApiKey()) {
      throw new Error(
        'OpenAI API key is not set. Set the OPENAI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    const openai = new OpenAI({
      apiKey: this.getApiKey(),
      organization: this.getOrganization(),
      baseURL: this.getApiUrl(),
      maxRetries: 3,
      timeout: REQUEST_TIMEOUT_MS,
    });

    let cache: Cache | undefined;
    let cacheKey: string | undefined;
    if (isCacheEnabled()) {
      cache = await getCache();
      cacheKey = `openai:${this.modelName}:${JSON.stringify(
        this.config,
      )}:${userPrompt}:${assistantResponse}`;

      // Try to get the cached response
      const cachedResponse = await cache.get(cacheKey);

      if (cachedResponse) {
        logger.debug(`Returning cached response for ${userPrompt}: ${cachedResponse}`);
        return JSON.parse(cachedResponse as string);
      }
    }

    logger.debug(
      `Calling OpenAI moderation API: prompt [${userPrompt}] assistant [${assistantResponse}]`,
    );
    let moderation: OpenAI.Moderations.ModerationCreateResponse | undefined;
    try {
      moderation = await openai.moderations.create({
        model: this.modelName,
        input: assistantResponse,
      });
    } catch (err) {
      logger.error(`API call error: ${String(err)}`);
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    logger.debug(`\tOpenAI moderation API response: ${JSON.stringify(moderation)}`);
    try {
      const { results } = moderation;

      const flags: ModerationFlag[] = [];
      if (!results) {
        throw new Error('API response error: no results');
      }

      if (cache && cacheKey) {
        await cache.set(cacheKey, JSON.stringify(moderation));
      }

      if (results.length === 0) {
        return { flags };
      }

      for (const result of results) {
        if (result.flagged) {
          for (const [category, flagged] of Object.entries(result.categories)) {
            if (flagged) {
              flags.push({
                code: category,
                description: category,
                confidence:
                  result.category_scores[category as keyof OpenAI.Moderation.CategoryScores],
              });
            }
          }
        }
      }
      return { flags };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(moderation)}`,
      };
    }
  }
}
