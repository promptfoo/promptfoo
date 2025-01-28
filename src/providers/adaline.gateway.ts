import { Anthropic as GatewayAnthropic } from '@adaline/anthropic';
import { Azure as GatewayAzure } from '@adaline/azure';
import { Gateway } from '@adaline/gateway';
import type { Cache as GatewayCache } from '@adaline/gateway';
import type {
  CompleteChatHandlerResponseType,
  GetEmbeddingsHandlerResponseType,
} from '@adaline/gateway';
import { Google as GatewayGoogle } from '@adaline/google';
import { Groq as GatewayGroq } from '@adaline/groq';
import { OpenRouter as GatewayOpenRouter } from '@adaline/open-router';
import { OpenAI as GatewayOpenAI } from '@adaline/openai';
import type { ChatModelV1 as GatewayChatModel } from '@adaline/provider';
import type { EmbeddingModelV1 as GatewayEmbeddingModel } from '@adaline/provider';
import { TogetherAI as GatewayTogetherAi } from '@adaline/together-ai';
import type {
  MessageType as GatewayMessageType,
  ToolType as GatewayToolType,
  ResponseSchemaType as GatewayResponseSchemaType,
  EmbeddingRequestsType as GatewayEmbeddingRequestsType,
} from '@adaline/types';
import { Vertex as GatewayVertex } from '@adaline/vertex';
import { isCacheEnabled, getCache } from '../cache';
import { getEnvFloat, getEnvInt } from '../envars';
import logger from '../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderEmbeddingResponse,
  ProviderOptions,
  ProviderResponse,
  TokenUsage,
} from '../types';
import type { EnvOverrides } from '../types/env';
import { safeJsonStringify } from '../util/json';
import { AnthropicMessagesProvider, calculateAnthropicCost } from './anthropic';
import { AzureChatCompletionProvider, AzureEmbeddingProvider, calculateAzureCost } from './azure';
import { GoogleChatProvider } from './google';
import { GroqProvider } from './groq';
import {
  OpenAiChatCompletionProvider,
  OpenAiEmbeddingProvider,
  calculateOpenAICost,
  type OpenAiCompletionOptions,
} from './openai';
import { parseChatPrompt, REQUEST_TIMEOUT_MS } from './shared';
import { VertexChatProvider, VertexEmbeddingProvider } from './vertex';
import { getGoogleClient } from './vertexUtil';
import { VoyageEmbeddingProvider } from './voyage';

// Allows Adaline Gateway to R/W Promptfoo's cache
class AdalineGatewayCachePlugin<T> implements GatewayCache<T> {
  async get(key: string): Promise<T | undefined> {
    const cache = await getCache();
    return cache.get(key);
  }

  async set(key: string, value: T): Promise<void> {
    const cache = await getCache();
    cache.set(key, value);
  }

  // Gateway will never invoke this method
  async delete(key: string): Promise<void> {
    throw new Error('Not implemented');
  }

  // Gateway will never invoke this method
  async clear(): Promise<void> {
    throw new Error('Not implemented');
  }
}

// Adaline Gateway singleton
class AdalineGateway {
  gateway: Gateway | undefined;

  getGateway(): Gateway {
    if (!this.gateway) {
      this.gateway = new Gateway({
        queueOptions: {
          maxConcurrentTasks: 4,
          retryCount: 2,
          retry: {
            initialDelay: getEnvInt('PROMPTFOO_REQUEST_BACKOFF_MS', 5000),
            exponentialFactor: 2,
          },
          timeout: REQUEST_TIMEOUT_MS,
        },
        completeChatCache: new AdalineGatewayCachePlugin(),
        getEmbeddingsCache: new AdalineGatewayCachePlugin(),
      });
    }
    return this.gateway;
  }
}
const adalineGateway = new AdalineGateway();

interface GatewayBaseOptions {
  // General provider options
  apiKey?: string;
  apiKeyEnvar?: string;
  apiHost?: string;
  apiBaseUrl?: string;
  cost?: number;
  headers?: { [key: string]: string };
  // OpenAI specific options
  organization?: string;
  // Azure specific options
  azureClientId?: string;
  azureClientSecret?: string;
  azureTenantId?: string;
  azureAuthorityHost?: string;
  azureTokenScope?: string;
}

