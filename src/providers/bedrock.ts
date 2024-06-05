import Anthropic from '@anthropic-ai/sdk';

import logger from '../logger';
import { getCache, isCacheEnabled } from '../cache';
import { parseMessages } from './anthropic';

import type { BedrockRuntime } from '@aws-sdk/client-bedrock-runtime';

import type {
  ApiProvider,
  ApiEmbeddingProvider,
  EnvOverrides,
  ProviderResponse,
  ProviderEmbeddingResponse,
} from '../types.js';

interface BedrockOptions {
  region?: string;
}

interface TextGenerationOptions {
  maxTokenCount?: number;
  stopSequences?: Array<string>;
  temperature?: number;
  topP?: number;
}

interface BedrockTextGenerationOptions extends BedrockOptions {
  textGenerationConfig?: TextGenerationOptions;
}

interface BedrockClaudeLegacyCompletionOptions extends BedrockOptions {
  max_tokens_to_sample?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
}

interface BedrockClaudeMessagesCompletionOptions extends BedrockOptions {
  max_tokens?: number;
  temperature?: number;
  anthropic_version?: string;
}

interface IBedrockModel {
  params: (config: BedrockOptions, prompt: string, stop: string[]) => any;
  output: (responseJson: any) => any;
}

const BEDROCK_MODEL = {
  CLAUDE_COMPLETION: {
    params: (config: BedrockClaudeLegacyCompletionOptions, prompt: string, stop: string[]) => ({
      prompt: `${Anthropic.HUMAN_PROMPT} ${prompt} ${Anthropic.AI_PROMPT}`,
      max_tokens_to_sample:
        config?.max_tokens_to_sample || parseInt(process.env.AWS_BEDROCK_MAX_TOKENS || '1024'),
      temperature: config.temperature ?? parseFloat(process.env.AWS_BEDROCK_TEMPERATURE || '0'),
      stop_sequences: stop,
    }),
    output: (responseJson: any) => {
      return responseJson?.completion;
    },
  },
  CLAUDE_MESSAGES: {
    params: (config: BedrockClaudeMessagesCompletionOptions, prompt: string, stop: string[]) => {
      const { system, extractedMessages } = parseMessages(prompt);
      return {
        max_tokens: config?.max_tokens || parseInt(process.env.AWS_BEDROCK_MAX_TOKENS || '1024'),
        temperature: config.temperature || 0,
        anthropic_version: config.anthropic_version || 'bedrock-2023-05-31',
        messages: extractedMessages,
        ...(system ? { system } : {}),
      };
    },
    output: (responseJson: any) => {
      return responseJson?.content[0].text;
    },
  },
  TITAN_TEXT: {
    params: (config: BedrockTextGenerationOptions, prompt: string, stop: string[]) => ({
      inputText: prompt,
      textGenerationConfig: {
        maxTokenCount:
          config?.textGenerationConfig?.maxTokenCount ||
          parseInt(process.env.AWS_BEDROCK_MAX_TOKENS || '1024'),
        temperature:
          config?.textGenerationConfig?.temperature ||
          parseFloat(process.env.AWS_BEDROCK_TEMPERATURE || '0'),
        topP:
          config?.textGenerationConfig?.topP || parseFloat(process.env.AWS_BEDROCK_TOP_P || '1'),
        stopSequences: config?.textGenerationConfig?.stopSequences || stop,
      },
    }),
    output: (responseJson: any) => {
      return responseJson?.results[0]?.outputText;
    },
  },
};

const AWS_BEDROCK_MODELS: Record<string, IBedrockModel> = {
  'anthropic.claude-instant-v1': BEDROCK_MODEL.CLAUDE_COMPLETION,
  'anthropic.claude-v1': BEDROCK_MODEL.CLAUDE_COMPLETION,
  'anthropic.claude-v2': BEDROCK_MODEL.CLAUDE_COMPLETION,
  'anthropic.claude-v2:1': BEDROCK_MODEL.CLAUDE_COMPLETION,
  'amazon.titan-text-lite-v1': BEDROCK_MODEL.TITAN_TEXT,
  'amazon.titan-text-express-v1': BEDROCK_MODEL.TITAN_TEXT,
  'amazon.titan-text-premier-v1:0': BEDROCK_MODEL.TITAN_TEXT,
};

