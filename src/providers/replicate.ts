import { getCache, isCacheEnabled, fetchWithCache } from '../cache';
import { getEnvFloat, getEnvInt, getEnvString } from '../envars';
import logger from '../logger';
import { REQUEST_TIMEOUT_MS } from '../providers/shared';
import { safeJsonStringify } from '../util/json';
import { ellipsize } from '../util/text';
import { createEmptyTokenUsage } from '../util/tokenUsageUtils';
import { parseChatPrompt } from './shared';

import type {
  ApiModerationProvider,
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ModerationFlag,
  ProviderModerationResponse,
  ProviderResponse,
} from '../types';
import type { EnvOverrides } from '../types/env';

interface ReplicateCompletionOptions {
  apiKey?: string;
  temperature?: number;
  max_length?: number;
  max_new_tokens?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
  repetition_penalty?: number;
  system_prompt?: string;
  stop_sequences?: string;
  seed?: number;

  prompt?: {
    prefix?: string;
    suffix?: string;
  };

  // Any other key-value pairs will be passed to the Replicate API as-is
  [key: string]: any;
}

interface ReplicatePrediction {
  id: string;
  model: string;
  version: string;
  input: Record<string, any>;
  output?: any;
  logs?: string;
  error?: string | null;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  created_at: string;
  started_at?: string;
  completed_at?: string;
  urls: {
    get: string;
    cancel: string;
  };
}

export class ReplicateProvider implements ApiProvider {
  modelName: string;
  apiKey?: string;
  config: ReplicateCompletionOptions;

  constructor(
    modelName: string,
    options: { config?: ReplicateCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.modelName = modelName;
    this.apiKey =
      config?.apiKey ||
      env?.REPLICATE_API_KEY ||
      env?.REPLICATE_API_TOKEN ||
      getEnvString('REPLICATE_API_TOKEN') ||
      getEnvString('REPLICATE_API_KEY');
    this.config = config || {};
    this.id = id ? () => id : this.id;
  }

  id(): string {
    return `replicate:${this.modelName}`;
  }

  toString(): string {
    return `[Replicate Provider ${this.modelName}]`;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'Replicate API key is not set. Set the REPLICATE_API_TOKEN environment variable or or add `apiKey` to the provider config.',
      );
    }

    if (this.config.prompt?.prefix) {
      prompt = this.config.prompt.prefix + prompt;
    }
    if (this.config.prompt?.suffix) {
      prompt = prompt + this.config.prompt.suffix;
    }

    let cache;
    let cacheKey;
    if (isCacheEnabled()) {
      cache = await getCache();
      cacheKey = `replicate:${this.modelName}:${JSON.stringify(this.config)}:${prompt}`;

      // Try to get the cached response
      const cachedResponse = await cache.get(cacheKey);

      if (cachedResponse) {
        logger.debug(`Returning cached response for ${prompt}: ${cachedResponse}`);
        return JSON.parse(cachedResponse as string);
      }
    }