type GatewayChatOptions = GatewayBaseOptions & {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  minP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  repetitionPenalty?: number;
  stop?: string[];
  seed?: number;
  logProbs?: boolean;
  toolChoice?: string;
  tools?: GatewayToolType[];
  responseFormat?: 'text' | 'json_object' | 'json_schema';
  responseSchema?: GatewayResponseSchemaType;
  safetySettings?: { category: string; threshold: string }[];
};

export class AdalineGatewayGenericProvider implements ApiProvider {
  gateway: Gateway;

  modelName: string;
  providerName: string;

  env?: EnvOverrides;
  config: GatewayBaseOptions | OpenAiCompletionOptions;
  providerOptions: ProviderOptions;

  constructor(
    providerName: string,
    modelName: string,
    options: {
      config?: GatewayBaseOptions | OpenAiCompletionOptions;
      id?: string;
      env?: EnvOverrides;
    } = {},
  ) {
    this.modelName = modelName;
    this.providerName = providerName;
    this.providerOptions = options;
    const { config, id, env } = options;
    this.env = env;
    this.config = config || {};
    this.id = id ? () => id : this.id;
    this.gateway = adalineGateway.getGateway();
  }

  id(): string {
    return `adaline:${this.providerName}:${this.modelName}`;
  }

  toString(): string {
    return `[Adaline Gateway ${this.providerName}:${this.modelName}]`;
  }

  // @ts-ignore: Params are not used in this implementation
  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    throw new Error('Not implemented');
  }
}

export class AdalineGatewayEmbeddingProvider extends AdalineGatewayGenericProvider {
  async callEmbeddingApi(text: string): Promise<ProviderEmbeddingResponse> {
    try {
      let gatewayEmbeddingModel: GatewayEmbeddingModel;
      const gatewayEmbeddingRequests: GatewayEmbeddingRequestsType = {
        modality: 'text',
        requests: [text],
      };

      if (this.providerName === 'openai') {
        const provider = new GatewayOpenAI();
        const parentClass = new OpenAiEmbeddingProvider(this.modelName, this.providerOptions);
        const apiKey = parentClass.getApiKey();
        if (!apiKey) {
          throw new Error(
            'OpenAI API key is not set. Set the OPENAI_API_KEY environment variable or add `apiKey` to the provider config.',
          );
        }
        gatewayEmbeddingModel = provider.embeddingModel({
          apiKey,
          modelName: this.modelName,
          baseUrl: parentClass.getApiUrl(),
        });
      } else if (this.providerName === 'vertex') {
        const provider = new GatewayVertex();
        const parentClass = new VertexEmbeddingProvider(this.modelName, this.providerOptions);
        const { client, projectId } = await getGoogleClient();
        const token = await client.getAccessToken();
        gatewayEmbeddingModel = provider.embeddingModel({
          modelName: this.modelName,
          accessToken: token.token as string,
          location: parentClass.getRegion(),
          projectId,
        });
      } else if (this.providerName === 'voyage') {
        const provider = new GatewayAnthropic();
        const parentClass = new VoyageEmbeddingProvider(this.modelName, this.providerOptions);
        const apiKey = parentClass.getApiKey();
        if (!apiKey) {
          throw new Error(
            'Voyage API key is not set. Set the VOYAGE_API_KEY environment variable or add `apiKey` to the provider config.',
          );
        }
        gatewayEmbeddingModel = provider.embeddingModel({
          apiKey,
          modelName: this.modelName,
        });
      } else if (this.providerName === 'azureopenai') {
        const provider = new GatewayAzure();
        const parentClass = new AzureEmbeddingProvider(this.modelName, this.providerOptions);
        gatewayEmbeddingModel = provider.embeddingModel({
          apiKey: parentClass.getApiKeyOrThrow(),
          deploymentId: this.modelName,
          baseUrl: parentClass.getApiBaseUrl(),
        });
      } else {
        throw new Error(`Unsupported provider: ${this.providerName} on Adaline Gateway`);
      }

      const gatewayRequest = {
        model: gatewayEmbeddingModel,
        config: {},
        embeddingRequests: gatewayEmbeddingRequests,
        options: {
          enableCache: isCacheEnabled(),
          customHeaders: this.config.headers,
        },
      };
      logger.debug(`Adaline Gateway Embedding API Request: ${safeJsonStringify(gatewayRequest)}`);
      const response = (await this.gateway.getEmbeddings(
        gatewayRequest,
      )) as GetEmbeddingsHandlerResponseType;
      logger.debug(`Adaline Gateway Embedding API Response: ${safeJsonStringify(response)}`);

      const embedding = response.response.embeddings[0].embedding as number[];
      return {
        embedding,
        tokenUsage: {
          total: response.response.usage?.totalTokens,
          cached: response.cached ? response.response.usage?.totalTokens : 0,
        },
      };
    } catch (error) {
      logger.error(`Error calling embedding API on Adaline Gateway: ${error}`);
      throw error;
    }
  }
}