function getHandlerForModel(modelName: string) {
  const ret = AWS_BEDROCK_MODELS[modelName];
  if (ret) {
    return ret;
  }
  if (modelName.startsWith('anthropic.claude')) {
    return BEDROCK_MODEL.CLAUDE_MESSAGES;
  }
  throw new Error(`Unknown Amazon Bedrock model: ${modelName}`);
}

export abstract class AwsBedrockGenericProvider {
  modelName: string;
  env?: EnvOverrides;
  bedrock?: BedrockRuntime;
  config: BedrockOptions;

  constructor(
    modelName: string,
    options: { config?: BedrockOptions; id?: string; env?: EnvOverrides } = {},
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

  toString(): string {
    return `[Amazon Bedrock Provider ${this.modelName}]`;
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

  getRegion(): string {
    return (
      this.config?.region ||
      this.env?.AWS_BEDROCK_REGION ||
      process.env.AWS_BEDROCK_REGION ||
      'us-west-2'
    );
  }
}

export class AwsBedrockCompletionProvider extends AwsBedrockGenericProvider implements ApiProvider {
  static AWS_BEDROCK_COMPLETION_MODELS = Object.keys(AWS_BEDROCK_MODELS);

  async callApi(prompt: string): Promise<ProviderResponse> {
    let stop: string[];
    try {
      stop = process.env.AWS_BEDROCK_STOP
        ? JSON.parse(process.env.AWS_BEDROCK_STOP)
        : ['<|im_end|>', '<|endoftext|>'];
    } catch (err) {
      throw new Error(`BEDROCK_STOP is not a valid JSON string: ${err}`);
    }

    let model = getHandlerForModel(this.modelName);
    if (!model) {
      logger.warn(
        `Unknown Amazon Bedrock model: ${this.modelName}. Assuming its API is Claude-like.`,
      );
      model = BEDROCK_MODEL.CLAUDE_MESSAGES;
    }
    const params = model.params(this.config, prompt, stop);

    logger.debug(`Calling Amazon Bedrock API: ${JSON.stringify(params)}`);

    const cache = await getCache();
    const cacheKey = `bedrock:${JSON.stringify(params)}`;

    if (isCacheEnabled()) {
      // Try to get the cached response
      const cachedResponse = await cache.get(cacheKey);
      if (cachedResponse) {
        logger.debug(`Returning cached response for ${prompt}: ${cachedResponse}`);
        return {
          output: model.output(JSON.parse(cachedResponse as string)),
          tokenUsage: {},
        };
      }
    }

    const bedrockInstance = await this.getBedrockInstance();
    let response;
    try {
      response = await bedrockInstance.invokeModel({
        modelId: this.modelName,
        accept: 'application/json',
        contentType: 'application/json',
        body: JSON.stringify(params),
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
        output: model.output(JSON.parse(response.body.transformToString())),
        tokenUsage: {}, // TODO: add token usage once Amazon Bedrock API supports it
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(response)}`,
      };
    }
  }
}

export class AwsBedrockEmbeddingProvider
  extends AwsBedrockGenericProvider
  implements ApiEmbeddingProvider
{
  async callApi(): Promise<ProviderEmbeddingResponse> {
    throw new Error('callApi is not implemented for embedding provider');
  }

  async callEmbeddingApi(text: string): Promise<ProviderEmbeddingResponse> {
    const params = {
      inputText: text,
    };

    logger.debug(`Calling AWS Bedrock API for embeddings: ${JSON.stringify(params)}`);
    let response;
    try {
      const bedrockInstance = await this.getBedrockInstance();
      response = await bedrockInstance.invokeModel({
        modelId: this.modelName,
        accept: 'application/json',
        contentType: 'application/json',
        body: JSON.stringify(params),
      });
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
    logger.debug(
      `\tAWS Bedrock API response (embeddings): ${JSON.stringify(
        response.body.transformToString(),
      )}`,
    );

    try {
      const data = JSON.parse(response.body.transformToString());
      const embedding = data?.embedding;
      if (!embedding) {
        throw new Error('No embedding found in AWS Bedrock API response');
      }
      return {
        embedding,
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(
          response.body.transformToString(),
        )}`,
      };
    }
  }
}
