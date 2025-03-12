import { getEnvFloat, getEnvInt, getEnvString } from '../envars';
import logger from '../logger';
import telemetry from '../telemetry';
import type {
  ApiEmbeddingProvider,
  ApiProvider, 
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderEmbeddingResponse,
  ProviderOptions,
  ProviderResponse
} from '../types';
import type { EnvOverrides } from '../types/env';
import { maybeLoadFromExternalFile } from '../util';
import { transform, TransformContext } from '../util/transform';
import { parseChatPrompt } from './shared';

/**
 * Sleep utility function for implementing delays
 * @param ms Milliseconds to sleep
 * @returns Promise that resolves after the specified delay
 */
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Options for configuring SageMaker provider
 */
interface SageMakerOptions {
  // AWS credentials options
  accessKeyId?: string;
  profile?: string;
  region?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  
  // SageMaker specific options
  endpoint?: string;
  contentType?: string;
  acceptType?: string;
  
  // Model parameters
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
  
  // Provider behavior options
  delay?: number; // Delay between API calls in milliseconds
  transform?: string; // Transform function or file path to transform prompts
  
  // Model type for request/response handling
  modelType?: 'openai' | 'anthropic' | 'llama' | 'huggingface' | 'jumpstart' | 'custom';
  
  // Response format options
  responseFormat?: {
    type?: string;
    path?: string; // JSONPath to extract content
  };
}

/**
 * Base class for SageMaker providers with common functionality
 */
export abstract class SageMakerGenericProvider {
  env?: EnvOverrides;
  sagemakerRuntime?: any; // SageMaker runtime client
  config: SageMakerOptions;
  endpointName: string;
  delay?: number; // Delay between API calls in milliseconds
  transform?: string; // Transform function for modifying prompts before sending