    const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);
    const systemPrompt =
      messages.find((message) => message.role === 'system')?.content ||
      this.config.system_prompt ||
      getEnvString('REPLICATE_SYSTEM_PROMPT');
    const userPrompt = messages.find((message) => message.role === 'user')?.content || prompt;

    logger.debug(`Calling Replicate: ${prompt}`);
    let response;
    try {
      const inputOptions = {
        max_length: this.config.max_length || getEnvInt('REPLICATE_MAX_LENGTH'),
        max_new_tokens: this.config.max_new_tokens || getEnvInt('REPLICATE_MAX_NEW_TOKENS'),
        temperature: this.config.temperature || getEnvFloat('REPLICATE_TEMPERATURE'),
        top_p: this.config.top_p || getEnvFloat('REPLICATE_TOP_P'),
        top_k: this.config.top_k || getEnvInt('REPLICATE_TOP_K'),
        repetition_penalty:
          this.config.repetition_penalty || getEnvFloat('REPLICATE_REPETITION_PENALTY'),
        stop_sequences: this.config.stop_sequences || getEnvString('REPLICATE_STOP_SEQUENCES'),
        seed: this.config.seed || getEnvInt('REPLICATE_SEED'),
        system_prompt: systemPrompt,
        prompt: userPrompt,
      };

      const data = {
        version: this.modelName.includes(':') ? this.modelName.split(':')[1] : undefined,
        input: {
          ...this.config,
          ...Object.fromEntries(Object.entries(inputOptions).filter(([_, v]) => v !== undefined)),
        },
      };

      // Create prediction with sync mode (wait up to 60 seconds)
      const createResponse = await fetchWithCache(
        this.modelName.includes(':')
          ? 'https://api.replicate.com/v1/predictions'
          : `https://api.replicate.com/v1/models/${this.modelName}/predictions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            Prefer: 'wait=60',
          },
          body: JSON.stringify(data),
        },
        REQUEST_TIMEOUT_MS,
        'json',
      );

      response = createResponse.data as ReplicatePrediction;

      // If still processing, poll for completion
      if (response.status === 'starting' || response.status === 'processing') {
        response = await this.pollForCompletion(response.id);
      }

      if (response.status === 'failed') {
        throw new Error(response.error || 'Prediction failed');
      }

      response = response.output;
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
    logger.debug(`\tReplicate API response: ${JSON.stringify(response)}`);

    if (typeof response === 'string') {
      // It's text
      return {
        output: response,
        tokenUsage: createEmptyTokenUsage(),
      };
    } else if (Array.isArray(response)) {
      // It's a list of generative outputs
      if (response.every((item) => typeof item === 'string')) {
        const output = response.join('');
        const ret = {
          output,
          tokenUsage: createEmptyTokenUsage(),
        };
        if (cache && cacheKey) {
          try {
            await cache.set(cacheKey, JSON.stringify(ret));
          } catch (err) {
            logger.error(`Failed to cache response: ${String(err)}`);
          }
        }
        return ret;
      }
    }

    logger.error('Unsupported response from Replicate: ' + JSON.stringify(response));
    return {
      error: 'Unsupported response from Replicate: ' + JSON.stringify(response),
    };
  }

  protected async pollForCompletion(predictionId: string): Promise<ReplicatePrediction> {
    const maxPolls = 30; // Max 30 seconds of polling
    const pollInterval = 1000; // 1 second

    for (let i = 0; i < maxPolls; i++) {
      const pollResponse = await fetchWithCache(
        `https://api.replicate.com/v1/predictions/${predictionId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        },
        REQUEST_TIMEOUT_MS,
        'json',
        false, // Don't cache polling requests
      );

      const prediction = pollResponse.data as ReplicatePrediction;

      if (
        prediction.status === 'succeeded' ||
        prediction.status === 'failed' ||
        prediction.status === 'canceled'
      ) {
        return prediction;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error('Prediction timed out');
  }
}

// Map of LlamaGuard category codes to descriptions
// Supports both LlamaGuard 3 (S1-S13) and LlamaGuard 4 (S1-S14)
export const LLAMAGUARD_DESCRIPTIONS: Record<string, string> = {
  S1: 'Violent Crimes',
  S2: 'Non-Violent Crimes',
  S3: 'Sex Crimes',
  S4: 'Child Exploitation',
  S5: 'Defamation',
  S6: 'Specialized Advice',
  S7: 'Privacy',
  S8: 'Intellectual Property',
  S9: 'Indiscriminate Weapons',
  S10: 'Hate',
  S11: 'Self-Harm',
  S12: 'Sexual Content',
  S13: 'Elections',
  S14: 'Code Interpreter Abuse', // LlamaGuard 4 only
};

