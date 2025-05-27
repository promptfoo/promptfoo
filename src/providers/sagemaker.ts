import crypto from 'crypto';
import { getEnvFloat, getEnvInt, getEnvString } from '../envars';
import logger from '../logger';
import telemetry from '../telemetry';
import type {
  ApiEmbeddingProvider,
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderEmbeddingResponse,
  ProviderResponse,
} from '../types';
import type { EnvOverrides } from '../types/env';
import { transform } from '../util/transform';
import type { TransformContext } from '../util/transform';
import { parseChatPrompt } from './shared';

/**
 * Sleep utility function for implementing delays
 * @param ms Milliseconds to sleep
 * @returns Promise that resolves after the specified delay
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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
    path?: string; // JavaScript expression to extract content (formerly JSONPath)
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

  // Custom provider ID, separate from the id() method
  private providerId?: string;

  constructor(
    endpointName: string,
    options: {
      config?: SageMakerOptions;
      id?: string;
      env?: EnvOverrides;
      delay?: number;
      transform?: string;
    } = {},
  ) {
    const { config, id, env, delay, transform } = options;
    this.env = env;
    this.endpointName = endpointName;
    this.config = config || {};
    this.delay = delay || this.config.delay;
    this.transform = transform || this.config.transform;
    this.providerId = id; // Store custom ID if provided

    // Record telemetry for SageMaker usage
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'sagemaker',
    });
  }

  id(): string {
    // Use custom provider ID if provided, otherwise use default format
    return this.providerId || `sagemaker:${this.endpointName}`;
  }

  toString(): string {
    return `[Amazon SageMaker Provider ${this.endpointName}]`;
  }

  /**
   * Get AWS credentials from config or environment
   */
  async getCredentials(): Promise<any> {
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
      } catch {
        throw new Error(
          `Failed to load AWS SSO profile. Please install @aws-sdk/credential-provider-sso`,
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
          maxAttempts: getEnvInt('AWS_SAGEMAKER_MAX_RETRIES', 3),
          retryMode: 'adaptive',
          ...(credentials ? { credentials } : {}),
        });

        logger.debug(`SageMaker client initialized for region ${this.getRegion()}`);
      } catch {
        throw new Error(
          'The @aws-sdk/client-sagemaker-runtime package is required. Please install it with: npm install @aws-sdk/client-sagemaker-runtime',
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
    return this.config?.endpoint || this.endpointName;
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
  async applyTransformation(prompt: string, context?: CallApiContextParams): Promise<string> {
    // If no transform is specified, return the original prompt
    if (!this.transform) {
      return prompt;
    }

    try {
      // Create a transform context from the available information
      const transformContext: TransformContext = {
        vars: context?.vars || {},
        prompt: context?.prompt || { raw: prompt },
        uuid: `sagemaker-${this.endpointName}-${Date.now()}`,
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
          // SECURITY WARNING: Using new Function() with dynamic content can be risky
          // This is safe only if transform content comes from trusted sources (like config files)
          // and not from user input or external API responses

          // Simple transform function
          if (transformFn.includes('=>')) {
            // Arrow function format: prompt => ...
            // We're wrapping the code in a try/catch and ensuring it's coming from a trusted source
            const fn = new Function(
              'prompt',
              'context',
              `try { return (${transformFn})(prompt, context); } catch(e) { throw new Error("Transform function error: " + e.message); }`,
            );
            const result = fn(prompt, transformContext);

            // Handle all possible return types, including falsy values (empty string, 0, etc.)
            if (result === undefined || result === null) {
              // Only skip undefined/null, allowing empty strings, false, 0, etc.
              logger.debug('Transform function returned null or undefined, using original prompt');
              return prompt;
            }

            if (typeof result === 'string') {
              return result; // Return string results directly (even empty strings)
            } else if (typeof result === 'object') {
              return JSON.stringify(result); // Convert objects to JSON
            } else {
              // Handle other types (numbers, booleans) by converting to string
              return String(result);
            }
          } else {
            // Regular function format
            // We're wrapping the code in a try/catch and ensuring it's coming from a trusted source
            const fn = new Function(
              'prompt',
              'context',
              `try { ${transformFn} } catch(e) { throw new Error("Transform function error: " + e.message); }`,
            );
            const result = fn(prompt, transformContext);

            // Handle all possible return types, including falsy values (empty string, 0, etc.)
            if (result === undefined || result === null) {
              // Only skip undefined/null, allowing empty strings, false, 0, etc.
              logger.debug('Transform function returned null or undefined, using original prompt');
              return prompt;
            }

            if (typeof result === 'string') {
              return result; // Return string results directly (even empty strings)
            } else if (typeof result === 'object') {
              return JSON.stringify(result); // Convert objects to JSON
            } else {
              // Handle other types (numbers, booleans) by converting to string
              return String(result);
            }
          }
        } catch (transformError) {
          logger.error(`Error executing inline transform: ${transformError}`);
        }
      } else {
        // Use the transform utility for file transforms
        try {
          const { TransformInputType } = await import('../util/transform');
          const transformed = await transform(
            transformFn,
            prompt,
            transformContext,
            false,
            TransformInputType.OUTPUT,
          );

          // Handle all possible return types, including falsy values (empty string, 0, etc.)
          if (transformed === undefined || transformed === null) {
            // Only skip undefined/null, allowing empty strings, false, 0, etc.
            logger.debug('Transform function returned null or undefined, using original prompt');
            return prompt;
          }

          if (typeof transformed === 'string') {
            return transformed; // Return string results directly (even empty strings)
          } else if (typeof transformed === 'object') {
            return JSON.stringify(transformed); // Convert objects to JSON
          } else {
            // Handle other types (numbers, booleans) by converting to string
            return String(transformed);
          }
        } catch (transformError) {
          logger.error(`Error using transform utility: ${transformError}`);
        }
      }

      // Fall back to the original prompt if the transform result is not usable
      logger.warn(`Transform did not produce a valid result, using original prompt`);
      return prompt;
    } catch (_) {
      logger.error(`Error applying transform to prompt: ${_}`);
      return prompt; // Return original prompt on error
    }
  }

  /**
   * Extracts data from a response using a path expression
   * Supports JavaScript expressions and file-based transforms
   */
  protected async extractFromPath(
    responseJson: any,
    pathExpression: string | undefined,
  ): Promise<any> {
    if (!pathExpression) {
      return responseJson;
    }

    try {
      // For file-based transforms, use them directly
      if (pathExpression.startsWith('file://')) {
        try {
          // Use the transform utility for file-based transforms
          const { TransformInputType } = await import('../util/transform');
          const transformedResult = await transform(
            pathExpression,
            responseJson,
            { prompt: {} }, // Minimal context since we're just transforming the response
            false, // Don't validate return to allow undefined/null
            TransformInputType.OUTPUT,
          );

          // Return the transformed result, or original JSON if undefined/null
          return transformedResult !== undefined && transformedResult !== null
            ? transformedResult
            : responseJson;
        } catch (error) {
          logger.warn(`Failed to transform response using file: ${error}`);
          return responseJson;
        }
      }

      // For JavaScript expressions, create a simple function
      try {
        // Create a function that evaluates the expression with 'json' as the input
        const result = new Function(
          'json',
          `try { return ${pathExpression}; } catch(e) { return undefined; }`,
        )(responseJson);

        if (result === undefined) {
          logger.warn(`Path expression "${pathExpression}" did not match any data in the response`);
          logger.debug(
            `Response JSON structure: ${JSON.stringify(responseJson).substring(0, 200)}...`,
          );
          return responseJson;
        }

        return result;
      } catch (error) {
        logger.warn(`Failed to evaluate expression "${pathExpression}": ${error}`);
        return responseJson;
      }
    } catch (error) {
      logger.warn(`Failed to extract data using path expression "${pathExpression}": ${error}`);
      logger.debug(`Response JSON structure: ${JSON.stringify(responseJson).substring(0, 200)}...`);
      return responseJson;
    }
  }
}