  constructor(
    endpointName: string,
    options: { config?: SageMakerOptions; id?: string; env?: EnvOverrides; delay?: number; transform?: string } = {},
  ) {
    const { config, id, env, delay, transform } = options;
    this.env = env;
    this.endpointName = endpointName;
    this.config = config || {};
    this.delay = delay || this.config.delay;
    this.transform = transform || this.config.transform;
    this.id = id ? () => id : this.id;

    // Validate JSONPath if provided
    if (this.config?.responseFormat?.path) {
      const validation = this.validateJsonPath(this.config.responseFormat.path);
      if (!validation.valid) {
        logger.warn(`Invalid responseFormat.path: ${validation.error}`);
      }
    }

    // Record telemetry for SageMaker usage
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'sagemaker',
    });
  }
  
  /**
   * Validate a JSONPath expression
   * @param path JSONPath expression to validate
   * @returns Object with validation result and optional error message
   */
  protected validateJsonPath(path: string): { valid: boolean; error?: string } {
    try {
      // Basic syntax check
      if (!path.startsWith('$')) {
        return { valid: false, error: 'JSONPath must start with $ root selector' };
      }
      
      // Try to compile/validate with jsonpath
      const jsonpath = require('jsonpath');
      jsonpath.parse(path); // Will throw if invalid
      return { valid: true };
    } catch (error: any) {
      return { 
        valid: false, 
        error: `Invalid JSONPath syntax: ${error.message || String(error)}` 
      };
    }
  }

  id(): string {
    return `sagemaker:${this.endpointName}`;
  }

  toString(): string {
    return `[Amazon SageMaker Provider ${this.endpointName}]`;
  }

  /**
   * Get AWS credentials from config or environment
   */
  async getCredentials() {
    if (this.config.accessKeyId && this.config.secretAccessKey) {
      logger.debug('Using explicit credentials from config');
      return {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
        sessionToken: this.config.sessionToken,
      };
    }
    if (this.config.profile) {
      logger.debug(`Using AWS profile: ${this.config.profile}`);
      try {
        const { fromSSO } = await import('@aws-sdk/credential-provider-sso');
        return fromSSO({ profile: this.config.profile });
      } catch (error) {
        throw new Error(
          `Failed to load AWS SSO profile. Please install @aws-sdk/credential-provider-sso: ${error}`
        );
      }
    }
    
    // Default credentials will be loaded from environment or instance profile
    logger.debug('Using default AWS credentials from environment');
    return undefined;
  }

  /**
   * Initialize and return the SageMaker runtime client
   */
  async getSageMakerRuntimeInstance() {
    if (!this.sagemakerRuntime) {
      try {
        const { SageMakerRuntimeClient } = await import('@aws-sdk/client-sagemaker-runtime');
        const credentials = await this.getCredentials();
        
        this.sagemakerRuntime = new SageMakerRuntimeClient({
          region: this.getRegion(),
          maxAttempts: Number(process.env.AWS_SAGEMAKER_MAX_RETRIES || '3'),
          retryMode: 'adaptive',
          ...(credentials ? { credentials } : {}),
        });
        
        logger.debug(`SageMaker client initialized for region ${this.getRegion()}`);
      } catch (error) {
        throw new Error(
          'The @aws-sdk/client-sagemaker-runtime package is required. Please install it with: npm install @aws-sdk/client-sagemaker-runtime'
        );
      }
    }
    return this.sagemakerRuntime;
  }

  /**
   * Get AWS region from config or environment
   */
  getRegion(): string {
    return (
      this.config?.region ||
      this.env?.AWS_REGION ||
      getEnvString('AWS_REGION') ||
      getEnvString('AWS_DEFAULT_REGION') ||
      'us-east-1'
    );
  }

  /**
   * Get SageMaker endpoint name
   */
  getEndpointName(): string {
    return (
      this.config?.endpoint ||
      this.endpointName
    );
  }

  /**
   * Get content type for request
   */
  getContentType(): string {
    return this.config?.contentType || 'application/json';
  }

  /**
   * Get accept type for response
   */
  getAcceptType(): string {
    return this.config?.acceptType || 'application/json';
  }
  
  /**
   * Apply transformation to a prompt if a transform function is specified
   * @param prompt The original prompt to transform
   * @param context Optional context information for the transformation
   * @returns The transformed prompt, or the original if no transformation is applied
   */
  async applyTransformation(
    prompt: string, 
    context?: CallApiContextParams
  ): Promise<string> {
    // If no transform is specified, return the original prompt
    if (!this.transform) {
      return prompt;
    }
    
    try {
      // Create a transform context from the available information
      const transformContext: TransformContext = {
        vars: context?.vars || {},
        prompt: context?.prompt || { raw: prompt },
        uuid: `sagemaker-${this.endpointName}-${Date.now()}`
      };
      
      // Get the transform function from config or provider
      const transformFn = this.transform || context?.originalProvider?.transform;
      
      if (!transformFn) {
        return prompt;
      }
      
      logger.debug(`Applying transform to prompt for SageMaker endpoint ${this.getEndpointName()}`);
      
      // For inline transform functions, do direct evaluation
      if (typeof transformFn === 'string' && !transformFn.startsWith('file://')) {
        try {
          // Simple transform function
          if (transformFn.includes('=>')) {
            // Arrow function format: prompt => ...
            const fn = new Function('prompt', 'context', `return (${transformFn})(prompt, context);`);
            const result = fn(prompt, transformContext);
            
            if (result != null) {
              if (typeof result === 'string') {
                return result;
              } else if (typeof result === 'object') {
                return JSON.stringify(result);
              }
            }
          } else {
            // Regular function format
            const fn = new Function('prompt', 'context', transformFn);
            const result = fn(prompt, transformContext);
            
            if (result != null) {
              if (typeof result === 'string') {
                return result;
              } else if (typeof result === 'object') {
                return JSON.stringify(result);
              }
            }
          }
        } catch (transformError) {
          logger.error(`Error executing inline transform: ${transformError}`);
        }
      } else {
        // Use the transform utility for file transforms
        try {
          const { TransformInputType } = await import('../util/transform');
          const transformed = await transform(transformFn, prompt, transformContext, false, TransformInputType.OUTPUT);
          
          if (transformed != null) {
            if (typeof transformed === 'string') {
              return transformed;
            } else if (typeof transformed === 'object') {
              return JSON.stringify(transformed);
            }
          }
        } catch (transformError) {
          logger.error(`Error using transform utility: ${transformError}`);
        }
      }
      
      // Fall back to the original prompt if the transform result is not usable
      logger.warn(`Transform did not produce a valid result, using original prompt`);
      return prompt;
    } catch (error) {
      logger.error(`Error applying transform to prompt: ${error}`);
      return prompt; // Return original prompt on error
    }
  }
}