export class AdalineGatewayChatProvider extends AdalineGatewayGenericProvider {
  config: GatewayChatOptions | OpenAiCompletionOptions;

  constructor(
    providerName: string,
    modelName: string,
    options: {
      config?: GatewayChatOptions | OpenAiCompletionOptions;
      id?: string;
      env?: EnvOverrides;
    } = {},
  ) {
    super(providerName, modelName, options);
    this.config = options.config || {};
  }

  checkRequestFormat(prompt: string): { formatType: 'gateway' | 'openai' } {
    const checkFormatRequestUsingConfig = (): { formatType: 'gateway' | 'openai' } => {
      if (this.config.tools && this.config.tools.length > 0) {
        if ('definition' in this.config.tools[0]) {
          // valid tool in config and sufficiently in gateway format
          return { formatType: 'gateway' };
        } else if ('function' in this.config.tools[0]) {
          // valid tool in config and sufficiently in openai format
          return { formatType: 'openai' };
        }
      }

      // check if any gateway specific config is present
      if (
        'maxTokens' in this.config ||
        'topP' in this.config ||
        'topK' in this.config ||
        'minP' in this.config ||
        'frequencyPenalty' in this.config ||
        'presencePenalty' in this.config ||
        'repetitionPenalty' in this.config ||
        'logProbs' in this.config ||
        'responseFormat' in this.config ||
        'responseSchema' in this.config ||
        'toolChoice' in this.config
      ) {
        return { formatType: 'gateway' };
      }
      // no gateway specific config is present, assume openai format
      return { formatType: 'openai' };
    };

    const trimmedPrompt = prompt.trim();
    try {
      // try to parse the prompt as JSON and check if it matches openai or gateway format
      const objPrompt = JSON.parse(trimmedPrompt);
      if (Array.isArray(objPrompt) && objPrompt.length > 0) {
        if ('content' in objPrompt[0]) {
          if (
            typeof objPrompt[0].content === 'string' ||
            (Array.isArray(objPrompt[0].content) &&
              objPrompt[0].content.length > 0 &&
              'type' in objPrompt[0].content[0])
          ) {
            // JSON prompt sufficiently matches openai format
            return { formatType: 'openai' };
          } else if (
            Array.isArray(objPrompt[0].content) &&
            objPrompt[0].content.length > 0 &&
            'modality' in objPrompt[0].content[0]
          ) {
            // JSON prompt sufficiently matches gateway format
            return { formatType: 'gateway' };
          }
        } else {
          // JSON prompt does not match openai or gateway format, could just be a valid JSON message to be sent to the model
          return checkFormatRequestUsingConfig();
        }
      }

      // JSON prompt does not match openai or gateway format, could just be a valid JSON message to be sent to the model
      return checkFormatRequestUsingConfig();
    } catch {
      // prompt is not a valid JSON string, check if it matches openai or gateway format using config
      return checkFormatRequestUsingConfig();
    }
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    let gatewayChatModel: GatewayChatModel;
    let gatewayConfig: GatewayChatOptions;
    let gatewayMessages: GatewayMessageType[];
    let gatewayTools: GatewayToolType[] | undefined;

    // gateway provider can also handle prompts in openai format
    let formatType: 'gateway' | 'openai';
    try {
      formatType = this.checkRequestFormat(prompt).formatType;
      logger.debug(`Calling Adaline Gateway Chat API with prompt format: ${formatType}`);
      if (formatType === 'openai') {
        // create a temp openai provider to get the entire body that would have been sent to openai
        const openAiProvider = new OpenAiChatCompletionProvider(
          this.modelName,
          this.providerOptions,
        );
        const { body } = openAiProvider.getOpenAiBody(prompt, context, callApiOptions);
        // create a temp gateway openai model to transform the body to gateway types
        const gatewayOpenAiDummyModel = new GatewayOpenAI().chatModel({
          modelName: 'gpt-4o',
          apiKey: 'random-api-key',
        });

        // create gateway types from the body
        const gatewayRequest = gatewayOpenAiDummyModel.transformModelRequest(body);
        gatewayConfig = gatewayRequest.config;
        gatewayMessages = gatewayRequest.messages;
        gatewayTools = gatewayRequest.tools;
      } else {
        // prompt is in gateway format
        const _config = this.config as GatewayChatOptions;
        gatewayConfig = {
          maxTokens: _config.maxTokens,
          temperature: _config.temperature,
          topP: _config.topP,
          topK: _config.topK,
          minP: _config.minP,
          frequencyPenalty: _config.frequencyPenalty,
          presencePenalty: _config.presencePenalty,
          repetitionPenalty: _config.repetitionPenalty,
          stop: _config.stop,
          seed: _config.seed,
          logProbs: callApiOptions?.includeLogProbs === true || _config.logProbs,
          toolChoice: _config.toolChoice,
          responseFormat: _config.responseFormat,
          responseSchema: _config.responseSchema,
          safetySettings: _config.safetySettings,
        };

        gatewayMessages = parseChatPrompt(prompt, [
          { role: 'user', content: [{ modality: 'text', value: prompt }] },
        ]);
        gatewayTools = _config.tools as GatewayToolType[];
      }

      if (this.providerName === 'openai') {
        const provider = new GatewayOpenAI();
        const parentClass = new OpenAiChatCompletionProvider(this.modelName, this.providerOptions);
        const apiKey = parentClass.getApiKey();
        if (!apiKey) {
          throw new Error(
            'OpenAI API key is not set. Set the OPENAI_API_KEY environment variable or add `apiKey` to the provider config.',
          );
        }
        gatewayChatModel = provider.chatModel({
          apiKey,
          modelName: this.modelName,
          baseUrl: parentClass.getApiUrl(),
          organization: parentClass.getOrganization(),
        });
        gatewayConfig.temperature =
          gatewayConfig.temperature ?? getEnvFloat('OPENAI_TEMPERATURE', 0);
        gatewayConfig.maxTokens = gatewayConfig.maxTokens ?? getEnvFloat('OPENAI_MAX_TOKENS', 1024);
        gatewayConfig.maxTokens =
          gatewayConfig.maxTokens ?? getEnvFloat('OPENAI_MAX_COMPLETION_TOKENS');
        gatewayConfig.topP = gatewayConfig.topP ?? getEnvFloat('OPENAI_TOP_P', 1);
        gatewayConfig.frequencyPenalty =
          gatewayConfig.frequencyPenalty ?? getEnvFloat('OPENAI_FREQUENCY_PENALTY', 0);
        gatewayConfig.presencePenalty =
          gatewayConfig.presencePenalty ?? getEnvFloat('OPENAI_PRESENCE_PENALTY', 0);
      } else if (this.providerName === 'vertex') {
        const provider = new GatewayVertex();
        const parentClass = new VertexChatProvider(this.modelName, this.providerOptions);
        const { client, projectId } = await getGoogleClient();
        const token = await client.getAccessToken();
        if (token === null) {
          throw new Error('Vertex API token is not set. Please configure the Google Cloud SDK');
        }
        gatewayChatModel = provider.chatModel({
          modelName: this.modelName,
          accessToken: token.token as string,
          location: parentClass.getRegion(),
          projectId,
        });
      } else if (this.providerName === 'google') {
        const provider = new GatewayGoogle();
        const parentClass = new GoogleChatProvider(this.modelName, this.providerOptions);
        const apiKey = parentClass.getApiKey();
        if (!apiKey) {
          throw new Error(
            'Google API key is not set. Set the GOOGLE_API_KEY environment variable or add `apiKey` to the provider config.',
          );
        }
        gatewayChatModel = provider.chatModel({
          apiKey,
          modelName: this.modelName,
          baseUrl: `https://${parentClass.getApiHost()}/v1beta`,
        });
      } else if (this.providerName === 'azureopenai') {
        const provider = new GatewayAzure();
        const parentClass = new AzureChatCompletionProvider(this.modelName, this.providerOptions);
        const apiKey = parentClass.getApiKeyOrThrow();
        gatewayChatModel = provider.chatModel({
          apiKey,
          deploymentId: this.modelName,
          baseUrl: parentClass.getApiBaseUrl(),
        });
        gatewayConfig.temperature =
          gatewayConfig.temperature ?? getEnvFloat('OPENAI_TEMPERATURE', 0);
        gatewayConfig.maxTokens = gatewayConfig.maxTokens ?? getEnvFloat('OPENAI_MAX_TOKENS', 1024);
        gatewayConfig.topP = gatewayConfig.topP ?? getEnvFloat('OPENAI_TOP_P', 1);
        gatewayConfig.frequencyPenalty =
          gatewayConfig.frequencyPenalty ?? getEnvFloat('OPENAI_FREQUENCY_PENALTY', 0);
        gatewayConfig.presencePenalty =
          gatewayConfig.presencePenalty ?? getEnvFloat('OPENAI_PRESENCE_PENALTY', 0);
      } else if (this.providerName === 'anthropic') {
        const provider = new GatewayAnthropic();
        const parentClass = new AnthropicMessagesProvider(this.modelName, this.providerOptions);
        const apiKey = parentClass.getApiKey();
        if (!apiKey) {
          throw new Error(
            'Anthropic API key is not set. Set the ANTHROPIC_API_KEY environment variable or add `apiKey` to the provider config.',
          );
        }
        gatewayChatModel = provider.chatModel({
          apiKey,
          modelName: this.modelName,
        });
        gatewayConfig.temperature =
          gatewayConfig.temperature ?? getEnvFloat('ANTHROPIC_TEMPERATURE', 0);
        gatewayConfig.maxTokens =
          gatewayConfig.maxTokens ?? getEnvFloat('ANTHROPIC_MAX_TOKENS', 1024);
      } else if (this.providerName === 'groq') {
        const provider = new GatewayGroq();
        const parentClass = new GroqProvider(this.modelName, this.providerOptions);
        const apiKey = parentClass.getApiKey();
        if (!apiKey) {
          throw new Error(
            'Groq API key is not set. Set the GROQ_API_KEY environment variable or add `apiKey` to the provider config.',
          );
        }
        gatewayChatModel = provider.chatModel({
          apiKey,
          modelName: this.modelName,
        });
      } else if (this.providerName === 'openrouter') {
        const provider = new GatewayOpenRouter();
        const apiKey = this.config.apiKey || process.env['OPENROUTER_API_KEY'];
        if (!apiKey) {
          throw new Error(
            'OpenRouter API key is not set. Set the OPENROUTER_API_KEY environment variable or add `apiKey` to the provider config.',
          );
        }
        gatewayChatModel = provider.chatModel({
          apiKey,
          modelName: this.modelName,
        });
        gatewayConfig.temperature =
          gatewayConfig.temperature ?? getEnvFloat('OPENAI_TEMPERATURE', 0);
        gatewayConfig.maxTokens = gatewayConfig.maxTokens ?? getEnvFloat('OPENAI_MAX_TOKENS', 1024);
        gatewayConfig.maxTokens =
          gatewayConfig.maxTokens ?? getEnvFloat('OPENAI_MAX_COMPLETION_TOKENS');
        gatewayConfig.topP = gatewayConfig.topP ?? getEnvFloat('OPENAI_TOP_P', 1);
        gatewayConfig.frequencyPenalty =
          gatewayConfig.frequencyPenalty ?? getEnvFloat('OPENAI_FREQUENCY_PENALTY', 0);
        gatewayConfig.presencePenalty =
          gatewayConfig.presencePenalty ?? getEnvFloat('OPENAI_PRESENCE_PENALTY', 0);
      } else if (this.providerName === 'togetherai') {
        const provider = new GatewayTogetherAi();
        const apiKey = this.config.apiKey || process.env['TOGETHER_API_KEY'];
        if (!apiKey) {
          throw new Error(
            'TogetherAI API key is not set. Set the TOGETHER_API_KEY environment variable or add `apiKey` to the provider config.',
          );
        }
        gatewayChatModel = provider.chatModel({
          apiKey,
          modelName: this.modelName,
        });
        gatewayConfig.temperature =
          gatewayConfig.temperature ?? getEnvFloat('OPENAI_TEMPERATURE', 0);
        gatewayConfig.maxTokens = gatewayConfig.maxTokens ?? getEnvFloat('OPENAI_MAX_TOKENS', 1024);
        gatewayConfig.maxTokens =
          gatewayConfig.maxTokens ?? getEnvFloat('OPENAI_MAX_COMPLETION_TOKENS');
        gatewayConfig.topP = gatewayConfig.topP ?? getEnvFloat('OPENAI_TOP_P', 1);
        gatewayConfig.frequencyPenalty =
          gatewayConfig.frequencyPenalty ?? getEnvFloat('OPENAI_FREQUENCY_PENALTY', 0);
        gatewayConfig.presencePenalty =
          gatewayConfig.presencePenalty ?? getEnvFloat('OPENAI_PRESENCE_PENALTY', 0);
      } else {
        throw new Error(`Unsupported provider on Adaline Gateway: ${this.providerName}`);
      }
    } catch (error) {
      logger.error(`Adaline Gateway Chat API request error: ${String(error)}`);
      return {
        error: `request error: ${String(error)}`,
      };
    }

    let response;
    const gatewayRequest = {
      model: gatewayChatModel,
      config: gatewayConfig,
      messages: gatewayMessages,
      tools: gatewayTools,
      options: {
        enableCache: isCacheEnabled(),
        customHeaders: this.config.headers,
      },
    };
    logger.debug(`Adaline Gateway Chat API request: ${safeJsonStringify(gatewayRequest)}`);

    try {
      response = (await this.gateway.completeChat(
        gatewayRequest,
      )) as CompleteChatHandlerResponseType;
      logger.debug(`Adaline Gateway Chat API response: ${safeJsonStringify(response)}`);
    } catch (error) {
      logger.error(`Adaline Gateway Chat API response error: ${String(error)}`);
      return {
        error: `API response error: ${String(error)} : ${safeJsonStringify(gatewayRequest)}`,
      };
    }

    try {
      let output = '';
      if (
        response.response.messages[0].content.length === 1 &&
        response.response.messages[0].content[0].modality === 'text'
      ) {
        output = response.response.messages[0].content[0].value;
        if (gatewayConfig.responseFormat === 'json_schema' && typeof output === 'string') {
          try {
            output = JSON.parse(output);
          } catch (error) {
            throw new Error(`Failed to parse JSON output: ${error}`);
          }
        }
      } else {
        if (formatType === 'openai') {
          // convert gateway message type to openai message type if it's more than just text content
          if (
            response.response.messages[0].content.filter((content) => content.modality === 'text')
              .length > 0
          ) {
            // response has both text and tool-call content
            output = {
              content: response.response.messages[0].content
                .filter((content) => content.modality === 'text')
                .map((content) => content.value)
                .join(' '),
              tool_calls: response.response.messages[0].content
                .filter((content) => content.modality === 'tool-call')
                .map((content) => {
                  return {
                    id: content.id,
                    type: 'function',
                    function: {
                      name: content.name,
                      arguments: content.arguments,
                    },
                  };
                }),
            } as any;
          } else {
            // response has only tool-call content
            output = response.response.messages[0].content
              .filter((content) => content.modality === 'tool-call')
              .map((content) => {
                return {
                  id: content.id,
                  type: 'function',
                  function: {
                    name: content.name,
                    arguments: content.arguments,
                  },
                };
              }) as any;
          }
        } else {
          output = response.response.messages[0].content as any;
        }
      }

      let cost;
      const costConfig = { cost: this.config.cost };
      if (this.providerName === 'openai') {
        cost = calculateOpenAICost(
          this.modelName,
          costConfig,
          response.response.usage?.promptTokens,
          response.response.usage?.completionTokens,
        );
      } else if (this.providerName === 'azureopenai') {
        cost = calculateAzureCost(
          this.modelName,
          {},
          response.response.usage?.promptTokens,
          response.response.usage?.completionTokens,
        );
      } else if (this.providerName === 'anthropic') {
        cost = calculateAnthropicCost(
          this.modelName,
          costConfig,
          response.response.usage?.promptTokens,
          response.response.usage?.completionTokens,
        );
      }

      const logProbs = response.response.logProbs?.map((logProb) => logProb.logProb);
      const tokenUsage: TokenUsage = {};
      if (response.cached) {
        tokenUsage.cached = response.response.usage?.totalTokens;
        tokenUsage.total = response.response.usage?.totalTokens;
      } else {
        tokenUsage.prompt = response.response.usage?.promptTokens;
        tokenUsage.completion = response.response.usage?.completionTokens;
        tokenUsage.total = response.response.usage?.totalTokens;
      }

      return {
        output,
        tokenUsage,
        cached: response.cached,
        cost,
        logProbs,
      };
    } catch (error) {
      logger.error(`Adaline Gateway Chat API post response error: ${String(error)}`);
      return {
        error: `API post response error: ${String(error)} : ${safeJsonStringify(response)}`,
      };
    }
  }
}

export { AdalineGatewayCachePlugin, adalineGateway };