/**
 * Provider for text generation with SageMaker endpoints
 */
export class SageMakerCompletionProvider extends SageMakerGenericProvider implements ApiProvider {
  static SAGEMAKER_MODEL_TYPES = [
    'openai',
    'anthropic',
    'llama',
    'huggingface',
    'jumpstart',
    'custom',
  ];

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

    switch (modelType) {
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
        } catch {
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
        } catch {
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
        } catch {
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
          },
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
          },
        };
        break;

      case 'custom':
      default:
        // For custom, we just pass through the raw prompt data
        try {
          // Try to parse as JSON
          const parsedPrompt = JSON.parse(prompt);
          payload = parsedPrompt;
        } catch {
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
  async parseResponse(responseBody: string): Promise<any> {
    const modelType = this.config.modelType || 'custom';
    let responseJson;

    logger.debug(`Parsing response for model type: ${modelType}`);

    try {
      responseJson = JSON.parse(responseBody);
    } catch {
      logger.debug('Response is not JSON, returning as-is');
      return responseBody; // Return as is if not JSON
    }

    // If response format specifies a path, extract it using expression evaluation
    if (this.config.responseFormat?.path) {
      try {
        const pathExpression = this.config.responseFormat.path;
        const extracted = await this.extractFromPath(responseJson, pathExpression);
        return extracted;
      } catch (error) {
        logger.warn(
          `Failed to extract from path: ${this.config.responseFormat.path}, Error: ${error}`,
        );
        logger.debug(
          `Response JSON structure: ${JSON.stringify(responseJson).substring(0, 200)}...`,
        );
        return responseJson;
      }
    }

    // Check for JumpStart Llama format first since that's common
    if (responseJson.generated_text) {
      logger.debug('Detected JumpStart model response format with generated_text field');
      return responseJson.generated_text;
    }

    switch (modelType) {
      case 'openai':
        return (
          responseJson.choices?.[0]?.message?.content ||
          responseJson.choices?.[0]?.text ||
          responseJson.generation ||
          responseJson
        );

      case 'anthropic':
        return responseJson.content?.[0]?.text || responseJson.completion || responseJson;

      case 'llama':
        return (
          responseJson.generation ||
          responseJson.choices?.[0]?.message?.content ||
          responseJson.choices?.[0]?.text ||
          responseJson
        );

      case 'huggingface':
        return Array.isArray(responseJson)
          ? responseJson[0]?.generated_text || responseJson[0]
          : responseJson.generated_text || responseJson;

      case 'jumpstart':
        // For AWS JumpStart models
        return responseJson.generated_text || responseJson;

      case 'custom':
      default:
        // For custom endpoints, try common patterns
        return (
          responseJson.output ||
          responseJson.generation ||
          responseJson.response ||
          responseJson.text ||
          responseJson.generated_text ||
          responseJson.choices?.[0]?.message?.content ||
          responseJson.choices?.[0]?.text ||
          responseJson
        );
    }
  }

  /**
   * Generate a consistent cache key for SageMaker requests
   * Uses crypto.createHash to generate a shorter, more efficient key
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

    const configStr = JSON.stringify(configForKey);

    // Generate shorter, more efficient hashed keys
    const promptHash = crypto.createHash('sha256').update(prompt).digest('hex').substring(0, 16);
    const configHash = crypto.createHash('sha256').update(configStr).digest('hex').substring(0, 8);

    return `sagemaker:v1:${this.getEndpointName()}:${promptHash}:${configHash}`;
  }

  /**
   * Invoke SageMaker endpoint for text generation with caching, delay support, and transformations
   */
  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
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
      logger.debug(
        `Transformed: ${transformedPrompt.substring(0, 100)}${transformedPrompt.length > 100 ? '...' : ''}`,
      );
    }

    // Check if we should use cache - use the transformed prompt for cache key
    const bustCache = context?.debug === true; // If debug mode is on, bust the cache
    if (isCacheEnabled() && !bustCache) {
      const cacheKey = this.getCacheKey(transformedPrompt);
      const cache = (await getCache)
        ? await getCache()
        : await import('../cache').then((m) => m.getCache());

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
        } catch (_) {
          logger.warn(`Failed to parse cached SageMaker response: ${_}`);
          // Continue with API call if parsing fails
        }
      }
    }

    // Apply delay if specified and not using cached response
    if (delayMs && delayMs > 0) {
      logger.debug(
        `Applying delay of ${delayMs}ms before calling SageMaker endpoint ${this.getEndpointName()}`,
      );
      await sleep(delayMs);
    }

    // Not in cache or cache disabled, make the actual API call
    const runtime = await this.getSageMakerRuntimeInstance();
    const payload = this.formatPayload(transformedPrompt);

    logger.debug(`Calling SageMaker endpoint ${this.getEndpointName()}`);
    logger.debug(
      `With payload: ${payload.length > 1000 ? payload.substring(0, 1000) + '...' : payload}`,
    );

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
      const _latency = endTime - startTime;

      if (!response.Body) {
        logger.error('No response body returned from SageMaker endpoint');
        return {
          error: 'No response body returned from SageMaker endpoint',
        };
      }

      const responseBody = new TextDecoder().decode(response.Body);
      logger.debug(
        `SageMaker response (truncated): ${responseBody.length > 1000 ? responseBody.substring(0, 1000) + '...' : responseBody}`,
      );

      const output = await this.parseResponse(responseBody);

      // Calculate token usage estimation (very rough estimate)
      // Note: 4 characters per token is a simplified approximation
      const promptTokens = Math.ceil(payload.length / 4);
      const completionTokens = Math.ceil((typeof output === 'string' ? output.length : 0) / 4);

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
          latencyMs: _latency,
          modelType: this.config.modelType || 'custom',
          transformed: isTransformed,
          originalPrompt: isTransformed ? prompt : undefined,
        },
      };

      // Save result to cache if successful and caching enabled
      if (isCacheEnabled() && !bustCache && result.output && !result.error) {
        const cacheKey = this.getCacheKey(transformedPrompt);
        const cache = (await getCache)
          ? await getCache()
          : await import('../cache').then((m) => m.getCache());
        const resultToCache = JSON.stringify(result);

        try {
          await cache.set(cacheKey, resultToCache);
          logger.debug(
            `Stored SageMaker response in cache with key: ${cacheKey.substring(0, 100)}...`,
          );
        } catch (_) {
          logger.warn(`Failed to store SageMaker response in cache: ${_}`);
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
export class SageMakerEmbeddingProvider
  extends SageMakerGenericProvider
  implements ApiEmbeddingProvider
{
  async callApi(): Promise<ProviderResponse> {
    throw new Error(
      'callApi is not implemented for embedding provider. Use callEmbeddingApi instead.',
    );
  }

  /**
   * Generate a consistent cache key for SageMaker embedding requests
   * Uses crypto.createHash to generate a shorter, more efficient key
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

    const configStr = JSON.stringify(configForKey);

    // Generate shorter, more efficient hashed keys
    const textHash = crypto.createHash('sha256').update(text).digest('hex').substring(0, 16);
    const configHash = crypto.createHash('sha256').update(configStr).digest('hex').substring(0, 8);

    return `sagemaker:embedding:v1:${this.getEndpointName()}:${textHash}:${configHash}`;
  }

  /**
   * Invoke SageMaker endpoint for embeddings with caching, delay support, and transformations
   */
  async callEmbeddingApi(
    text: string,
    context?: CallApiContextParams,
  ): Promise<ProviderEmbeddingResponse> {
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
      logger.debug(
        `Transformed: ${transformedText.substring(0, 100)}${transformedText.length > 100 ? '...' : ''}`,
      );
    }

    // Check if we should use cache - use the transformed text for cache key
    const bustCache = context?.debug === true; // If debug mode is on, bust the cache
    if (isCacheEnabled() && !bustCache) {
      const cacheKey = this.getCacheKey(transformedText);
      const cache = (await getCache)
        ? await getCache()
        : await import('../cache').then((m) => m.getCache());

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
        } catch (_) {
          logger.warn(`Failed to parse cached SageMaker embedding response: ${_}`);
          // Continue with API call if parsing fails
        }
      }
    }

    // Apply delay if specified and not using cached response
    if (delayMs && delayMs > 0) {
      logger.debug(
        `Applying delay of ${delayMs}ms before calling SageMaker embedding endpoint ${this.getEndpointName()}`,
      );
      await sleep(delayMs);
    }

    // Not in cache or cache disabled, make the actual API call
    const runtime = await this.getSageMakerRuntimeInstance();

    let payload;
    const modelType = this.config.modelType || 'custom';

    logger.debug(`Formatting embedding payload for model type: ${modelType}`);

    switch (modelType) {
      case 'openai':
        payload = JSON.stringify({
          input: transformedText,
          model: 'embedding',
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
      const _latency = endTime - startTime;

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
      } catch (_) {
        return {
          error: `Failed to parse embedding response as JSON: ${_}`,
        };
      }

      // Try various common embedding response formats first
      const embedding =
        responseJson.embedding ||
        responseJson.embeddings ||
        responseJson.data?.[0]?.embedding ||
        (Array.isArray(responseJson) ? responseJson[0] : responseJson);

      // If response format specifies a path, extract it using JavaScript expression evaluation
      if (this.config.responseFormat?.path) {
        try {
          const pathExpression = this.config.responseFormat.path;

          // Extract data using the expression
          const extracted = await this.extractFromPath(responseJson, pathExpression);

          // Validate that the extracted data is an array of numbers (embedding)
          if (Array.isArray(extracted) && extracted.every((val) => typeof val === 'number')) {
            const result = {
              embedding: extracted,
              tokenUsage: {
                prompt: Math.ceil(text.length / 4), // Approximate token count
                cached: 0,
              },
              metadata: {
                transformed: isTransformed,
                originalText: isTransformed ? text : undefined,
              },
            };

            // Cache the result if caching is enabled
            await this.cacheEmbeddingResult(
              result,
              transformedText,
              context,
              isTransformed,
              isTransformed ? text : undefined,
            );

            return result;
          } else {
            logger.warn(
              'Extracted data is not a valid embedding array, trying other extraction methods',
            );
          }
        } catch (error) {
          logger.warn(
            `Failed to extract embedding from path expression: ${this.config.responseFormat.path}, Error: ${error}`,
          );
          logger.debug(
            `Response JSON structure: ${JSON.stringify(responseJson).substring(0, 200)}...`,
          );
          // Continue to try other extraction methods
        }
      }

      if (!embedding || !Array.isArray(embedding)) {
        return {
          error: `Invalid embedding response format. Could not find embedding array in: ${JSON.stringify(responseJson).substring(0, 100)}...`,
        };
      }

      const result = {
        embedding,
        tokenUsage: {
          prompt: Math.ceil(text.length / 4), // Approximate token count
          cached: 0,
        },
        metadata: {
          transformed: isTransformed,
          originalText: isTransformed ? text : undefined,
        },
      };

      // Cache the result if caching is enabled
      await this.cacheEmbeddingResult(
        result,
        transformedText,
        context,
        isTransformed,
        isTransformed ? text : undefined,
      );

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
    originalText?: string,
  ): Promise<void> {
    const { isCacheEnabled, getCache } = await import('../cache');
    const bustCache = context?.debug === true;

    // Save result to cache if successful and caching enabled
    if (isCacheEnabled() && !bustCache && result.embedding && !result.error) {
      const cacheKey = this.getCacheKey(text);
      const cache = (await getCache)
        ? await getCache()
        : await import('../cache').then((m) => m.getCache());

      // Add metadata about transformation
      if (isTransformed && originalText && !result.metadata) {
        result.metadata = {
          transformed: true,
          originalText,
        };
      } else if (isTransformed && originalText && result.metadata) {
        result.metadata.transformed = true;
        result.metadata.originalText = originalText;
      }

      const resultToCache = JSON.stringify(result);

      try {
        await cache.set(cacheKey, resultToCache);
        logger.debug(
          `Stored SageMaker embedding response in cache with key: ${cacheKey.substring(0, 100)}...`,
        );
      } catch (_) {
        logger.warn(`Failed to store SageMaker embedding response in cache: ${_}`);
      }
    }
  }
}
