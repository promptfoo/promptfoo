import Anthropic from '@anthropic-ai/sdk';
import type { BedrockRuntime } from '@aws-sdk/client-bedrock-runtime';
import dedent from 'dedent';
import { getCache, isCacheEnabled } from '../cache';
import logger from '../logger';
import type {
  ApiProvider,
  ApiEmbeddingProvider,
  EnvOverrides,
  ProviderResponse,
  ProviderEmbeddingResponse,
} from '../types.js';
import { parseMessages } from './anthropic';
import { parseChatPrompt } from './shared';

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

interface BedrockLlamaGenerationOptions extends BedrockOptions {
  temperature?: number;
  top_p?: number;
  max_gen_len?: number;
}

interface BedrockCohereCommandGenerationOptions extends BedrockOptions {
  temperature?: number;
  p?: number;
  k?: number;
  max_tokens?: number;
  stop_sequences?: Array<string>;
  return_likelihoods?: string;
  stream?: boolean;
  num_generations?: number;
  logit_bias?: Record<string, number>;
  truncate?: string;
}

interface BedrockCohereCommandRGenerationOptions extends BedrockOptions {
  message?: string;
  chat_history?: Array<{
    role: 'USER' | 'CHATBOT';
    message: string;
  }>;
  documents?: Array<{
    title: string;
    snippet: string;
  }>;
  search_queries_only?: boolean;
  preamble?: string;
  max_tokens?: number;
  temperature?: number;
  p?: number;
  k?: number;
  prompt_truncation?: string;
  frequency_penalty?: number;
  presence_penalty?: number;
  seed?: number;
  return_prompt?: boolean;
  tools?: Array<{
    name: string;
    description: string;
    parameter_definitions: Record<
      string,
      {
        description: string;
        type: string;
        required: boolean;
      }
    >;
  }>;
  tool_results?: Array<{
    call: {
      name: string;
      parameters: Record<string, string>;
    };
    outputs: Array<{
      text: string;
    }>;
  }>;
  stop_sequences?: Array<string>;
  raw_prompting?: boolean;
}

interface CohereCommandRRequestParams {
  message: string;
  chat_history: {
    role: 'USER' | 'CHATBOT';
    message: string;
  }[];
  documents?: {
    title: string;
    snippet: string;
  }[];
  search_queries_only?: boolean;
  preamble?: string;
  max_tokens?: number;
  temperature?: number;
  p?: number;
  k?: number;
  prompt_truncation?: string;
  frequency_penalty?: number;
  presence_penalty?: number;
  seed?: number;
  return_prompt?: boolean;
  tools?: {
    name: string;
    description: string;
    parameter_definitions: {
      [parameterName: string]: {
        description: string;
        type: string;
        required: boolean;
      };
    };
  }[];
  tool_results?: {
    call: {
      name: string;
      parameters: {
        [parameterName: string]: string;
      };
    };
    outputs: {
      text: string;
    }[];
  }[];
  stop_sequences?: string[];
  raw_prompting?: boolean;
}

interface BedrockMistralGenerationOptions extends BedrockOptions {
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
}

interface IBedrockModel {
  params: (config: BedrockOptions, prompt: string, stop: string[]) => any;
  output: (responseJson: any) => any;
}

export function addConfigParam(
  params: any,
  key: string,
  configValue: any,
  envValue?: string | undefined,
  defaultValue?: any,
) {
  if (configValue !== undefined || envValue !== undefined || defaultValue !== undefined) {
    params[key] =
      configValue ?? (envValue !== undefined ? parseValue(envValue, defaultValue) : defaultValue);
  }
}

export function parseValue(value: string, defaultValue: any) {
  if (typeof defaultValue === 'number') {
    return Number.isNaN(parseFloat(value)) ? defaultValue : parseFloat(value);
  }
  return value;
}

