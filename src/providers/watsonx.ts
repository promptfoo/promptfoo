import type {
    WatsonXAI as WatsonXAIClient,
  } from '@ibm-cloud/watsonx-ai';
  
  import { WatsonXAI } from '@ibm-cloud/watsonx-ai';
  import { getCache, isCacheEnabled } from '../cache';
  import { getEnvString } from '../envars';
  import logger from '../logger';
  import type { ApiProvider, EnvOverrides, ProviderResponse, TokenUsage } from '../types';
  import { REQUEST_TIMEOUT_MS } from './shared';
  
  // Interface for provider configuration
  interface WatsonxGenerationParameters {
    apiKey?: string | null;
    apiKeyEnvar?: string | null;
    serviceUrl?: string;
    version?: string;
    spaceId: string;
    modelId: string;
    maxNewTokens?: number;
  }
  
  interface WatsonxModerations {
    // TODO: Define moderation parameters here
  }
  
  // Interface for text generation response
  interface TextGenResponse {
    results: Array<{
      generated_text: string;
      generated_tokens: number;
      prompt_tokens: number;
    }>;
  }
  
  
  // Helper function to convert API response to ProviderResponse
  function convertResponse(response: TextGenResponse): ProviderResponse {
    const firstResult = response.results.length > 0 ? response.results[0] : null;
  
    const totalGeneratedTokens = firstResult?.generated_tokens || 0;
    const promptTokens = firstResult?.prompt_tokens || 0;
    
    const tokenUsage: Partial<TokenUsage> = {
      total: totalGeneratedTokens,
      prompt: promptTokens,
      completion: totalGeneratedTokens - promptTokens,
    };
  
    const providerResponse: ProviderResponse = {
      error: undefined,
      output: firstResult?.generated_text || '',
      tokenUsage,
      cost: undefined,
      cached: undefined,
      logProbs: undefined,
    };
  
    return providerResponse;
  }
  
  export class WatsonXProvider implements ApiProvider {
    modelName: string;
    config?: WatsonxGenerationParameters;
    moderations?: WatsonxModerations;
    env?: EnvOverrides;
    apiKey?: string;
    client: WatsonXAIClient | undefined;
  
    constructor(
      modelName: string,
      options: {
        id?: string;
        config: WatsonxGenerationParameters;
        env?: EnvOverrides;
        moderations?: WatsonxModerations;
      },
    ) {
      const { id, config, env, moderations } = options;
      this.env = env;
      this.modelName = modelName;
      this.config = config || {};
      this.moderations = moderations;
      this.id = id ? () => id : this.id;
      this.apiKey = this.getApiKey();
    }
  
    // Generates a unique identifier for the provider
    id(): string {
      return `watsonx:${this.modelName}`;
    }
  
    // Returns a readable string representation of the provider
    toString(): string {
      return `[Watsonx Provider ${this.modelName}]`;
    }
  
    // Retrieves the API key from config or environment variables
    getApiKey(): string | undefined {
      return (
        this.config?.apiKey ||
        (this.config?.apiKeyEnvar
          ? process.env[this.config.apiKeyEnvar] ||
            this.env?.[this.config.apiKeyEnvar as keyof EnvOverrides]
          : undefined) ||
        this.env?.WATSONX_API_KEY ||
        getEnvString('WATSONX_API_KEY')
      );
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
          version: this.config?.version || '2024-05-31',
          serviceUrl: this.config?.serviceUrl || 'https://us-south.ml.cloud.ibm.com',
          apiKey: apiKey,
        });
      }
      return this.client;
    }
  
    // Main method to call the Watsonx AI API for text generation
    async callApi(prompt: string): Promise<ProviderResponse> {
      if (!this.apiKey) {
        throw new Error(
          'Watsonx API key is not set. Set the WATSONX_API_KEY environment variable or add `apiKey` to the provider config.',
        );
      }
  
      try {
        const cache = await getCache();
        const cacheKey = `watsonx:${this.modelName}:${prompt}`;
        if (isCacheEnabled()) {
          const cachedResponse = await cache.get(cacheKey);
          if (cachedResponse) {
            logger.debug(`Watsonx: Returning cached response for prompt "${prompt}": ${cachedResponse}`);
            return {
              output: JSON.parse(cachedResponse as string),
              tokenUsage: {},
            };
          }
        }
  
        const client = await this.getClient();
  
        const textGenRequestParametersModel = {
          max_new_tokens: this.config?.maxNewTokens || 100,
        };
  
        const params = {
          input: prompt,
          modelId: this.config?.modelId || "",
          projectId: this.config?.spaceId || "",
          parameters: textGenRequestParametersModel,

        };

        const apiResponse = await client.generateText(params);

        // Access the first result in the `results` array
        const textGenResponse = apiResponse.result; 

        const firstResult = textGenResponse.results.length > 0 ? textGenResponse.results[0] : null;

        // Ensure we have at least one result
        if (!firstResult) {
        throw new Error("No results returned from text generation API.");
        }
  
        // const apiResponse = await client.generateText(params);
        
        // console.log('API Response:', apiResponse);
        // const textGenResponse: TextGenResponse = apiResponse.result;

        const dummyProviderResponse: ProviderResponse = {
            error: undefined,
            output: 'This is a dummy response for debugging purposes.',
            tokenUsage: {
              total: 50,     // Simulating that 50 tokens were generated
              prompt: 10,    // Simulating that the prompt used 10 tokens
              completion: 40 // Simulating that 40 tokens were generated as completion
            },
            cost: undefined,
            cached: false,
            logProbs: undefined,
          };
          
  
        // const providerResponse = convertResponse(textGenResponse);
        
  
        // if (isCacheEnabled()) {
        //   await cache.set(cacheKey, JSON.stringify(providerResponse.output), {
        //     ttl: 60 * 5, // Cache for 5 minutes
        //   });
        // }
  
        // return providerResponse;

        return dummyProviderResponse;
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
  