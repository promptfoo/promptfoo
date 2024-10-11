import type {
    WatsonXAI as WatsonXAIClient,
  } from '@ibm-cloud/watsonx-ai';
  
  import { WatsonXAI } from '@ibm-cloud/watsonx-ai';
  import { IamAuthenticator } from 'ibm-cloud-sdk-core';
  import { getCache, isCacheEnabled } from '../cache';
  import { getEnvString } from '../envars';
  import logger from '../logger';
  import type { ApiProvider, EnvOverrides, ProviderResponse, TokenUsage } from '../types';
  import type { ProviderOptions } from '../types/providers';
  import { REQUEST_TIMEOUT_MS } from './shared';
  
  // Interface for provider configuration
  interface WatsonxGenerationParameters {
    apiKey?: string | null;
    apiKeyEnvar?: string | null;
    serviceUrl?: string;
    version?: string;
    projectId: string;
    modelId: string;
    maxNewTokens?: number;
  }
  
  interface WatsonxModerations {
    // TODO: Define moderation parameters here
  }
  
  // Interface for text generation response
  interface TextGenResponse {
    model_id: string;
    model_version: string;
    created_at: string;
    results: Array<{
      generated_text: string;
      generated_token_count?: number;
      input_token_count?: number;
      stop_reason?: string;
    }>;
  }
  

  // Helper function to convert API response to ProviderResponse
  function convertResponse(response: TextGenResponse): ProviderResponse {
    const firstResult = response.results && response.results[0];
  
    if (!firstResult) {
      throw new Error('No results returned from text generation API.');
    }
  
    const totalGeneratedTokens = firstResult.generated_token_count || 0;
    const promptTokens = firstResult.input_token_count || 0;
    const completionTokens = totalGeneratedTokens - promptTokens;
  
    const tokenUsage: Partial<TokenUsage> = {
      total: totalGeneratedTokens,
      prompt: promptTokens,
      completion: completionTokens >= 0 ? completionTokens : totalGeneratedTokens,
    };
  
    const providerResponse: ProviderResponse = {
      error: undefined,
      output: firstResult.generated_text || '',
      tokenUsage,
      cost: undefined,
      cached: undefined,
      logProbs: undefined,
    };
  
    return providerResponse;
  }
  
  export class WatsonXProvider implements ApiProvider {
    modelName: string;
    options: ProviderOptions;
    env?: EnvOverrides;
    apiKey?: string;
    client: WatsonXAIClient | undefined;

    constructor(modelName: string, options: ProviderOptions,) {
      if (!options.config) {
        throw new Error('WatsonXProvider requires a valid config.');
      }
  
      const { id, config, env } = options;
      this.modelName = modelName;
      this.options = options;
      this.env = env;
      this.id = id ? () => id : this.id;
      this.apiKey = this.getApiKey();
    }
  
    id(): string {
      return `watsonx:${this.modelName}`;
    }
  
    toString(): string {
      return `[Watsonx Provider ${this.modelName}]`;
    }
  
    getApiKey(): string | undefined {
      return (
        this.options.config.apiKey ||
        (this.options.config.apiKeyEnvar
          ? process.env[this.options.config.apiKeyEnvar] ||
            this.env?.[this.options.config.apiKeyEnvar as keyof EnvOverrides]
          : undefined) ||
        this.env?.WATSONX_API_KEY ||
        getEnvString('WATSONX_API_KEY')
      );
    }

    getProjectId(): string | undefined {
      return (
        this.options.config.projectId ||
        (this.options.config.projectIdEnvar
          ? process.env[this.options.config.projectIdEnvar] ||
            this.env?.[this.options.config.projectIdEnvar as keyof EnvOverrides]
          : undefined) ||
        this.env?.WATSONX_PROJECT_ID ||
        getEnvString('WATSONX_PROJECT_ID')
      );
    }
    
    getModelId(): string {
      if (!this.options.id) {
        throw new Error('Provider id must be specified in the configuration.');
      }
  
      const modelId = this.options.id.split(':')[1];
      if (!modelId) {
        throw new Error('Unable to extract modelId from provider id.');
      }
  
      return modelId;
    }
  
    // Initializes and returns the WatsonXAI client instance
    async getClient(): Promise<WatsonXAIClient> {
      if (!this.client) {
        const apiKey = this.getApiKey();
        if (!apiKey) {
          throw new Error(
            'Watsonx API key is not set. Set the WATSONX_API_KEY environment variable or add `apiKey` to the provider config.',
          );
        }
  
        this.client = WatsonXAI.newInstance({
          version: this.options.config.version || '2023-05-29',
          serviceUrl: this.options.config.serviceUrl || 'https://us-south.ml.cloud.ibm.com',
          authenticator: new IamAuthenticator({ apikey: apiKey }),
        });
      }
      return this.client;
    }
  
    async callApi(prompt: string): Promise<ProviderResponse> {
      const modelId = this.getModelId();
      const projectId = this.getProjectId();
      if (!modelId) {
        throw new Error('Model ID is required for WatsonX API call.');
      }
      if (!this.apiKey) {
        throw new Error(
          'Watsonx API key is not set. Set the WATSONX_API_KEY environment variable or add `apiKey` to the provider config.',
        );
      }
    
      const cache = await getCache();
      const cacheKey = `watsonx:${this.modelName}:${prompt}`;
      if (isCacheEnabled()) {
        const cachedResponse = await cache.get(cacheKey);
        if (cachedResponse) {
          logger.debug(
            `Watsonx: Returning cached response for prompt "${prompt}": ${cachedResponse}`,
          );
          return JSON.parse(cachedResponse as string) as ProviderResponse;
        }
      }
    
      const client = await this.getClient();
    
      try {
        const textGenRequestParametersModel = {
          max_new_tokens: this.options.config.maxNewTokens || 100,
        };
    
        const params = {
          input: prompt,
          modelId: modelId,
          projectId: projectId || '',
          parameters: textGenRequestParametersModel,
        };
    
        const apiResponse = await client.generateText(params);
        const textGenResponse = apiResponse.result as TextGenResponse;
    
        // console.log('API Response:', JSON.stringify(textGenResponse, null, 2));
    
        const providerResponse = convertResponse(textGenResponse);
    
        if (isCacheEnabled()) {
          await cache.set(cacheKey, JSON.stringify(providerResponse), {
            ttl: 60 * 5, // Cache for 5 minutes
          });
        }
    
        return providerResponse;
      } catch (err) {
        logger.error(`Watsonx: API call error: ${String(err)}`);
    
        return {
          error: `API call error: ${String(err)}`,
          output: '',
          tokenUsage: {},
        };
      }
    }    
  }
  