export const getLlamaModelHandler = (ver: number) => {
  return {
    params: (config: BedrockLlamaGenerationOptions, prompt: string) => {
      const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);
      let finalPrompt: string;
      if (messages.length > 0 && messages[0].role === 'system') {
        const userMessages = messages
          .slice(1)
          .map((m) => `${m.content}`)
          .join('\n');

        if (ver == 3) {
          finalPrompt = dedent`<|begin_of_text|><|start_header_id|>system<|end_header_id|>

          ${messages[0].content}<|eot_id|><|start_header_id|>user<|end_header_id|>

          ${userMessages}<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;
        } else {
          finalPrompt = dedent`
          <s>[INST] <<SYS>>
          ${messages[0].content}
          <</SYS>>

          ${userMessages} [/INST]
        `;
        }
      } else {
        const userMessages = messages.map((m) => `${m.content}`).join('\n');
        if (ver == 3) {
          finalPrompt = dedent`<|begin_of_text|><|start_header_id|>user<|end_header_id|>

          ${userMessages}<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;
        } else {
          finalPrompt = `<s>[INST] ${userMessages} [/INST]`;
        }
      }

      const params: { prompt: string; temperature?: number; top_p?: number; max_gen_len?: number } =
        { prompt: finalPrompt };
      addConfigParam(
        params,
        'temperature',
        config?.temperature,
        process.env.AWS_BEDROCK_TEMPERATURE,
        0.01,
      );
      addConfigParam(params, 'top_p', config?.top_p, process.env.AWS_BEDROCK_TOP_P, 1);
      addConfigParam(
        params,
        'max_gen_len',
        config?.max_gen_len,
        process.env.AWS_BEDROCK_MAX_GEN_LEN,
        1024,
      );
      return params;
    },
    output: (responseJson: any) => responseJson?.generation,
  };
};
const BEDROCK_MODEL = {
  CLAUDE_COMPLETION: {
    params: (config: BedrockClaudeLegacyCompletionOptions, prompt: string, stop: string[]) => {
      const params: any = {
        prompt: `${Anthropic.HUMAN_PROMPT} ${prompt} ${Anthropic.AI_PROMPT}`,
        stop_sequences: stop,
      };
      addConfigParam(
        params,
        'max_tokens_to_sample',
        config?.max_tokens_to_sample,
        process.env.AWS_BEDROCK_MAX_TOKENS,
        1024,
      );
      addConfigParam(
        params,
        'temperature',
        config?.temperature,
        process.env.AWS_BEDROCK_TEMPERATURE,
        0,
      );
      return params;
    },
    output: (responseJson: any) => responseJson?.completion,
  },
  CLAUDE_MESSAGES: {
    params: (config: BedrockClaudeMessagesCompletionOptions, prompt: string) => {
      const { system, extractedMessages } = parseMessages(prompt);
      const params: any = { messages: extractedMessages };
      addConfigParam(
        params,
        'max_tokens',
        config?.max_tokens,
        process.env.AWS_BEDROCK_MAX_TOKENS,
        1024,
      );
      addConfigParam(params, 'temperature', config?.temperature, undefined, 0);
      addConfigParam(
        params,
        'anthropic_version',
        config?.anthropic_version,
        undefined,
        'bedrock-2023-05-31',
      );
      addConfigParam(params, 'system', system, undefined, undefined);
      return params;
    },
    output: (responseJson: any) => responseJson?.content[0].text,
  },
  TITAN_TEXT: {
    params: (config: BedrockTextGenerationOptions, prompt: string, stop: string[]) => {
      const textGenerationConfig: any = {};
      addConfigParam(
        textGenerationConfig,
        'maxTokenCount',
        config?.textGenerationConfig?.maxTokenCount,
        process.env.AWS_BEDROCK_MAX_TOKENS,
        1024,
      );
      addConfigParam(
        textGenerationConfig,
        'temperature',
        config?.textGenerationConfig?.temperature,
        process.env.AWS_BEDROCK_TEMPERATURE,
        0,
      );
      addConfigParam(
        textGenerationConfig,
        'topP',
        config?.textGenerationConfig?.topP,
        process.env.AWS_BEDROCK_TOP_P,
        1,
      );
      addConfigParam(
        textGenerationConfig,
        'stopSequences',
        config?.textGenerationConfig?.stopSequences,
        undefined,
        stop,
      );
      return { inputText: prompt, textGenerationConfig };
    },
    output: (responseJson: any) => responseJson?.results[0]?.outputText,
  },
  LLAMA2: getLlamaModelHandler(2),
  LLAMA3: getLlamaModelHandler(3), // Prompt format of llama3 instruct differs from llama2.
  COHERE_COMMAND: {
    params: (config: BedrockCohereCommandGenerationOptions, prompt: string, stop: string[]) => {
      const params: any = { prompt: prompt };
      addConfigParam(params, 'temperature', config?.temperature, process.env.COHERE_TEMPERATURE, 0);
      addConfigParam(params, 'p', config?.p, process.env.COHERE_P, 1);
      addConfigParam(params, 'k', config?.k, process.env.COHERE_K, 0);
      addConfigParam(params, 'max_tokens', config?.max_tokens, process.env.COHERE_MAX_TOKENS, 1024);
      addConfigParam(params, 'return_likelihoods', config?.return_likelihoods, undefined, 'NONE');
      addConfigParam(params, 'stream', config?.stream, undefined, false);
      addConfigParam(params, 'num_generations', config?.num_generations, undefined, 1);
      addConfigParam(params, 'logit_bias', config?.logit_bias, undefined, {});
      addConfigParam(params, 'truncate', config?.truncate, undefined, 'NONE');
      addConfigParam(params, 'stop_sequences', stop, undefined, undefined);
      return params;
    },
    output: (responseJson: any) => responseJson?.generations[0]?.text,
  },
  COHERE_COMMAND_R: {
    params: (config: BedrockCohereCommandRGenerationOptions, prompt: string, stop: string[]) => {
      const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);
      const lastMessage = messages[messages.length - 1].content;
      if (!messages.every((m) => typeof m.content === 'string')) {
        throw new Error(`Message content must be a string, but got: ${JSON.stringify(messages)}`);
      }
      const params: CohereCommandRRequestParams = {
        message: lastMessage as string,
        chat_history: messages.slice(0, messages.length - 1).map((m) => ({
          role: m.role === 'assistant' ? 'CHATBOT' : 'USER',
          message: m.content as string,
        })),
      };
      addConfigParam(params, 'documents', config?.documents);
      addConfigParam(params, 'search_queries_only', config?.search_queries_only);
      addConfigParam(params, 'preamble', config?.preamble);
      addConfigParam(params, 'max_tokens', config?.max_tokens);
      addConfigParam(params, 'temperature', config?.temperature);
      addConfigParam(params, 'p', config?.p);
      addConfigParam(params, 'k', config?.k);
      addConfigParam(params, 'prompt_truncation', config?.prompt_truncation);
      addConfigParam(params, 'frequency_penalty', config?.frequency_penalty);
      addConfigParam(params, 'presence_penalty', config?.presence_penalty);
      addConfigParam(params, 'seed', config?.seed);
      addConfigParam(params, 'return_prompt', config?.return_prompt);
      addConfigParam(params, 'tools', config?.tools);
      addConfigParam(params, 'tool_results', config?.tool_results);
      addConfigParam(params, 'stop_sequences', stop);
      addConfigParam(params, 'raw_prompting', config?.raw_prompting);
      return params;
    },
    output: (responseJson: any) => responseJson?.text,
  },
  MISTRAL: {
    params: (config: BedrockMistralGenerationOptions, prompt: string, stop: string[]) => {
      const params: any = { prompt: prompt, stop: stop };
      addConfigParam(
        params,
        'max_tokens',
        config?.max_tokens,
        process.env.MISTRAL_MAX_TOKENS,
        1024,
      );
      addConfigParam(
        params,
        'temperature',
        config?.temperature,
        process.env.MISTRAL_TEMPERATURE,
        0,
      );
      addConfigParam(params, 'top_p', config?.top_p, process.env.MISTRAL_TOP_P, 1);
      addConfigParam(params, 'top_k', config?.top_k, process.env.MISTRAL_TOP_K, 0);
      return params;
    },
    output: (responseJson: any) => responseJson?.outputs[0]?.text,
  },
};