/**
 * Provider for text generation with SageMaker endpoints
 */
export class SageMakerCompletionProvider extends SageMakerGenericProvider implements ApiProvider {
  static SAGEMAKER_MODEL_TYPES = ['openai', 'anthropic', 'llama', 'huggingface', 'jumpstart', 'custom'];

  /**
   * Format the request payload based on model type
   */
  formatPayload(prompt: string): string {
    const modelType = this.config.modelType || 'custom';
    const maxTokens = this.config.maxTokens || getEnvInt('AWS_SAGEMAKER_MAX_TOKENS') || 1024;
    const temperature = this.config.temperature || getEnvFloat('AWS_SAGEMAKER_TEMPERATURE') || 0.7;
    const topP = this.config.topP || getEnvFloat('AWS_SAGEMAKER_TOP_P') || 1.0;
    const stopSequences = this.config.stopSequences || [];
    
    let payload: any;
    
    logger.debug(`Formatting payload for model type: ${modelType}`);
    
    switch(modelType) {
      case 'openai':
        try {
          // Try to parse as JSON array of messages
          const messages = JSON.parse(prompt);
          if (Array.isArray(messages)) {
            payload = {
              messages,
              max_tokens: maxTokens,
              temperature,
              top_p: topP,
              stop: stopSequences.length > 0 ? stopSequences : undefined,
            };
          } else {
            throw new Error('Not valid messages format');
          }
        } catch (error) {
          // Fall back to text completion format
          payload = {
            prompt,
            max_tokens: maxTokens,
            temperature,
            top_p: topP,
            stop: stopSequences.length > 0 ? stopSequences : undefined,
          };
        }
        break;
        
      case 'anthropic':
        try {
          const messages = JSON.parse(prompt);
          if (Array.isArray(messages)) {
            payload = {
              messages,
              max_tokens: maxTokens,
              temperature,
              top_p: topP,
              stop_sequences: stopSequences.length > 0 ? stopSequences : undefined,
            };
          } else {
            throw new Error('Not valid messages format');
          }
        } catch (error) {
          // Extract system and user messages using the same logic as Anthropic provider
          const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);
          
          // Extract system message if present
          const systemMessages = messages.filter((msg: any) => msg.role === 'system');
          const nonSystemMessages = messages.filter((msg: any) => msg.role !== 'system');
          
          payload = {
            messages: nonSystemMessages,
            max_tokens: maxTokens,
            temperature,
            top_p: topP,
            stop_sequences: stopSequences.length > 0 ? stopSequences : undefined,
          };
          
          if (systemMessages.length > 0) {
            payload.system = systemMessages[0].content;
          }
        }
        break;
        
      case 'llama':
        try {
          const messages = JSON.parse(prompt);
          if (Array.isArray(messages)) {
            payload = {
              messages,
              max_tokens: maxTokens,
              temperature,
              top_p: topP,
              stop: stopSequences.length > 0 ? stopSequences : undefined,
            };
          } else {
            throw new Error('Not valid messages format');
          }
        } catch (error) {
          // Simple text completion for Llama
          payload = {
            prompt,
            max_tokens: maxTokens,
            temperature,
            top_p: topP,
            stop: stopSequences.length > 0 ? stopSequences : undefined,
          };
        }
        break;
        
      case 'jumpstart':
        // Format specifically for JumpStart models which require this format
        payload = {
          inputs: prompt,
          parameters: {
            max_new_tokens: maxTokens,
            temperature,
            top_p: topP,
            do_sample: temperature > 0,
          }
        };
        break;
        
      case 'huggingface':
        payload = {
          inputs: prompt,
          parameters: {
            max_new_tokens: maxTokens,
            temperature,
            top_p: topP,
            do_sample: temperature > 0,
            return_full_text: false,
          }
        };
        break;
        
      case 'custom':
      default:
        // For custom, we just pass through the raw prompt data
        try {
          // Try to parse as JSON
          const parsedPrompt = JSON.parse(prompt);
          payload = parsedPrompt;
        } catch (error) {
          // If not valid JSON, wrap in a simple object
          payload = { prompt };
        }
        break;
    }
    
