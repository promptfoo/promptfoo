import Anthropic from '@anthropic-ai/sdk';

import logger from '../logger';
import { getCache, isCacheEnabled } from '../cache';

import type { BedrockRuntime } from '@aws-sdk/client-bedrock-runtime';

import type { ApiProvider, EnvOverrides, ProviderResponse } from '../types.js';

interface BedrockCompletionOptions {
  region?: string;
  max_tokens_to_sample?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
}

export class AwsBedrockCompletionProvider implements ApiProvider {
  static AWS_BEDROCK_COMPLETION_MODELS = [
    'anthropic.claude-instant-v1',
    'anthropic.claude-v1',
    'anthropic.claude-v2',
  ];

  modelName: string;
  config: BedrockCompletionOptions;
  env?: EnvOverrides;
  bedrock?: BedrockRuntime;

  constructor(
    modelName: string,
    options: { config?: BedrockCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.env = env;
    this.modelName = modelName;
    this.config = config || {};
    this.id = id ? () => id : this.id;
  }

  id(): string {
    return `bedrock:${this.modelName}`;
  }

  async getBedrockInstance() {
    if (!this.bedrock) {
      try {
        const { BedrockRuntime } = await import('@aws-sdk/client-bedrock-runtime');
        this.bedrock = new BedrockRuntime({ region: this.getRegion() });
      } catch (err) {
        throw new Error(
          'The @aws-sdk/client-bedrock-runtime package is required as a peer dependency. Please install it in your project or globally.',
        );
      }
    }
    return this.bedrock;
  }

  toString(): string {
    return `[Amazon Bedrock Provider ${this.modelName}]`;
  }

  getRegion(): string {
    return (
      this.config?.region ||
      this.env?.AWS_BEDROCK_REGION ||
      process.env.AWS_BEDROCK_REGION ||
      'us-west-2'
    );
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    let stop: string[];
    try {
      stop = process.env.AWS_BEDROCK_STOP
        ? JSON.parse(process.env.AWS_BEDROCK_STOP)
        : ['<|im_end|>', '<|endoftext|>'];
    } catch (err) {
      throw new Error(`BEDROCK_STOP is not a valid JSON string: ${err}`);
    }

    const params = {
      prompt: `${Anthropic.HUMAN_PROMPT} ${prompt} ${Anthropic.AI_PROMPT}`,
      max_tokens_to_sample:
        this.config?.max_tokens_to_sample || parseInt(process.env.AWS_BEDROCK_MAX_TOKENS || '1024'),
      temperature:
        this.config.temperature ?? parseFloat(process.env.AWS_BEDROCK_TEMPERATURE || '0'),
      stop_sequences: stop,
    };

    logger.debug(`Calling Amazon Bedrock API: ${JSON.stringify(params)}`);

    const cache = await getCache();
    const cacheKey = `bedrock:${JSON.stringify(params)}`;

    if (isCacheEnabled()) {
      // Try to get the cached response
      const cachedResponse = await cache.get(cacheKey);
      if (cachedResponse) {
        logger.debug(`Returning cached response for ${prompt}: ${cachedResponse}`);
        return {
          output: JSON.parse(cachedResponse as string),
          tokenUsage: {},
        };
      }
    }

    const bedrockInstance = await this.getBedrockInstance();
    let response;
    try {
      response = await bedrockInstance.invokeModel({
        body: JSON.stringify(params),
        modelId: this.modelName,
        accept: 'application/json',
        contentType: 'application/json',
      });
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
    logger.debug(`\tAmazon Bedrock API response: ${JSON.parse(response.body.transformToString())}`);
    if (isCacheEnabled()) {
      try {
        await cache.set(cacheKey, response.body.transformToString());
      } catch (err) {
        logger.error(`Failed to cache response: ${String(err)}`);
      }
    }
    try {
      return {
        output: JSON.parse(response.body.transformToString()).completion,
        tokenUsage: {}, // TODO: add token usage once Amazon Bedrock API supports it
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(response)}`,
      };
    }
  }
}