const AWS_BEDROCK_MODELS: Record<string, IBedrockModel> = {
  'amazon.titan-text-express-v1': BEDROCK_MODEL.TITAN_TEXT,
  'amazon.titan-text-lite-v1': BEDROCK_MODEL.TITAN_TEXT,
  'amazon.titan-text-premier-v1:0': BEDROCK_MODEL.TITAN_TEXT,
  'anthropic.claude-3-5-sonnet-20240620-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'anthropic.claude-3-haiku-20240307-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'anthropic.claude-3-opus-20240229-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'anthropic.claude-3-sonnet-20240229-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'anthropic.claude-instant-v1': BEDROCK_MODEL.CLAUDE_COMPLETION,
  'anthropic.claude-v1': BEDROCK_MODEL.CLAUDE_COMPLETION,
  'anthropic.claude-v2:1': BEDROCK_MODEL.CLAUDE_COMPLETION,
  'anthropic.claude-v2': BEDROCK_MODEL.CLAUDE_COMPLETION,
  'cohere.command-light-text-v14': BEDROCK_MODEL.COHERE_COMMAND,
  'cohere.command-r-plus-v1:0': BEDROCK_MODEL.COHERE_COMMAND_R,
  'cohere.command-r-v1:0': BEDROCK_MODEL.COHERE_COMMAND_R,
  'cohere.command-text-v14': BEDROCK_MODEL.COHERE_COMMAND,
  'meta.llama2-13b-chat-v1': BEDROCK_MODEL.LLAMA2,
  'meta.llama2-70b-chat-v1': BEDROCK_MODEL.LLAMA2,
  'meta.llama3-70b-instruct-v1:0': BEDROCK_MODEL.LLAMA3,
  'meta.llama3-8b-instruct-v1:0': BEDROCK_MODEL.LLAMA3,
  'mistral.mistral-7b-instruct-v0:2': BEDROCK_MODEL.MISTRAL,
  'mistral.mistral-large-2402-v1:0': BEDROCK_MODEL.MISTRAL,
  'mistral.mistral-small-2402-v1:0': BEDROCK_MODEL.MISTRAL,
  'mistral.mixtral-8x7b-instruct-v0:1': BEDROCK_MODEL.MISTRAL,
};

