import Anthropic from '@anthropic-ai/sdk';
import type { BedrockRuntime, Trace } from '@aws-sdk/client-bedrock-runtime';
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@aws-sdk/types';
import dedent from 'dedent';
import type { Agent } from 'http';
import { getCache, isCacheEnabled } from '../../cache';
import { getEnvFloat, getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import telemetry from '../../telemetry';
import type { EnvOverrides } from '../../types/env';
import type {
  ApiEmbeddingProvider,
  ApiProvider,
  CallApiContextParams,
  ProviderEmbeddingResponse,
  ProviderResponse,
} from '../../types/providers';
import type { TokenUsage } from '../../types/shared';
import { maybeLoadToolsFromExternalFile } from '../../util';
import { outputFromMessage, parseMessages } from '../anthropic/util';
import { parseChatPrompt } from '../shared';
import { novaOutputFromMessage, novaParseMessages } from './util';

// Utility function to coerce string values to numbers
export const coerceStrToNum = (value: string | number | undefined): number | undefined =>
  value === undefined ? undefined : typeof value === 'string' ? Number(value) : value;

interface BedrockOptions {
  accessKeyId?: string;
  profile?: string;
  region?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  guardrailIdentifier?: string;
  guardrailVersion?: string;
  trace?: Trace;
  showThinking?: boolean;
}

export interface TextGenerationOptions {
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

export interface BedrockClaudeMessagesCompletionOptions extends BedrockOptions {
  max_tokens?: number;
  temperature?: number;
  anthropic_version?: string;
  tools?: {
    name: string;
    description: string;
    input_schema: any;
  }[];
  tool_choice?: {
    type: 'any' | 'auto' | 'tool';
    name?: string;
  };
  thinking?: {
    type: 'enabled';
    budget_tokens: number;
  };
}

interface BedrockLlamaGenerationOptions extends BedrockOptions {
  temperature?: number;
  top_p?: number;
  max_gen_len?: number;
  max_new_tokens?: number;
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

export interface BedrockAI21GenerationOptions extends BedrockOptions {
  frequency_penalty?: number;
  max_tokens?: number;
  presence_penalty?: number;
  response_format?: { type: 'json_object' | 'text' };
  stop?: string[];
  temperature?: number;
  top_p?: number;
}

export interface BedrockAmazonNovaGenerationOptions extends BedrockOptions {
  interfaceConfig?: {
    max_new_tokens?: number;
    temperature?: number;
    top_p?: number;
    top_k?: number;
    stopSequences?: string[];
  };
  toolConfig?: {
    tools?: {
      toolSpec: {
        name: string;
        description?: string;
        inputSchema: {
          json: {
            type: 'object';
            properties: {
              [propertyName: string]: {
                description: string;
                type: string;
              };
            };
            required: string[];
          };
        };
      };
    }[];
    toolChoice?: {
      any?: any;
      auto?: any;
      tool?: {
        name: string;
      };
    };
  };
}

export type ContentType = 'AUDIO' | 'TEXT' | 'TOOL';

export type AudioMediaType = 'audio/wav' | 'audio/lpcm' | 'audio/mulaw' | 'audio/mpeg';
export type TextMediaType = 'text/plain' | 'application/json';

export interface AudioConfiguration {
  readonly mediaType: AudioMediaType;
  readonly sampleRateHertz: number;
  readonly sampleSizeBits: number;
  readonly channelCount: number;
  readonly encoding: string;
  readonly audioType: 'SPEECH';
}

export interface TextConfiguration {
  readonly contentType: ContentType;
  readonly mediaType: TextMediaType;
}

export interface BedrockAmazonNovaSonicGenerationOptions extends BedrockOptions {
  interfaceConfig?: {
    max_new_tokens?: number;
    temperature?: number;
    top_p?: number;
    top_k?: number;
    stopSequences?: string[];
  };
  audioInputConfiguration?: Omit<AudioConfiguration, 'voiceId'>;
  audioOutputConfiguration?: Omit<AudioConfiguration, 'mediaType'> & {
    mediaType: 'audio/lpcm';
    voiceId?: 'matthew' | 'tiffany' | 'amy';
  };
  textInputConfiguration?: TextConfiguration;
  textOutputConfiguration?: Omit<TextConfiguration, 'mediaType'> & {
    mediaType: 'text/plain';
  };
  toolConfig?: {
    tools?: {
      toolSpec: {
        name: string;
        description?: string;
        inputSchema: {
          json: {
            type: 'object';
            properties: {
              [propertyName: string]: {
                description: string;
                type: string;
              };
            };
            required: string[];
          };
        };
      };
    }[];
    toolChoice?: 'any' | 'auto' | string; // Tool name
  };
}

export interface BedrockDeepseekGenerationOptions extends BedrockOptions {
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string[];
}

export interface IBedrockModel {
  params: (config: BedrockOptions, prompt: string, stop: string[], modelName?: string) => any;
  output: (config: BedrockOptions, responseJson: any) => any;
  tokenUsage?: (responseJson: any, promptText: string) => TokenUsage;
}

export function parseValue(value: string | number, defaultValue: any) {
  if (typeof defaultValue === 'number') {
    if (typeof value === 'string') {
      return Number.isNaN(Number.parseFloat(value)) ? defaultValue : Number.parseFloat(value);
    }
    return value;
  }
  return value;
}

export function addConfigParam(
  params: any,
  key: string,
  configValue: any,
  envValue?: string | number | undefined,
  defaultValue?: any,
) {
  if (configValue !== undefined || envValue !== undefined || defaultValue !== undefined) {
    params[key] =
      configValue ?? (envValue === undefined ? defaultValue : parseValue(envValue, defaultValue));
  }
}

export enum LlamaVersion {
  V2 = 2,
  V3 = 3,
  V3_1 = 3.1,
  V3_2 = 3.2,
  V3_3 = 3.3,
  V4 = 4,
}

export interface LlamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// see https://github.com/meta-llama/llama/blob/main/llama/generation.py#L284-L395
export const formatPromptLlama2Chat = (messages: LlamaMessage[]): string => {
  if (messages.length === 0) {
    return '';
  }

  let formattedPrompt = '<s>';
  let systemMessageIncluded = false;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];

    switch (message.role) {
      case 'system':
        if (!systemMessageIncluded) {
          formattedPrompt += `[INST] <<SYS>>\n${message.content.trim()}\n<</SYS>>\n\n`;
          systemMessageIncluded = true;
        }
        break;

      case 'user':
        if (i === 0 && !systemMessageIncluded) {
          formattedPrompt += `[INST] ${message.content.trim()} [/INST]`;
        } else if (i === 0 && systemMessageIncluded) {
          formattedPrompt += `${message.content.trim()} [/INST]`;
        } else if (i > 0 && messages[i - 1].role === 'assistant') {
          formattedPrompt += `<s>[INST] ${message.content.trim()} [/INST]`;
        } else {
          formattedPrompt += `${message.content.trim()} [/INST]`;
        }
        break;

      case 'assistant':
        formattedPrompt += ` ${message.content.trim()} </s>`;
        break;

      default:
        throw new Error(`Unexpected role: ${message.role}`);
    }
  }

  return formattedPrompt;
};

export const formatPromptLlama3Instruct = (messages: LlamaMessage[]): string => {
  let formattedPrompt = '<|begin_of_text|>';

  for (const message of messages) {
    formattedPrompt += dedent`
      <|start_header_id|>${message.role}<|end_header_id|>

      ${message.content.trim()}<|eot_id|>`;
  }

  formattedPrompt += '<|start_header_id|>assistant<|end_header_id|>';
  return formattedPrompt;
};

// Llama 4 format uses different tags
export const formatPromptLlama4 = (messages: LlamaMessage[]): string => {
  let formattedPrompt = '<|begin_of_text|>';

  for (const message of messages) {
    formattedPrompt += dedent`<|header_start|>${message.role}<|header_end|>

${message.content.trim()}<|eot|>`;
  }

  // Add assistant header for completion
  formattedPrompt += '<|header_start|>assistant<|header_end|>';
  return formattedPrompt;
};

export const getLlamaModelHandler = (version: LlamaVersion) => {
  if (
    ![
      LlamaVersion.V2,
      LlamaVersion.V3,
      LlamaVersion.V3_1,
      LlamaVersion.V3_2,
      LlamaVersion.V3_3,
      LlamaVersion.V4,
    ].includes(version)
  ) {
    throw new Error(`Unsupported LLAMA version: ${version}`);
  }

  return {
    params: (
      config: BedrockLlamaGenerationOptions,
      prompt: string,
      stop?: string[],
      modelName?: string,
    ) => {
      const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);

      let finalPrompt: string;
      switch (version) {
        case LlamaVersion.V2:
          finalPrompt = formatPromptLlama2Chat(messages as LlamaMessage[]);
          break;
        case LlamaVersion.V3:
        case LlamaVersion.V3_1:
        case LlamaVersion.V3_2:
        case LlamaVersion.V3_3:
          finalPrompt = formatPromptLlama3Instruct(messages as LlamaMessage[]);
          break;
        case LlamaVersion.V4:
          finalPrompt = formatPromptLlama4(messages as LlamaMessage[]);
          break;
        default:
          throw new Error(`Unsupported LLAMA version: ${version}`);
      }
      const params: { prompt: string; temperature?: number; top_p?: number; max_gen_len?: number } =
        {
          prompt: finalPrompt,
        };
      addConfigParam(
        params,
        'temperature',
        config?.temperature,
        getEnvFloat('AWS_BEDROCK_TEMPERATURE'),
        0,
      );
      addConfigParam(params, 'top_p', config?.top_p, getEnvFloat('AWS_BEDROCK_TOP_P'), 1);
      addConfigParam(
        params,
        'max_gen_len',
        config?.max_gen_len,
        getEnvInt('AWS_BEDROCK_MAX_GEN_LEN'),
        1024,
      );
      return params;
    },
    output: (config: BedrockOptions, responseJson: any) => responseJson?.generation,
    tokenUsage: (responseJson: any, promptText: string): TokenUsage => {
      if (responseJson?.usage) {
        return {
          prompt: coerceStrToNum(responseJson.usage.prompt_tokens),
          completion: coerceStrToNum(responseJson.usage.completion_tokens),
          total: coerceStrToNum(responseJson.usage.total_tokens),
          numRequests: 1,
        };
      }

      // Check for Llama-specific token count fields
      const promptTokens = responseJson?.prompt_token_count;
      const completionTokens = responseJson?.generation_token_count;

      if (promptTokens !== undefined && completionTokens !== undefined) {
        const promptTokensNum = coerceStrToNum(promptTokens);
        const completionTokensNum = coerceStrToNum(completionTokens);

        return {
          prompt: promptTokensNum,
          completion: completionTokensNum,
          total: (promptTokensNum ?? 0) + (completionTokensNum ?? 0),
          numRequests: 1,
        };
      }

      // Return undefined values when token counts aren't provided by the API
      return {
        prompt: undefined,
        completion: undefined,
        total: undefined,
        numRequests: 1,
      };
    },
  };
};