    return JSON.stringify(payload);
  }

  /**
   * Parse the response from SageMaker endpoint
   */
  parseResponse(responseBody: string): any {
    const modelType = this.config.modelType || 'custom';
    let responseJson;
    
    logger.debug(`Parsing response for model type: ${modelType}`);
    
    try {
      responseJson = JSON.parse(responseBody);
    } catch (error) {
      logger.debug('Response is not JSON, returning as-is');
      return responseBody; // Return as is if not JSON
    }
    
    // If response format specifies a path, extract it using JSONPath
    if (this.config.responseFormat?.path) {
      try {
        const jsonpath = require('jsonpath');
        
        // Validate JSONPath before using it
        const pathValidation = this.validateJsonPath(this.config.responseFormat.path);
        if (!pathValidation.valid) {
          logger.warn(`Skipping extraction with invalid JSONPath: ${pathValidation.error}`);
          return responseJson;
        }
        
        const extracted = jsonpath.query(responseJson, this.config.responseFormat.path);
        logger.debug(`Extracted value using JSONPath: ${this.config.responseFormat.path}`);
        
        if (extracted.length === 0) {
          logger.warn(`JSONPath matched no data: ${this.config.responseFormat.path}`);
          logger.debug(`Response JSON structure: ${JSON.stringify(responseJson).substring(0, 200)}...`);
          return responseJson;
        }
        
        // Log the type of extracted data for debugging
        logger.debug(`Extracted data type: ${typeof extracted[0]}, isArray: ${Array.isArray(extracted[0])}`);
        
        return extracted[0] ?? responseJson;
      } catch (error) {
        logger.warn(`Failed to extract from JSON path: ${this.config.responseFormat.path}, Error: ${error}`);
        logger.debug(`Response JSON structure: ${JSON.stringify(responseJson).substring(0, 200)}...`);
        return responseJson;
      }
    }
    
    // Check for JumpStart Llama format first since that's common
    if (responseJson.generated_text) {
      logger.debug('Detected JumpStart model response format with generated_text field');
      return responseJson.generated_text;
    }
    
    switch(modelType) {
      case 'openai':
        return responseJson.choices?.[0]?.message?.content || 
               responseJson.choices?.[0]?.text ||
               responseJson.generation ||
               responseJson;
               
      case 'anthropic':
        return responseJson.content?.[0]?.text || 
               responseJson.completion ||
               responseJson;
               
      case 'llama':
        return responseJson.generation ||
               responseJson.choices?.[0]?.message?.content ||
               responseJson.choices?.[0]?.text ||
               responseJson;
               
      case 'huggingface':
        return Array.isArray(responseJson) ? 
               responseJson[0]?.generated_text || responseJson[0] :
               responseJson.generated_text || responseJson;
               
      case 'jumpstart':
        // For AWS JumpStart models
        return responseJson.generated_text || responseJson;
               
      case 'custom':
      default:
        // For custom endpoints, try common patterns
        return responseJson.output ||
               responseJson.generation || 
               responseJson.response ||
               responseJson.text ||
               responseJson.generated_text ||
               responseJson.choices?.[0]?.message?.content ||
               responseJson.choices?.[0]?.text ||
               responseJson;
    }
  }

  /**
   * Generate a consistent cache key for SageMaker requests
   */
  private getCacheKey(prompt: string): string {
    // Create a deterministic representation of the request parameters
    const configForKey = {
      endpoint: this.getEndpointName(),
      modelType: this.config.modelType,
      contentType: this.getContentType(),
      acceptType: this.getAcceptType(),
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      topP: this.config.topP,
      region: this.getRegion(),
    };
    
    return `sagemaker:v1:${this.getEndpointName()}:${prompt}:${JSON.stringify(configForKey)}`;
  }

  /**
   * Invoke SageMaker endpoint for text generation with caching, delay support, and transformations
   */
  async callApi(prompt: string, context?: CallApiContextParams, options?: CallApiOptionsParams): Promise<ProviderResponse> {
    // Import cache functions dynamically to avoid circular dependencies
    const { isCacheEnabled, getCache } = await import('../cache');
    
    // Get the delay value - the context delay takes precedence over the provider's delay
    const delayMs = context?.originalProvider?.delay || this.delay;
    
    // Apply transformation to the prompt if a transform is specified
    const transformedPrompt = await this.applyTransformation(prompt, context);
    const isTransformed = transformedPrompt !== prompt;
    
    if (isTransformed) {
      logger.debug(`Prompt transformed for SageMaker endpoint ${this.getEndpointName()}`);
      logger.debug(`Original: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`);
      logger.debug(`Transformed: ${transformedPrompt.substring(0, 100)}${transformedPrompt.length > 100 ? '...' : ''}`);
    }
    
    // Check if we should use cache - use the transformed prompt for cache key
    const bustCache = context?.debug === true; // If debug mode is on, bust the cache
    if (isCacheEnabled() && !bustCache) {
      const cacheKey = this.getCacheKey(transformedPrompt);
      const cache = await getCache ? await getCache() : await import('../cache').then(m => m.getCache());
      
      // Try to get from cache
      const cachedResult = await cache.get<string>(cacheKey);
      if (cachedResult) {
        logger.debug(`Using cached SageMaker response for ${this.getEndpointName()}`);
        
        try {
          // Parse the cached result
          const parsedResult = JSON.parse(cachedResult) as ProviderResponse;
          
          // Add cache flag to token usage
          if (parsedResult.tokenUsage) {
            parsedResult.tokenUsage.cached = parsedResult.tokenUsage.total || 0;
          }
          
          // Add metadata about transformation if prompt was transformed
          if (isTransformed && parsedResult.metadata) {
            parsedResult.metadata.transformed = true;
            parsedResult.metadata.originalPrompt = prompt;
          }
          
          return parsedResult;
        } catch (error) {
          logger.warn(`Failed to parse cached SageMaker response: ${error}`);
          // Continue with API call if parsing fails
        }
      }
    }
    
    // Apply delay if specified and not using cached response
    if (delayMs && delayMs > 0) {
      logger.debug(`Applying delay of ${delayMs}ms before calling SageMaker endpoint ${this.getEndpointName()}`);
      await sleep(delayMs);
    }
    
    // Not in cache or cache disabled, make the actual API call
    const runtime = await this.getSageMakerRuntimeInstance();
    const payload = this.formatPayload(transformedPrompt);
    
    logger.debug(`Calling SageMaker endpoint ${this.getEndpointName()}`);
    logger.debug(`With payload: ${payload.length > 1000 ? payload.substring(0, 1000) + '...' : payload}`);
    
    try {
      const { InvokeEndpointCommand } = await import('@aws-sdk/client-sagemaker-runtime');
      
      const command = new InvokeEndpointCommand({
        EndpointName: this.getEndpointName(),
        ContentType: this.getContentType(),
        Accept: this.getAcceptType(),
        Body: payload,
      });
      
      const startTime = Date.now();
      const response = await runtime.send(command);
      const endTime = Date.now();
      const latency = endTime - startTime;
      
      if (!response.Body) {
        logger.error('No response body returned from SageMaker endpoint');
        return {
          error: 'No response body returned from SageMaker endpoint',
        };
      }
      
      const responseBody = new TextDecoder().decode(response.Body);
      logger.debug(`SageMaker response (truncated): ${responseBody.length > 1000 ? responseBody.substring(0, 1000) + '...' : responseBody}`);
      
      const output = this.parseResponse(responseBody);
      
      // Calculate token usage estimation (very rough estimate)
      const promptTokens = Math.ceil(payload.length / 4); // Very rough estimate
      const completionTokens = Math.ceil((output?.length || 0) / 4); // Very rough estimate
      
      const result: ProviderResponse = {
        output,
        raw: responseBody,
        tokenUsage: {
          prompt: promptTokens,
          completion: completionTokens,
          total: promptTokens + completionTokens,
          cached: 0, // No caching for this request
        },
        metadata: {
          latencyMs: latency,
          modelType: this.config.modelType || 'custom',
          transformed: isTransformed,
          originalPrompt: isTransformed ? prompt : undefined,
        }
      };
      
      // Save result to cache if successful and caching enabled
      if (isCacheEnabled() && !bustCache && result.output && !result.error) {
        const cacheKey = this.getCacheKey(transformedPrompt);
        const cache = await getCache ? await getCache() : await import('../cache').then(m => m.getCache());
        const resultToCache = JSON.stringify(result);
        
        try {
          await cache.set(cacheKey, resultToCache);
          logger.debug(`Stored SageMaker response in cache with key: ${cacheKey.substring(0, 100)}...`);
        } catch (error) {
          logger.warn(`Failed to store SageMaker response in cache: ${error}`);
        }
      }
      
      return result;
    } catch (error: any) {
      logger.error(`SageMaker API error: ${error}`);
      return {
        error: `SageMaker API error: ${error.message || String(error)}`,
      };
    }
  }
}