export class ReplicateModerationProvider
  extends ReplicateProvider
  implements ApiModerationProvider
{
  async callModerationApi(prompt: string, assistant: string): Promise<ProviderModerationResponse> {
    try {
      const response = await this.callApi(`Human: ${prompt}\n\nAssistant: ${assistant}`);
      if (response.error) {
        return { error: response.error };
      }

      const { output } = response;
      if (!output || typeof output !== 'string') {
        return { error: `Invalid moderation response: ${JSON.stringify(output)}` };
      }

      // Parse the LlamaGuard output format
      const lines = output.trim().split('\n');
      const verdict = lines[0];

      if (verdict === 'safe') {
        return { flags: [] };
      }

      // Parse unsafe categories
      const flags: ModerationFlag[] = [];
      // LlamaGuard may return categories on the second line as comma-separated values
      if (lines.length > 1) {
        const categoriesLine = lines[1].trim();
        const categories = categoriesLine.split(',').map((cat) => cat.trim());
        for (const category of categories) {
          if (category && LLAMAGUARD_DESCRIPTIONS[category]) {
            flags.push({
              code: category,
              description: LLAMAGUARD_DESCRIPTIONS[category],
              confidence: 1.0,
            });
          }
        }
      }

      return { flags };
    } catch (err) {
      return { error: `Invalid moderation response: ${String(err)}` };
    }
  }
}

// LlamaGuard 4 is the preferred default on Replicate
// LlamaGuard 4 adds S14: Code Interpreter Abuse category for enhanced safety
export const LLAMAGUARD_4_MODEL_ID = 'meta/llama-guard-4-12b';
export const LLAMAGUARD_3_MODEL_ID =
  'meta/llama-guard-3-8b:146d1220d447cdcc639bc17c5f6137416042abee6ae153a2615e6ef5749205c8';

export const DefaultModerationProvider = new ReplicateModerationProvider(
  LLAMAGUARD_4_MODEL_ID, // Using LlamaGuard 4 as the default
);

export class ReplicateImageProvider extends ReplicateProvider {
  constructor(
    modelName: string,
    options: { config?: ReplicateCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const cache = getCache();
    const cacheKey = `replicate:image:${safeJsonStringify({ context, prompt })}`;

    if (!this.apiKey) {
      throw new Error(
        'Replicate API key is not set. Set the REPLICATE_API_TOKEN environment variable or add `apiKey` to the provider config.',
      );
    }

    let response: any | undefined;
    let cached = false;
    if (isCacheEnabled()) {
      const cachedResponse = await cache.get(cacheKey);
      if (cachedResponse) {
        logger.debug(`Retrieved cached response for ${prompt}: ${cachedResponse}`);
        response = JSON.parse(cachedResponse as string);
        cached = true;
      }
    }

    if (!response) {
      const input: any = {
        prompt,
        width: this.config.width || 768,
        height: this.config.height || 768,
      };

      // Add other config options, excluding internal ones
      Object.keys(this.config).forEach((key) => {
        if (!['apiKey', 'width', 'height'].includes(key)) {
          input[key] = this.config[key];
        }
      });

      const data: any = { input };

      // Only add version if it's provided explicitly
      if (this.modelName.includes(':')) {
        data.version = this.modelName.split(':')[1];
      }

      // Create prediction with sync mode
      const createResponse = await fetchWithCache(
        this.modelName.includes(':')
          ? 'https://api.replicate.com/v1/predictions'
          : `https://api.replicate.com/v1/models/${this.modelName}/predictions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            Prefer: 'wait=60',
          },
          body: JSON.stringify(data),
        },
        REQUEST_TIMEOUT_MS,
        'json',
      );

      let prediction = createResponse.data as ReplicatePrediction;

      logger.debug(`Initial prediction status: ${prediction.status}, ID: ${prediction.id}`);

      // If still processing, poll for completion
      if (prediction.status === 'starting' || prediction.status === 'processing') {
        prediction = await this.pollForCompletion(prediction.id);
      }

      logger.debug(
        `Final prediction status: ${prediction.status}, output: ${JSON.stringify(prediction.output)}`,
      );

      if (prediction.status === 'failed') {
        return {
          error: prediction.error || 'Image generation failed',
        };
      }

      response = prediction.output;
    }

    // Handle various response formats
    if (!response) {
      return {
        error: 'No output received from Replicate',
      };
    }

    let url: string | undefined;
    if (Array.isArray(response) && response.length > 0) {
      url = response[0];
    } else if (typeof response === 'string') {
      url = response;
    }

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