export const BEDROCK_MODEL = {
  AI21: {
    params: (
      config: BedrockAI21GenerationOptions,
      prompt: string,
      stop?: string[],
      modelName?: string,
    ) => {
      const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);
      const params: any = {
        messages,
      };
      addConfigParam(
        params,
        'max_tokens',
        config?.max_tokens,
        getEnvInt('AWS_BEDROCK_MAX_TOKENS'),
        undefined,
      );
      addConfigParam(
        params,
        'temperature',
        config?.temperature,
        getEnvFloat('AWS_BEDROCK_TEMPERATURE'),
        0,
      );
      addConfigParam(params, 'top_p', config?.top_p, getEnvFloat('AWS_BEDROCK_TOP_P'), 1.0);
      addConfigParam(params, 'stop', config?.stop, getEnvString('AWS_BEDROCK_STOP'));
      addConfigParam(
        params,
        'frequency_penalty',
        config?.frequency_penalty,
        getEnvFloat('AWS_BEDROCK_FREQUENCY_PENALTY'),
      );
      addConfigParam(
        params,
        'presence_penalty',
        config?.presence_penalty,
        getEnvFloat('AWS_BEDROCK_PRESENCE_PENALTY'),
      );
      return params;
    },
    output: (config: BedrockOptions, responseJson: any) => {
      if (responseJson.error) {
        throw new Error(`AI21 API error: ${responseJson.error}`);
      }
      return responseJson.choices?.[0]?.message?.content;
    },
    tokenUsage: (responseJson: any, promptText: string): TokenUsage => {
      if (responseJson?.usage) {
        return {
          prompt: coerceStrToNum(responseJson.usage.prompt_tokens),
          completion: coerceStrToNum(responseJson.usage.completion_tokens),
          total: coerceStrToNum(responseJson.usage.total_tokens),
          numRequests: 1,
        };
      }

      // Return undefined values when token counts aren't provided by the API
      return {
        prompt: undefined,
        completion: undefined,
        total: undefined,
        numRequests: 1,
      };
    },
  },
  AMAZON_NOVA: {
    params: (
      config: BedrockAmazonNovaGenerationOptions,
      prompt: string,
      stop?: string[],
      modelName?: string,
    ) => {
      let messages;
      let systemPrompt;
      try {
        const parsed = JSON.parse(prompt);
        if (Array.isArray(parsed)) {
          messages = parsed
            .map((msg) => ({
              role: msg.role,
              content: Array.isArray(msg.content) ? msg.content : [{ text: msg.content }],
            }))
            .filter((msg) => msg.role !== 'system');
          const systemMessage = parsed.find((msg) => msg.role === 'system');
          if (systemMessage) {
            systemPrompt = [{ text: systemMessage.content }];
          }
        } else {
          const { system, extractedMessages } = novaParseMessages(prompt);
          messages = extractedMessages;
          if (system) {
            systemPrompt = [{ text: system }];
          }
        }
      } catch {
        const { system, extractedMessages } = novaParseMessages(prompt);
        messages = extractedMessages;
        if (system) {
          systemPrompt = [{ text: system }];
        }
      }

      const params: any = { messages };
      if (systemPrompt) {
        addConfigParam(params, 'system', systemPrompt, undefined, undefined);
      }

      const inferenceConfig: any = config.interfaceConfig ? { ...config.interfaceConfig } : {};
      addConfigParam(
        inferenceConfig,
        'max_new_tokens',
        config?.interfaceConfig?.max_new_tokens,
        getEnvInt('AWS_BEDROCK_MAX_TOKENS'),
        undefined,
      );
      addConfigParam(
        inferenceConfig,
        'temperature',
        config?.interfaceConfig?.temperature,
        getEnvFloat('AWS_BEDROCK_TEMPERATURE'),
        0,
      );

      addConfigParam(params, 'inferenceConfig', inferenceConfig, undefined, undefined);
      addConfigParam(params, 'toolConfig', config.toolConfig, undefined, undefined);

      return params;
    },
    output: (config: BedrockOptions, responseJson: any) => novaOutputFromMessage(responseJson),
    tokenUsage: (responseJson: any, promptText: string): TokenUsage => {
      const usage = responseJson?.usage;
      if (!usage) {
        return {
          prompt: undefined,
          completion: undefined,
          total: undefined,
          numRequests: 1,
        };
      }

      return {
        prompt: coerceStrToNum(usage.inputTokens),
        completion: coerceStrToNum(usage.outputTokens),
        total: coerceStrToNum(usage.totalTokens),
        numRequests: 1,
      };
    },
  },
  CLAUDE_COMPLETION: {
    params: (
      config: BedrockClaudeLegacyCompletionOptions,
      prompt: string,
      stop: string[],
      modelName?: string,
    ) => {
      const params: any = {
        prompt: `${Anthropic.HUMAN_PROMPT} ${prompt} ${Anthropic.AI_PROMPT}`,
        stop_sequences: stop,
      };
      addConfigParam(
        params,
        'max_tokens_to_sample',
        config?.max_tokens_to_sample,
        getEnvInt('AWS_BEDROCK_MAX_TOKENS'),
        1024,
      );
      addConfigParam(
        params,
        'temperature',
        config?.temperature,
        getEnvFloat('AWS_BEDROCK_TEMPERATURE'),
        0,
      );
      return params;
    },
    output: (config: BedrockOptions, responseJson: any) => responseJson?.completion,
    tokenUsage: (responseJson: any, promptText: string): TokenUsage => {
      if (!responseJson?.usage) {
        return {
          prompt: undefined,
          completion: undefined,
          total: undefined,
          numRequests: 1,
        };
      }

      const usage = responseJson.usage;

      // Get input tokens
      const inputTokens = usage.input_tokens || usage.prompt_tokens;
      const inputTokensNum = coerceStrToNum(inputTokens);

      // Get output tokens
      const outputTokens = usage.output_tokens || usage.completion_tokens;
      const outputTokensNum = coerceStrToNum(outputTokens);

      // Get or calculate total tokens
      let totalTokens = usage.totalTokens || usage.total_tokens;
      if (totalTokens == null && inputTokensNum !== undefined && outputTokensNum !== undefined) {
        totalTokens = inputTokensNum + outputTokensNum;
      }

      return {
        prompt: inputTokensNum,
        completion: outputTokensNum,
        total: coerceStrToNum(totalTokens),
        numRequests: 1,
      };
    },
  },
  CLAUDE_MESSAGES: {
    params: (
      config: BedrockClaudeMessagesCompletionOptions,
      prompt: string,
      stop?: string[],
      modelName?: string,
    ) => {
      let messages;
      let systemPrompt;
      try {
        const parsed = JSON.parse(prompt);
        if (Array.isArray(parsed)) {
          const systemMessages = parsed.filter((msg) => msg.role === 'system');
          const nonSystemMessages = parsed.filter((msg) => msg.role !== 'system');

          // NOTE: Claude models handle system prompts differently than OpenAI models.
          // For compatibility with prompts designed for OpenAI like the factuality
          // llm-as-a-judge prompts, we convert lone system messages into user messages
          // since Bedrock Claude doesn't support system-only prompts.
          if (systemMessages.length === 1 && nonSystemMessages.length === 0) {
            // If only system message, convert to user message
            messages = [
              {
                role: 'user',
                content: Array.isArray(systemMessages[0].content)
                  ? systemMessages[0].content
                  : [{ type: 'text', text: systemMessages[0].content }],
              },
            ];
            systemPrompt = undefined;
          } else {
            // Normal case - keep system message as system prompt
            messages = nonSystemMessages.map((msg) => ({
              role: msg.role,
              content: Array.isArray(msg.content)
                ? msg.content
                : [{ type: 'text', text: msg.content }],
            }));
            systemPrompt = systemMessages[0]?.content;
          }
        } else {
          const { system, extractedMessages } = parseMessages(prompt);
          messages = extractedMessages;
          systemPrompt = system;
        }
      } catch {
        const { system, extractedMessages } = parseMessages(prompt);
        messages = extractedMessages;
        systemPrompt = system;
      }

      const params: any = { messages };
      addConfigParam(
        params,
        'anthropic_version',
        config?.anthropic_version,
        undefined,
        'bedrock-2023-05-31',
      );
      addConfigParam(
        params,
        'max_tokens',
        config?.max_tokens,
        getEnvInt('AWS_BEDROCK_MAX_TOKENS'),
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
      addConfigParam(
        params,
        'tools',
        maybeLoadToolsFromExternalFile(config?.tools),
        undefined,
        undefined,
      );
      addConfigParam(params, 'tool_choice', config?.tool_choice, undefined, undefined);
      addConfigParam(params, 'thinking', config?.thinking, undefined, undefined);
      if (systemPrompt) {
        addConfigParam(params, 'system', systemPrompt, undefined, undefined);
      }

      return params;
    },
    output: (config: BedrockClaudeMessagesCompletionOptions, responseJson: any) => {
      return outputFromMessage(responseJson, config?.showThinking ?? true);
    },
    tokenUsage: (responseJson: any, promptText: string): TokenUsage => {
      if (!responseJson?.usage) {
        return {
          prompt: undefined,
          completion: undefined,
          total: undefined,
          numRequests: 1,
        };
      }

      const usage = responseJson.usage;

      // Get input tokens
      const inputTokens = usage.input_tokens || usage.prompt_tokens;
      const inputTokensNum = coerceStrToNum(inputTokens);

      // Get output tokens
      const outputTokens = usage.output_tokens || usage.completion_tokens;
      const outputTokensNum = coerceStrToNum(outputTokens);

      // Get or calculate total tokens
      let totalTokens = usage.totalTokens || usage.total_tokens;
      if (
        (totalTokens === null || totalTokens === undefined) &&
        inputTokensNum !== undefined &&
        outputTokensNum !== undefined
      ) {
        totalTokens = inputTokensNum + outputTokensNum;
      }

      return {
        prompt: inputTokensNum,
        completion: outputTokensNum,
        total: coerceStrToNum(totalTokens),
        numRequests: 1,
      };
    },
  },
  TITAN_TEXT: {
    params: (
      config: BedrockTextGenerationOptions,
      prompt: string,
      stop?: string[],
      modelName?: string,
    ) => {
      const textGenerationConfig: any = {};
      addConfigParam(
        textGenerationConfig,
        'maxTokenCount',
        config?.textGenerationConfig?.maxTokenCount,
        getEnvInt('AWS_BEDROCK_MAX_TOKENS'),
        1024,
      );
      addConfigParam(
        textGenerationConfig,
        'temperature',
        config?.textGenerationConfig?.temperature,
        getEnvFloat('AWS_BEDROCK_TEMPERATURE'),
        0,
      );
      addConfigParam(
        textGenerationConfig,
        'topP',
        config?.textGenerationConfig?.topP,
        getEnvFloat('AWS_BEDROCK_TOP_P'),
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
    output: (config: BedrockOptions, responseJson: any) => responseJson?.results[0]?.outputText,
    tokenUsage: (responseJson: any, promptText: string): TokenUsage => {
      // If token usage is provided by the API, use it
      if (responseJson?.usage) {
        return {
          prompt: coerceStrToNum(responseJson.usage.prompt_tokens),
          completion: coerceStrToNum(responseJson.usage.completion_tokens),
          total: coerceStrToNum(responseJson.usage.total_tokens),
          numRequests: 1,
        };
      }

      // Return undefined values when token counts aren't provided by the API
      return {
        prompt: undefined,
        completion: undefined,
        total: undefined,
        numRequests: 1,
      };
    },
  },
  LLAMA2: getLlamaModelHandler(LlamaVersion.V2),
  LLAMA3: getLlamaModelHandler(LlamaVersion.V3),
  LLAMA3_1: getLlamaModelHandler(LlamaVersion.V3_1),
  LLAMA3_2: getLlamaModelHandler(LlamaVersion.V3_2),
  LLAMA3_3: getLlamaModelHandler(LlamaVersion.V3_3),
  LLAMA4: getLlamaModelHandler(LlamaVersion.V4),
  COHERE_COMMAND: {
    params: (
      config: BedrockCohereCommandGenerationOptions,
      prompt: string,
      stop?: string[],
      modelName?: string,
    ) => {
      const params: any = { prompt };
      addConfigParam(
        params,
        'temperature',
        config?.temperature,
        getEnvFloat('COHERE_TEMPERATURE'),
        0,
      );
      addConfigParam(params, 'p', config?.p, getEnvFloat('COHERE_P'), 1);
      addConfigParam(params, 'k', config?.k, getEnvInt('COHERE_K'), 0);
      addConfigParam(
        params,
        'max_tokens',
        config?.max_tokens,
        getEnvInt('COHERE_MAX_TOKENS'),
        1024,
      );
      addConfigParam(params, 'return_likelihoods', config?.return_likelihoods, undefined, 'NONE');
      addConfigParam(params, 'stream', config?.stream, undefined, false);
      addConfigParam(params, 'num_generations', config?.num_generations, undefined, 1);
      addConfigParam(params, 'logit_bias', config?.logit_bias, undefined, {});
      addConfigParam(params, 'truncate', config?.truncate, undefined, 'NONE');
      addConfigParam(params, 'stop_sequences', stop, undefined, undefined);
      return params;
    },
    output: (config: BedrockOptions, responseJson: any) => responseJson?.generations[0]?.text,
    tokenUsage: (responseJson: any, promptText: string): TokenUsage => {
      if (responseJson?.meta?.billed_units) {
        const inputTokens = coerceStrToNum(responseJson.meta.billed_units.input_tokens);
        const outputTokens = coerceStrToNum(responseJson.meta.billed_units.output_tokens);

        return {
          prompt: inputTokens,
          completion: outputTokens,
          total: (inputTokens ?? 0) + (outputTokens ?? 0),
          numRequests: 1,
        };
      }

      // Return undefined values when token counts aren't provided by the API
      return {
        prompt: undefined,
        completion: undefined,
        total: undefined,
        numRequests: 1,
      };
    },
  },
  COHERE_COMMAND_R: {
    params: (
      config: BedrockCohereCommandRGenerationOptions,
      prompt: string,
      stop?: string[],
      modelName?: string,
    ) => {
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
      addConfigParam(params, 'tools', maybeLoadToolsFromExternalFile(config?.tools));
      addConfigParam(params, 'tool_results', config?.tool_results);
      addConfigParam(params, 'stop_sequences', stop);
      addConfigParam(params, 'raw_prompting', config?.raw_prompting);
      return params;
    },
    output: (config: BedrockOptions, responseJson: any) => responseJson?.text,
    tokenUsage: (responseJson: any, promptText: string): TokenUsage => {
      if (responseJson?.meta?.billed_units) {
        const inputTokens = coerceStrToNum(responseJson.meta.billed_units.input_tokens);
        const outputTokens = coerceStrToNum(responseJson.meta.billed_units.output_tokens);

        return {
          prompt: inputTokens,
          completion: outputTokens,
          total: (inputTokens ?? 0) + (outputTokens ?? 0),
          numRequests: 1,
        };
      }

      // Return undefined values when token counts aren't provided by the API
      return {
        prompt: undefined,
        completion: undefined,
        total: undefined,
        numRequests: 1,
      };
    },
  },
  DEEPSEEK: {
    params: (
      config: BedrockDeepseekGenerationOptions,
      prompt: string,
      stop?: string[],
      modelName?: string,
    ) => {
      const wrappedPrompt = `
${prompt}
<think>\n`;
      const params: any = {
        prompt: wrappedPrompt,
      };

      addConfigParam(
        params,
        'max_tokens',
        config?.max_tokens,
        getEnvInt('AWS_BEDROCK_MAX_TOKENS'),
        undefined,
      );
      addConfigParam(
        params,
        'temperature',
        config?.temperature,
        getEnvFloat('AWS_BEDROCK_TEMPERATURE'),
        0,
      );
      addConfigParam(params, 'top_p', config?.top_p, getEnvFloat('AWS_BEDROCK_TOP_P'), 1.0);

      return params;
    },
    output: (config: BedrockOptions, responseJson: any) => {
      if (responseJson.error) {
        throw new Error(`DeepSeek API error: ${responseJson.error}`);
      }

      if (responseJson.choices && Array.isArray(responseJson.choices)) {
        const choice = responseJson.choices[0];
        if (choice && choice.text) {
          const fullResponse = choice.text;
          const [thinking, finalResponse] = fullResponse.split('</think>');
          if (!thinking || !finalResponse) {
            return fullResponse;
          }
          if (config.showThinking !== false) {
            return fullResponse;
          }
          return finalResponse.trim();
        }
      }

      return undefined;
    },
    tokenUsage: (responseJson: any, promptText: string): TokenUsage => {
      if (responseJson?.usage) {
        return {
          prompt: coerceStrToNum(responseJson.usage.prompt_tokens),
          completion: coerceStrToNum(responseJson.usage.completion_tokens),
          total: coerceStrToNum(responseJson.usage.total_tokens),
          numRequests: 1,
        };
      }

      // Return undefined values when token counts aren't provided by the API
      return {
        prompt: undefined,
        completion: undefined,
        total: undefined,
        numRequests: 1,
      };
    },
  },
  MISTRAL: {
    params: (
      config: BedrockMistralGenerationOptions,
      prompt: string,
      stop: string[],
      modelName?: string,
    ) => {
      const params: any = { prompt, stop };
      addConfigParam(
        params,
        'max_tokens',
        config?.max_tokens,
        getEnvInt('MISTRAL_MAX_TOKENS'),
        1024,
      );
      addConfigParam(
        params,
        'temperature',
        config?.temperature,
        getEnvFloat('MISTRAL_TEMPERATURE'),
        0,
      );
      addConfigParam(params, 'top_p', config?.top_p, getEnvFloat('MISTRAL_TOP_P'), 1);
      addConfigParam(params, 'top_k', config?.top_k, getEnvFloat('MISTRAL_TOP_K'), 0);

      return params;
    },
    output: (config: BedrockOptions, responseJson: any) => {
      if (!responseJson?.outputs || !Array.isArray(responseJson.outputs)) {
        return undefined;
      }
      return responseJson.outputs[0]?.text;
    },
    tokenUsage: (responseJson: any, promptText: string): TokenUsage => {
      if (responseJson?.usage) {
        return {
          prompt: coerceStrToNum(responseJson.usage.prompt_tokens),
          completion: coerceStrToNum(responseJson.usage.completion_tokens),
          total: coerceStrToNum(responseJson.usage.total_tokens),
          numRequests: 1,
        };
      }

      // Some models may return token information at the root level
      if (
        responseJson?.prompt_tokens !== undefined &&
        responseJson?.completion_tokens !== undefined
      ) {
        const promptTokens = coerceStrToNum(responseJson.prompt_tokens);
        const completionTokens = coerceStrToNum(responseJson.completion_tokens);

        let totalTokens = responseJson.total_tokens;
        if (!totalTokens && promptTokens !== undefined && completionTokens !== undefined) {
          totalTokens = promptTokens + completionTokens;
        }

        return {
          prompt: promptTokens,
          completion: completionTokens,
          total: (promptTokens ?? 0) + (completionTokens ?? 0),
          numRequests: 1,
        };
      }

      // Return undefined values when token counts aren't provided by the API
      return {
        prompt: undefined,
        completion: undefined,
        total: undefined,
        numRequests: 1,
      };
    },
  },
  MISTRAL_LARGE_2407: {
    params: (
      config: BedrockMistralGenerationOptions,
      prompt: string,
      stop: string[],
      modelName?: string,
    ) => {
      const params: any = { prompt, stop };
      addConfigParam(
        params,
        'max_tokens',
        config?.max_tokens,
        getEnvInt('MISTRAL_MAX_TOKENS'),
        1024,
      );
      addConfigParam(
        params,
        'temperature',
        config?.temperature,
        getEnvFloat('MISTRAL_TEMPERATURE'),
        0,
      );
      addConfigParam(params, 'top_p', config?.top_p, getEnvFloat('MISTRAL_TOP_P'), 1);
      // Note: mistral.mistral-large-2407-v1:0 doesn't support top_k parameter

      return params;
    },
    output: (config: BedrockOptions, responseJson: any) => {
      if (responseJson?.choices && Array.isArray(responseJson.choices)) {
        return responseJson.choices[0]?.message?.content;
      }
      return undefined;
    },
    tokenUsage: (responseJson: any, promptText: string): TokenUsage => {
      // Chat completion format (used by mistral-large-2407-v1:0)
      if (
        responseJson?.prompt_tokens !== undefined &&
        responseJson?.completion_tokens !== undefined
      ) {
        const promptTokens = coerceStrToNum(responseJson.prompt_tokens);
        const completionTokens = coerceStrToNum(responseJson.completion_tokens);

        return {
          prompt: promptTokens,
          completion: completionTokens,
          total: (promptTokens ?? 0) + (completionTokens ?? 0),
          numRequests: 1,
        };
      }

      // Handle usage object format
      if (
        responseJson?.usage?.prompt_tokens !== undefined &&
        responseJson?.usage?.completion_tokens !== undefined
      ) {
        const promptTokens = coerceStrToNum(responseJson.usage.prompt_tokens);
        const completionTokens = coerceStrToNum(responseJson.usage.completion_tokens);

        let totalTokens = responseJson.usage.total_tokens;
        if (!totalTokens && promptTokens !== undefined && completionTokens !== undefined) {
          totalTokens = promptTokens + completionTokens;
        }

        return {
          prompt: promptTokens,
          completion: completionTokens,
          total: (promptTokens ?? 0) + (completionTokens ?? 0),
          numRequests: 1,
        };
      }

      // Return undefined values when token counts aren't provided by the API
      return {
        prompt: undefined,
        completion: undefined,
        total: undefined,
        numRequests: 1,
      };
    },
  },
};

export const AWS_BEDROCK_MODELS: Record<string, IBedrockModel> = {
  'ai21.jamba-1-5-large-v1:0': BEDROCK_MODEL.AI21,
  'ai21.jamba-1-5-mini-v1:0': BEDROCK_MODEL.AI21,
  'amazon.nova-lite-v1:0': BEDROCK_MODEL.AMAZON_NOVA,
  'amazon.nova-micro-v1:0': BEDROCK_MODEL.AMAZON_NOVA,
  'amazon.nova-pro-v1:0': BEDROCK_MODEL.AMAZON_NOVA,
  'amazon.nova-premier-v1:0': BEDROCK_MODEL.AMAZON_NOVA,
  'amazon.titan-text-express-v1': BEDROCK_MODEL.TITAN_TEXT,
  'amazon.titan-text-lite-v1': BEDROCK_MODEL.TITAN_TEXT,
  'amazon.titan-text-premier-v1:0': BEDROCK_MODEL.TITAN_TEXT,
  'anthropic.claude-3-5-haiku-20241022-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'anthropic.claude-3-5-sonnet-20240620-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'anthropic.claude-3-5-sonnet-20241022-v2:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'anthropic.claude-3-7-sonnet-20250219-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'anthropic.claude-3-haiku-20240307-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'anthropic.claude-3-opus-20240229-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'anthropic.claude-3-sonnet-20240229-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'anthropic.claude-opus-4-20250514-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'anthropic.claude-sonnet-4-20250514-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'anthropic.claude-instant-v1': BEDROCK_MODEL.CLAUDE_COMPLETION,
  'anthropic.claude-v1': BEDROCK_MODEL.CLAUDE_COMPLETION,
  'anthropic.claude-v2': BEDROCK_MODEL.CLAUDE_COMPLETION,
  'anthropic.claude-v2:1': BEDROCK_MODEL.CLAUDE_COMPLETION,
  'cohere.command-light-text-v14': BEDROCK_MODEL.COHERE_COMMAND,
  'cohere.command-r-plus-v1:0': BEDROCK_MODEL.COHERE_COMMAND_R,
  'cohere.command-r-v1:0': BEDROCK_MODEL.COHERE_COMMAND_R,
  'cohere.command-text-v14': BEDROCK_MODEL.COHERE_COMMAND,
  'deepseek.r1-v1:0': BEDROCK_MODEL.DEEPSEEK,
  'meta.llama2-13b-chat-v1': BEDROCK_MODEL.LLAMA2,
  'meta.llama2-70b-chat-v1': BEDROCK_MODEL.LLAMA2,
  'meta.llama3-1-405b-instruct-v1:0': BEDROCK_MODEL.LLAMA3_1,
  'meta.llama3-1-70b-instruct-v1:0': BEDROCK_MODEL.LLAMA3_1,
  'meta.llama3-1-8b-instruct-v1:0': BEDROCK_MODEL.LLAMA3_1,
  'meta.llama3-2-3b-instruct-v1:0': BEDROCK_MODEL.LLAMA3_2,
  'meta.llama3-70b-instruct-v1:0': BEDROCK_MODEL.LLAMA3,
  'meta.llama3-8b-instruct-v1:0': BEDROCK_MODEL.LLAMA3,
  'meta.llama4-scout-17b-instruct-v1:0': BEDROCK_MODEL.LLAMA4,
  'meta.llama4-maverick-17b-instruct-v1:0': BEDROCK_MODEL.LLAMA4,
  'mistral.mistral-7b-instruct-v0:2': BEDROCK_MODEL.MISTRAL,
  'mistral.mistral-large-2402-v1:0': BEDROCK_MODEL.MISTRAL,
  'mistral.mistral-large-2407-v1:0': BEDROCK_MODEL.MISTRAL_LARGE_2407,
  'mistral.mistral-small-2402-v1:0': BEDROCK_MODEL.MISTRAL,
  'mistral.mixtral-8x7b-instruct-v0:1': BEDROCK_MODEL.MISTRAL,

  // APAC Models
  'apac.amazon.nova-lite-v1:0': BEDROCK_MODEL.AMAZON_NOVA,
  'apac.amazon.nova-micro-v1:0': BEDROCK_MODEL.AMAZON_NOVA,
  'apac.amazon.nova-pro-v1:0': BEDROCK_MODEL.AMAZON_NOVA,
  'apac.amazon.nova-premier-v1:0': BEDROCK_MODEL.AMAZON_NOVA,
  'apac.anthropic.claude-3-5-sonnet-20240620-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'apac.anthropic.claude-3-haiku-20240307-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'apac.anthropic.claude-3-sonnet-20240229-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'apac.anthropic.claude-sonnet-4-20250514-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'apac.meta.llama4-scout-17b-instruct-v1:0': BEDROCK_MODEL.LLAMA4,
  'apac.meta.llama4-maverick-17b-instruct-v1:0': BEDROCK_MODEL.LLAMA4,

  // EU Models
  'eu.amazon.nova-lite-v1:0': BEDROCK_MODEL.AMAZON_NOVA,
  'eu.amazon.nova-micro-v1:0': BEDROCK_MODEL.AMAZON_NOVA,
  'eu.amazon.nova-pro-v1:0': BEDROCK_MODEL.AMAZON_NOVA,
  'eu.amazon.nova-premier-v1:0': BEDROCK_MODEL.AMAZON_NOVA,
  'eu.anthropic.claude-3-5-sonnet-20240620-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'eu.anthropic.claude-3-7-sonnet-20250219-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'eu.anthropic.claude-3-haiku-20240307-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'eu.anthropic.claude-3-sonnet-20240229-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'eu.anthropic.claude-sonnet-4-20250514-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'eu.meta.llama3-2-1b-instruct-v1:0': BEDROCK_MODEL.LLAMA3_2,
  'eu.meta.llama3-2-3b-instruct-v1:0': BEDROCK_MODEL.LLAMA3_2,
  'eu.meta.llama4-scout-17b-instruct-v1:0': BEDROCK_MODEL.LLAMA4,
  'eu.meta.llama4-maverick-17b-instruct-v1:0': BEDROCK_MODEL.LLAMA4,

  // Gov Cloud Models
  'us-gov.anthropic.claude-3-5-sonnet-20240620-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'us-gov.anthropic.claude-3-haiku-20240307-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,

  // US Models
  'us.amazon.nova-lite-v1:0': BEDROCK_MODEL.AMAZON_NOVA,
  'us.amazon.nova-micro-v1:0': BEDROCK_MODEL.AMAZON_NOVA,
  'us.amazon.nova-pro-v1:0': BEDROCK_MODEL.AMAZON_NOVA,
  'us.amazon.nova-premier-v1:0': BEDROCK_MODEL.AMAZON_NOVA,
  'us.anthropic.claude-3-5-haiku-20241022-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'us.anthropic.claude-3-5-sonnet-20240620-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'us.anthropic.claude-3-5-sonnet-20241022-v2:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'us.anthropic.claude-3-7-sonnet-20250219-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'us.anthropic.claude-3-haiku-20240307-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'us.anthropic.claude-3-opus-20240229-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'us.anthropic.claude-3-sonnet-20240229-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'us.anthropic.claude-opus-4-20250514-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'us.anthropic.claude-sonnet-4-20250514-v1:0': BEDROCK_MODEL.CLAUDE_MESSAGES,
  'us.deepseek.r1-v1:0': BEDROCK_MODEL.DEEPSEEK,
  'us.meta.llama3-1-405b-instruct-v1:0': BEDROCK_MODEL.LLAMA3_1,
  'us.meta.llama3-1-70b-instruct-v1:0': BEDROCK_MODEL.LLAMA3_1,
  'us.meta.llama3-1-8b-instruct-v1:0': BEDROCK_MODEL.LLAMA3_1,
  'us.meta.llama3-2-11b-instruct-v1:0': BEDROCK_MODEL.LLAMA3_2,
  'us.meta.llama3-2-1b-instruct-v1:0': BEDROCK_MODEL.LLAMA3_2,
  'us.meta.llama3-2-3b-instruct-v1:0': BEDROCK_MODEL.LLAMA3_2,
  'us.meta.llama3-2-90b-instruct-v1:0': BEDROCK_MODEL.LLAMA3_2,
  'us.meta.llama3-3-70b-instruct-v1:0': BEDROCK_MODEL.LLAMA3_3,
  'us.meta.llama4-scout-17b-instruct-v1:0': BEDROCK_MODEL.LLAMA4,
  'us.meta.llama4-maverick-17b-instruct-v1:0': BEDROCK_MODEL.LLAMA4,
};

// See https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html
function getHandlerForModel(modelName: string) {
  const ret = AWS_BEDROCK_MODELS[modelName];
  if (ret) {
    return ret;
  }
  if (modelName.startsWith('ai21.')) {
    return BEDROCK_MODEL.AI21;
  }
  if (modelName.includes('amazon.nova')) {
    return BEDROCK_MODEL.AMAZON_NOVA;
  }
  if (modelName.includes('anthropic.claude')) {
    return BEDROCK_MODEL.CLAUDE_MESSAGES;
  }
  if (modelName.startsWith('meta.llama2')) {
    return BEDROCK_MODEL.LLAMA2;
  }
  if (modelName.includes('meta.llama3-1')) {
    return BEDROCK_MODEL.LLAMA3_1;
  }
  if (modelName.includes('meta.llama3-2')) {
    return BEDROCK_MODEL.LLAMA3_2;
  }
  if (modelName.includes('meta.llama3-3')) {
    return BEDROCK_MODEL.LLAMA3_3;
  }
  if (modelName.includes('meta.llama4')) {
    return BEDROCK_MODEL.LLAMA4;
  }
  if (modelName.includes('meta.llama3')) {
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
  if (modelName.startsWith('deepseek.')) {
    return BEDROCK_MODEL.DEEPSEEK;
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

    if (this.config.guardrailIdentifier) {
      telemetry.recordAndSendOnce('feature_used', {
        feature: 'guardrail',
        provider: 'bedrock',
      });
    }
  }

  id(): string {
    return `bedrock:${this.modelName}`;
  }

  toString(): string {
    return `[Amazon Bedrock Provider ${this.modelName}]`;
  }

  async getCredentials(): Promise<
    AwsCredentialIdentity | AwsCredentialIdentityProvider | undefined
  > {
    if (this.config.accessKeyId && this.config.secretAccessKey) {
      logger.debug(`Using credentials from config file`);
      return {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
        sessionToken: this.config.sessionToken,
      };
    }
    if (this.config.profile) {
      logger.debug(`Using SSO profile: ${this.config.profile}`);
      const { fromSSO } = await import('@aws-sdk/credential-provider-sso');
      return fromSSO({ profile: this.config.profile });
    }

    logger.debug(`No explicit credentials in config, falling back to AWS default chain`);
    return undefined;
  }

  async getBedrockInstance() {
    if (!this.bedrock) {
      let handler;
      // set from https://www.npmjs.com/package/proxy-agent
      if (getEnvString('HTTP_PROXY') || getEnvString('HTTPS_PROXY')) {
        try {
          const { NodeHttpHandler } = await import('@smithy/node-http-handler');
          const { ProxyAgent } = await import('proxy-agent');
          handler = new NodeHttpHandler({
            httpsAgent: new ProxyAgent() as unknown as Agent,
          });
        } catch {
          throw new Error(
            `The @smithy/node-http-handler package is required as a peer dependency. Please install it in your project or globally.`,
          );
        }
      }
      try {
        const { BedrockRuntime } = await import('@aws-sdk/client-bedrock-runtime');
        const credentials = await this.getCredentials();

        const bedrock = new BedrockRuntime({
          region: this.getRegion(),
          maxAttempts: getEnvInt('AWS_BEDROCK_MAX_RETRIES', 10),
          retryMode: 'adaptive',
          ...(credentials ? { credentials } : {}),
          ...(handler ? { requestHandler: handler } : {}),
        });

        this.bedrock = bedrock;
      } catch (err) {
        logger.error(`Error creating BedrockRuntime: ${err}`);
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
      getEnvString('AWS_BEDROCK_REGION') ||
      'us-east-1'
    );
  }
}

export class AwsBedrockCompletionProvider extends AwsBedrockGenericProvider implements ApiProvider {
  static AWS_BEDROCK_COMPLETION_MODELS = Object.keys(AWS_BEDROCK_MODELS);

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    let stop: string[];
    try {
      stop = getEnvString('AWS_BEDROCK_STOP') ? JSON.parse(getEnvString('AWS_BEDROCK_STOP')!) : [];
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
    const params = model.params(
      { ...this.config, ...context?.prompt.config },
      prompt,
      stop,
      this.modelName,
    );

    logger.debug(`Calling Amazon Bedrock API: ${JSON.stringify(params)}`);

    const cache = await getCache();
    const cacheKey = `bedrock:${this.modelName}:${JSON.stringify(params)}`;

    if (isCacheEnabled()) {
      // Try to get the cached response
      const cachedResponse = await cache.get(cacheKey);
      if (cachedResponse) {
        logger.debug(`Returning cached response for ${prompt}: ${cachedResponse}`);
        return {
          output: model.output(this.config, JSON.parse(cachedResponse as string)),
          tokenUsage: {},
        };
      }
    }

    let response;
    try {
      const bedrockInstance = await this.getBedrockInstance();

      try {
        const testCredentials = await bedrockInstance.config.credentials?.();
        logger.debug(
          `Actual credentials being used: ${
            testCredentials?.accessKeyId
              ? `accessKeyId starts with: ${testCredentials.accessKeyId.substring(0, 4)}...`
              : 'no explicit credentials (using instance metadata)'
          }`,
        );
      } catch (credErr) {
        logger.debug(`Error getting credentials: ${credErr}`);
      }

      response = await bedrockInstance.invokeModel({
        modelId: this.modelName,
        ...(this.config.guardrailIdentifier
          ? { guardrailIdentifier: String(this.config.guardrailIdentifier) }
          : {}),
        ...(this.config.guardrailVersion
          ? { guardrailVersion: String(this.config.guardrailVersion) }
          : {}),
        ...(this.config.trace ? { trace: this.config.trace } : {}),
        accept: 'application/json',
        contentType: 'application/json',
        body: JSON.stringify(params),
      });
    } catch (err) {
      return {
        error: `Bedrock API invoke model error: ${String(err)}`,
      };
    }

    logger.debug(`Amazon Bedrock API response: ${response.body.transformToString()}`);
    if (isCacheEnabled()) {
      try {
        await cache.set(cacheKey, new TextDecoder().decode(response.body));
      } catch (err) {
        logger.error(`Failed to cache response: ${String(err)}`);
      }
    }
    try {
      const output = JSON.parse(new TextDecoder().decode(response.body));

      let tokenUsage: Partial<TokenUsage> = {};
      if (model.tokenUsage) {
        tokenUsage = model.tokenUsage(output, prompt);
        logger.debug(`Token usage from model handler: ${JSON.stringify(tokenUsage)}`);
      } else {
        // Get token counts, converting strings to numbers
        const promptTokens =
          output.usage?.inputTokens ??
          output.usage?.input_tokens ??
          output.usage?.prompt_tokens ??
          output.prompt_tokens ??
          output.prompt_token_count;
        const completionTokens =
          output.usage?.outputTokens ??
          output.usage?.output_tokens ??
          output.usage?.completion_tokens ??
          output.completion_tokens ??
          output.generation_token_count;

        const promptTokensNum = coerceStrToNum(promptTokens);
        const completionTokensNum = coerceStrToNum(completionTokens);

        // Get total tokens from API or calculate it
        let totalTokens =
          output.usage?.totalTokens ?? output.usage?.total_tokens ?? output.total_tokens;
        if (!totalTokens && promptTokensNum !== undefined && completionTokensNum !== undefined) {
          totalTokens = promptTokensNum + completionTokensNum;
        }

        tokenUsage = {
          prompt: promptTokensNum,
          completion: completionTokensNum,
          total: (promptTokensNum ?? 0) + (completionTokensNum ?? 0),
          numRequests: 1,
        };

        // If we couldn't extract any token counts but have a response, track usage for metrics
        if (
          tokenUsage.prompt === undefined &&
          tokenUsage.completion === undefined &&
          tokenUsage.total === undefined &&
          output
        ) {
          logger.debug(
            `No explicit token counts found for ${this.modelName}, tracking request count only`,
          );
        } else {
          logger.debug(`Extracted token usage: ${JSON.stringify(tokenUsage)}`);
        }
      }

      if (!tokenUsage.numRequests) {
        tokenUsage.numRequests = 1;
      }

      return {
        output: model.output(this.config, output),
        tokenUsage,
        ...(output['amazon-bedrock-guardrailAction']
          ? {
              guardrails: {
                flagged: output['amazon-bedrock-guardrailAction'] === 'INTERVENED',
              },
            }
          : {}),
      };
    } catch (err) {
      logger.error(`Bedrock API response error: ${String(err)}: ${JSON.stringify(response)}`);
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
      `AWS Bedrock API response (embeddings): ${JSON.stringify(response.body.transformToString())}`,
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