// See https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html
function getHandlerForModel(modelName: string) {
  const ret = AWS_BEDROCK_MODELS[modelName];
  if (ret) {
    return ret;
  }
  if (modelName.startsWith('anthropic.claude')) {
    return BEDROCK_MODEL.CLAUDE_MESSAGES;
  }
  if (modelName.startsWith('meta.llama2')) {
    return BEDROCK_MODEL.LLAMA2;
  }
  if (modelName.startsWith('meta.llama3')) {
    return BEDROCK_MODEL.LLAMA3;
  }
  if (modelName.startsWith('cohere.command-r')) {
    return BEDROCK_MODEL.COHERE_COMMAND_R;
  }
  if (modelName.startsWith('cohere.command')) {
    return BEDROCK_MODEL.COHERE_COMMAND;
  }
  if (modelName.startsWith('mistral.')) {
    return BEDROCK_MODEL.MISTRAL;
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
      let handler;
      // set from https://www.npmjs.com/package/proxy-agent
      if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
        try {
          const { NodeHttpHandler } = await import('@smithy/node-http-handler');
          const { ProxyAgent } = await import('proxy-agent');
          handler = new NodeHttpHandler({ httpsAgent: new ProxyAgent() });
        } catch (err) {
          throw new Error(
            `The @smithy/node-http-handler package is required as a peer dependency. Please install it in your project or globally.`,
          );
        }
      }
      try {
        const { BedrockRuntime } = await import('@aws-sdk/client-bedrock-runtime');
        const bedrock = new BedrockRuntime({
          region: this.getRegion(),
          ...(handler ? { requestHandler: handler } : {}),
        });
        this.bedrock = bedrock;
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
      stop = process.env.AWS_BEDROCK_STOP ? JSON.parse(process.env.AWS_BEDROCK_STOP) : [];
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
    logger.debug(
      `\tAmazon Bedrock API response: ${JSON.stringify(JSON.parse(response.body.transformToString()))}`,
    );
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
    const params = this.modelName.includes('cohere.embed')
      ? {
          texts: [text],
        }
      : {
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
      // Titan Text API returns embeddings in the `embedding` field
      // Cohere API returns embeddings in the `embeddings` field
      const embedding = data?.embedding || data?.embeddings;
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
