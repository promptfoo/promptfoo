import type { Cache } from 'cache-manager';
import Replicate from 'replicate';
import { getCache, isCacheEnabled } from '../cache';
import { getEnvString, getEnvFloat, getEnvInt } from '../envars';
import logger from '../logger';
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
import { safeJsonStringify } from '../util/json';
import { ellipsize } from '../utils/text';
import { parseChatPrompt } from './shared';

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

export class ReplicateProvider implements ApiProvider {
  modelName: string;
  apiKey?: string;
  replicate: any;
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

    const replicate = new Replicate({
      auth: this.apiKey,
      fetch: fetch as any,
    });

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
        input: {
          ...this.config,
          ...Object.fromEntries(Object.entries(inputOptions).filter(([_, v]) => v !== undefined)),
        },
      };
      response = await replicate.run(this.modelName as any, data);
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
    logger.debug(`\tReplicate API response: ${JSON.stringify(response)}`);
    try {
      let formattedOutput;
      if (Array.isArray(response)) {
        if (response.length === 0 || typeof response[0] === 'string') {
          formattedOutput = response.join('');
        } else {
          formattedOutput = JSON.stringify(response);
        }
      } else if (typeof response === 'string') {
        formattedOutput = response;
      } else {
        formattedOutput = JSON.stringify(response);
      }

      const result = {
        output: formattedOutput,
        tokenUsage: {}, // TODO: add token usage once Replicate API supports it
      };
      if (cache && cacheKey) {
        await cache.set(cacheKey, JSON.stringify(result));
      }
      return result;
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(response)}`,
      };
    }
  }
}

const LLAMAGUARD_DESCRIPTIONS: { [key: string]: string } = {
  S1: 'Violent Crimes',
  S2: 'Non-Violent Crimes',
  S3: 'Sex-Related Crimes',
  S4: 'Child Sexual Exploitation',
  S5: 'Specialized Advice',
  S6: 'Privacy',
  S7: 'Intellectual Property',
  S8: 'Indiscriminate Weapons',
  S9: 'Hate',
  S10: 'Suicide & Self-Harm',
  S11: 'Sexual Content',
};

export class ReplicateModerationProvider
  extends ReplicateProvider
  implements ApiModerationProvider
{
  async callModerationApi(prompt: string, assistant: string): Promise<ProviderModerationResponse> {
    if (!this.apiKey) {
      throw new Error(
        'Replicate API key is not set. Set the REPLICATE_API_TOKEN environment variable or or add `apiKey` to the provider config.',
      );
    }

    let cache: Cache | undefined;
    let cacheKey: string | undefined;
    if (isCacheEnabled()) {
      cache = await getCache();
      cacheKey = `replicate:${this.modelName}:${JSON.stringify(
        this.config,
      )}:${prompt}:${assistant}`;

      // Try to get the cached response
      const cachedResponse = await cache.get(cacheKey);

      if (cachedResponse) {
        logger.debug(`Returning cached response for ${prompt}: ${cachedResponse}`);
        return JSON.parse(cachedResponse as string);
      }
    }

    const replicate = new Replicate({
      auth: this.apiKey,
      fetch: fetch as any,
    });

    logger.debug(`Calling Replicate moderation API: prompt [${prompt}] assistant [${assistant}]`);
    let output: string | undefined;
    try {
      const data = {
        input: {
          prompt,
          assistant,
        },
      };
      const resp = await replicate.run(this.modelName as any, data);
      // Replicate SDK seems to be mis-typed for this type of model.
      output = resp as unknown as string;
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
    logger.debug(`\tReplicate moderation API response: ${JSON.stringify(output)}`);
    try {
      if (!output) {
        throw new Error('API response error: no output');
      }
      const [safeString, codes] = output.split('\n');
      const saveCache = async () => {
        if (cache && cacheKey) {
          await cache.set(cacheKey, JSON.stringify(output));
        }
      };

      const flags: ModerationFlag[] = [];
      if (safeString === 'safe') {
        await saveCache();
      } else {
        const splits = codes.split(',');
        for (const code of splits) {
          if (LLAMAGUARD_DESCRIPTIONS[code]) {
            flags.push({
              code,
              description: `${LLAMAGUARD_DESCRIPTIONS[code]} (${code})`,
              confidence: 1,
            });
          }
        }
      }
      return { flags };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(output)}`,
      };
    }
  }
}

export const DefaultModerationProvider = new ReplicateModerationProvider(
  'meta/meta-llama-guard-2-8b:b063023ee937f28e922982abdbf97b041ffe34ad3b35a53d33e1d74bb19b36c4',
);

interface ReplicateImageOptions {
  width?: number;
  height?: number;
  refine?: string;
  apply_watermark?: boolean;
  num_inference_steps?: number;
}

export class ReplicateImageProvider extends ReplicateProvider {
  config: ReplicateImageOptions;

  constructor(
    modelName: string,
    options: { config?: ReplicateImageOptions; id?: string; env?: EnvOverrides } = {},
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
    const cacheKey = `replicate:image:${safeJsonStringify({ context, prompt })}`;

    if (!this.apiKey) {
      throw new Error(
        'Replicate API key is not set. Set the REPLICATE_API_TOKEN environment variable or add `apiKey` to the provider config.',
      );
    }

    const replicate = new Replicate({
      auth: this.apiKey,
    });

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
      const data = {
        input: {
          width: this.config.width || 768,
          height: this.config.height || 768,
          prompt,
        },
      };
      response = await replicate.run(this.modelName as any, data);
    }

    const url = response[0];
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