/**
 * Provider for embeddings with SageMaker endpoints
 */
export class SageMakerEmbeddingProvider extends SageMakerGenericProvider implements ApiEmbeddingProvider {
  async callApi(): Promise<ProviderResponse> {
    throw new Error('callApi is not implemented for embedding provider. Use callEmbeddingApi instead.');
  }
  
  /**
   * Generate a consistent cache key for SageMaker embedding requests
   */
  private getCacheKey(text: string): string {
    // Create a deterministic representation of the request parameters
    const configForKey = {
      endpoint: this.getEndpointName(),
      modelType: this.config.modelType,
      contentType: this.getContentType(),
      acceptType: this.getAcceptType(),
      region: this.getRegion(),
      responseFormat: this.config.responseFormat,
    };
    
    return `sagemaker:embedding:v1:${this.getEndpointName()}:${text}:${JSON.stringify(configForKey)}`;
  }
  
  /**
   * Invoke SageMaker endpoint for embeddings with caching, delay support, and transformations
   */
  async callEmbeddingApi(text: string, context?: CallApiContextParams): Promise<ProviderEmbeddingResponse> {
    // Import cache functions dynamically to avoid circular dependencies
    const { isCacheEnabled, getCache } = await import('../cache');
    
    // Get the delay value - the context delay takes precedence over the provider's delay
    const delayMs = context?.originalProvider?.delay || this.delay;
    
    // Apply transformation to the text if a transform is specified
    const transformedText = await this.applyTransformation(text, context);
    const isTransformed = transformedText !== text;
    
    if (isTransformed) {
      logger.debug(`Text transformed for SageMaker embedding endpoint ${this.getEndpointName()}`);
      logger.debug(`Original: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
      logger.debug(`Transformed: ${transformedText.substring(0, 100)}${transformedText.length > 100 ? '...' : ''}`);
    }
    
    // Check if we should use cache - use the transformed text for cache key
    const bustCache = context?.debug === true; // If debug mode is on, bust the cache
    if (isCacheEnabled() && !bustCache) {
      const cacheKey = this.getCacheKey(transformedText);
      const cache = await getCache ? await getCache() : await import('../cache').then(m => m.getCache());
      
      // Try to get from cache
      const cachedResult = await cache.get<string>(cacheKey);
      if (cachedResult) {
        logger.debug(`Using cached SageMaker embedding response for ${this.getEndpointName()}`);
        
        try {
          // Parse the cached result
          const parsedResult = JSON.parse(cachedResult) as ProviderEmbeddingResponse;
          
          // Add cache flag to token usage
          if (parsedResult.tokenUsage) {
            parsedResult.tokenUsage.cached = parsedResult.tokenUsage.prompt || 0;
          }
          
          return parsedResult;
        } catch (error) {
          logger.warn(`Failed to parse cached SageMaker embedding response: ${error}`);
          // Continue with API call if parsing fails
        }
      }
    }
    
    // Apply delay if specified and not using cached response
    if (delayMs && delayMs > 0) {
      logger.debug(`Applying delay of ${delayMs}ms before calling SageMaker embedding endpoint ${this.getEndpointName()}`);
      await sleep(delayMs);
    }
    
    // Not in cache or cache disabled, make the actual API call
    const runtime = await this.getSageMakerRuntimeInstance();
    
    let payload;
    const modelType = this.config.modelType || 'custom';
    
    logger.debug(`Formatting embedding payload for model type: ${modelType}`);
    
    switch(modelType) {
      case 'openai':
        payload = JSON.stringify({
          input: transformedText,
          model: "embedding",
        });
        break;
        
      case 'huggingface':
        payload = JSON.stringify({
          inputs: transformedText,
        });
        break;
        
      case 'custom':
      default:
        // Try to support multiple common formats
        payload = JSON.stringify({
          input: transformedText,
          text: transformedText,
          inputs: transformedText,
        });
        break;
    }
    
    logger.debug(`Calling SageMaker embedding endpoint ${this.getEndpointName()}`);
    logger.debug(`With payload: ${payload}`);
    
    try {
      const { InvokeEndpointCommand } = await import('@aws-sdk/client-sagemaker-runtime');
      
      const command = new InvokeEndpointCommand({
        EndpointName: this.getEndpointName(),
        ContentType: this.getContentType(),
        Accept: this.getAcceptType(),
        Body: payload,
      });
      
      const startTime = Date.now();
      const response = await runtime.send(command);
      const endTime = Date.now();
      const latency = endTime - startTime;
      
      if (!response.Body) {
        logger.error('No response body returned from SageMaker embedding endpoint');
        return {
          error: 'No response body returned from SageMaker embedding endpoint',
        };
      }
      
      const responseBody = new TextDecoder().decode(response.Body);
      logger.debug(`SageMaker embedding response: ${responseBody.substring(0, 200)}...`);
      
      let responseJson;
      try {
        responseJson = JSON.parse(responseBody);
      } catch (error) {
        return {
          error: `Failed to parse embedding response as JSON: ${error}`,
        };
      }
      
      // If response format specifies a path, extract it using JSONPath
      if (this.config.responseFormat?.path) {
        try {
          const jsonpath = require('jsonpath');
          
          // Validate JSONPath before using it
          const pathValidation = this.validateJsonPath(this.config.responseFormat.path);
          if (!pathValidation.valid) {
            logger.warn(`Skipping extraction with invalid JSONPath: ${pathValidation.error}`);
            // Continue to try other extraction methods
          } else {
            const extracted = jsonpath.query(responseJson, this.config.responseFormat.path);
            
            if (extracted.length === 0) {
              logger.warn(`JSONPath matched no data: ${this.config.responseFormat.path}`);
              logger.debug(`Response JSON structure: ${JSON.stringify(responseJson).substring(0, 200)}...`);
              // Continue to try other extraction methods
            } else {
              // Log the type of extracted data for debugging
              logger.debug(`Extracted embedding data type: ${typeof extracted[0]}, isArray: ${Array.isArray(extracted[0])}`);
              
              if (Array.isArray(extracted[0]) && extracted[0].every((val: any) => typeof val === 'number')) {
                const result = {
                  embedding: extracted[0],
                  tokenUsage: {
                    prompt: Math.ceil(text.length / 4), // Very rough estimate
                    cached: 0,
                  },
                  metadata: {
                    transformed: isTransformed,
                    originalText: isTransformed ? text : undefined
                  }
                };
                
                // Cache the result if caching is enabled
                this.cacheEmbeddingResult(result, transformedText, context, isTransformed, isTransformed ? text : undefined);
                
                return result;
              } else {
                logger.warn('Extracted data is not a valid embedding array, trying other extraction methods');
              }
            }
          }
        } catch (error) {
          logger.warn(`Failed to extract embedding from JSON path: ${this.config.responseFormat.path}, Error: ${error}`);
          logger.debug(`Response JSON structure: ${JSON.stringify(responseJson).substring(0, 200)}...`);
          // Continue to try other extraction methods
        }
      }
      
      // Try various common embedding response formats
      const embedding = responseJson.embedding || 
                       responseJson.embeddings || 
                       responseJson.data?.[0]?.embedding ||
                       (Array.isArray(responseJson) ? responseJson[0] : responseJson);
                       
      if (!embedding || !Array.isArray(embedding)) {
        return {
          error: `Invalid embedding response format. Could not find embedding array in: ${JSON.stringify(responseJson).substring(0, 100)}...`,
        };
      }
      
      const result = {
        embedding,
        tokenUsage: {
          prompt: Math.ceil(text.length / 4), // Very rough estimate
          cached: 0,
        },
        metadata: {
          transformed: isTransformed,
          originalText: isTransformed ? text : undefined
        }
      };
      
      // Cache the result if caching is enabled
      this.cacheEmbeddingResult(result, transformedText, context, isTransformed, isTransformed ? text : undefined);
      
      return result;
    } catch (error: any) {
      logger.error(`SageMaker embedding API error: ${error}`);
      return {
        error: `SageMaker embedding API error: ${error.message || String(error)}`,
      };
    }
  }
  
  /**
   * Helper method to cache embedding results
   */
  private async cacheEmbeddingResult(
    result: ProviderEmbeddingResponse,
    text: string, // This is the transformed text
    context?: CallApiContextParams,
    isTransformed: boolean = false,
    originalText?: string
  ): Promise<void> {
    const { isCacheEnabled, getCache } = await import('../cache');
    const bustCache = context?.debug === true;
    
    // Save result to cache if successful and caching enabled
    if (isCacheEnabled() && !bustCache && result.embedding && !result.error) {
      const cacheKey = this.getCacheKey(text);
      const cache = await getCache ? await getCache() : await import('../cache').then(m => m.getCache());
      
      // Add metadata about transformation
      if (isTransformed && originalText && !result.metadata) {
        result.metadata = {
          transformed: true,
          originalText
        };
      } else if (isTransformed && originalText && result.metadata) {
        result.metadata.transformed = true;
        result.metadata.originalText = originalText;
      }
      
      const resultToCache = JSON.stringify(result);
      
      try {
        await cache.set(cacheKey, resultToCache);
        logger.debug(`Stored SageMaker embedding response in cache with key: ${cacheKey.substring(0, 100)}...`);
      } catch (error) {
        logger.warn(`Failed to store SageMaker embedding response in cache: ${error}`);
      }
    }
  }
}