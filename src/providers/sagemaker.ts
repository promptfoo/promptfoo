import crypto from 'crypto';

import { z } from 'zod';
import { getEnvFloat, getEnvInt, getEnvString } from '../envars';
import logger from '../logger';
import telemetry from '../telemetry';
import { transform } from '../util/transform';

import type { EnvOverrides } from '../types/env';
import type {
  ApiEmbeddingProvider,
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderEmbeddingResponse,
  ProviderOptions,
  ProviderResponse,
} from '../types/index';
import type { TransformContext } from '../util/transform';

/**
 * Sleep utility function for implementing delays
 * @param ms Milliseconds to sleep
 * @returns Promise that resolves after the specified delay
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const SUPPORTED_MODEL_TYPES = ['openai', 'llama', 'huggingface', 'jumpstart', 'custom'] as const;
/**
 * Zod schema for validating SageMaker options
 */
const SageMakerConfigSchema = z.strictObject({
  // AWS credentials options
  accessKeyId: z.string().optional(),
  profile: z.string().optional(),
  region: z.string().optional(),
  secretAccessKey: z.string().optional(),
  sessionToken: z.string().optional(),

  // SageMaker specific options
  endpoint: z.string().optional(),
  contentType: z.string().optional(),
  acceptType: z.string().optional(),

  // Model parameters
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
  topP: z.number().optional(),
  stopSequences: z.array(z.string()).optional(),

  // Provider behavior options
  delay: z.number().optional(), // Delay between API calls in milliseconds
  transform: z.string().optional(), // Transform function or file path to transform prompts

  // Model type for request/response handling
  // TODO(Will): What is custom? User uploaded model?
  // - Jumpstart is a model service, not a model type.
  modelType: z.enum(SUPPORTED_MODEL_TYPES).optional(),

  // Response format options
  responseFormat: z
    .strictObject({
      type: z.string().optional(),
      path: z.string().optional(), // JavaScript expression to extract content (formerly JSONPath)
    })
    .optional(),

  basePath: z.string().optional(),
});

type SageMakerConfig = z.infer<typeof SageMakerConfigSchema>;

interface SageMakerOptions extends ProviderOptions {
  config?: SageMakerConfig;
}

/**
 * Base class for SageMaker providers with common functionality
 */
abstract class SageMakerGenericProvider {
  env?: EnvOverrides;
  sagemakerRuntime?: any; // SageMaker runtime client
  config: SageMakerConfig;
  endpointName: string;
  delay?: number; // Delay between API calls in milliseconds
  transform?: string; // Transform function for modifying prompts before sending

  // Custom provider ID, separate from the id() method
  private providerId?: string;

  constructor(endpointName: string, options: SageMakerOptions) {
    const { config, id, env, delay, transform } = options;
    this.env = env;
    this.endpointName = endpointName;

    // Validate the config
    try {
      SageMakerConfigSchema.parse(config);
    } catch (error) {
      logger.warn(
        `Error validating SageMaker config\nConfig: ${JSON.stringify(config)}\n${error instanceof z.ZodError ? z.prettifyError(error) : error}`,
      );
    }

    this.config = config ?? {};
    this.delay = delay || this.config.delay;
    this.transform = transform || this.config.transform;
    this.providerId = id; // Store custom ID if provided

    // Record telemetry for SageMaker usage
    telemetry.record('feature_used', {
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
   * Convert a transform result value to string. Returns null for null/undefined.
   */
  private coerceTransformResult(result: any, fallback: string): string {
    if (result === undefined || result === null) {
      logger.debug('Transform function returned null or undefined, using original prompt');
      return fallback;
    }
    if (typeof result === 'string') {
      return result;
    }
    if (typeof result === 'object') {
      return JSON.stringify(result);
    }
    return String(result);
  }

  /**
   * Apply an inline (non-file) transform function to a prompt.
   */
  private applyInlineTransform(
    transformFn: string,
    prompt: string,
    transformContext: TransformContext,
  ): string {
    // SECURITY WARNING: Using new Function() with dynamic content can be risky.
    // This is safe only if transform content comes from trusted sources (config files).
    const code = transformFn.includes('=>')
      ? `try { return (${transformFn})(prompt, context); } catch(e) { throw new Error("Transform function error: " + e.message); }`
      : `try { ${transformFn} } catch(e) { throw new Error("Transform function error: " + e.message); }`;

    const fn = new Function('prompt', 'context', code);
    const result = fn(prompt, transformContext);
    return this.coerceTransformResult(result, prompt);
  }

  /**
   * Apply a file-based transform to a prompt.
   */
  private async applyFileTransform(
    transformFn: string,
    prompt: string,
    transformContext: TransformContext,
  ): Promise<string> {
    const { TransformInputType } = await import('../util/transform');
    const transformed = await transform(
      transformFn,
      prompt,
      transformContext,
      false,
      TransformInputType.OUTPUT,
    );
    return this.coerceTransformResult(transformed, prompt);
  }

  /**
   * Apply transformation to a prompt if a transform function is specified
   * @param prompt The original prompt to transform
   * @param context Optional context information for the transformation
   * @returns The transformed prompt, or the original if no transformation is applied
   */
  async applyTransformation(prompt: string, context?: CallApiContextParams): Promise<string> {
    if (!this.transform) {
      return prompt;
    }

    try {
      const transformContext: TransformContext = {
        vars: context?.vars || {},
        prompt: context?.prompt || { raw: prompt },
        uuid: `sagemaker-${this.endpointName}-${Date.now()}`,
      };

      const transformFn = this.transform || context?.originalProvider?.transform;
      if (!transformFn) {
        return prompt;
      }

      logger.debug(`Applying transform to prompt for SageMaker endpoint ${this.getEndpointName()}`);

      if (typeof transformFn === 'string' && !transformFn.startsWith('file://')) {
        try {
          return this.applyInlineTransform(transformFn, prompt, transformContext);
        } catch (transformError) {
          logger.error(`Error executing inline transform: ${transformError}`);
          logger.warn('Transform did not produce a valid result, using original prompt');
          return prompt;
        }
      }

      try {
        return await this.applyFileTransform(transformFn, prompt, transformContext);
      } catch (transformError) {
        logger.error(`Error using transform utility: ${transformError}`);
        logger.warn('Transform did not produce a valid result, using original prompt');
        return prompt;
      }
    } catch (_) {
      logger.error(`Error applying transform to prompt: ${_}`);
      return prompt;
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
  readonly modelType: SageMakerConfig['modelType'];

  constructor(endpointName: string, options: SageMakerOptions) {
    super(endpointName, options);

    this.modelType = this.parseModelType(options.config?.modelType);
  }

  /**
   * Model type must be specified within the id or the `config.modelType` field.
   */
  private parseModelType(modelType: SageMakerConfig['modelType']): SageMakerConfig['modelType'] {
    // If an ID is provided, attempt to extract the model type from it
    const match = this.id().match(/^sagemaker:(?<modelType>.+):.+$/);
    if (match) {
      const modelTypeFromId = match.groups!.modelType;

      // Validate the model type from ID
      if (SUPPORTED_MODEL_TYPES.includes(modelTypeFromId as any)) {
        return modelTypeFromId as SageMakerConfig['modelType'];
      } else {
        throw new Error(
          `Invalid model type "${modelTypeFromId}" in provider ID. Valid types are: ${SUPPORTED_MODEL_TYPES.join(', ')}`,
        );
      }
    }

    // If a model type is provided in the config, validate it
    if (modelType) {
      if (SUPPORTED_MODEL_TYPES.includes(modelType)) {
        return modelType;
      } else {
        throw new Error(
          `Invalid model type "${modelType}" in \`config.modelType\`. Valid types are: ${SUPPORTED_MODEL_TYPES.join(', ')}`,
        );
      }
    }

    throw new Error(
      'Model type must be set either in `config.modelType` or as part of the Provider ID, for example: "sagemaker:<model_type>:<endpoint>"',
    );
  }

  /**
   * Format the request payload based on model type
   */
  formatPayload(prompt: string): string {
    const maxTokens = this.config.maxTokens || getEnvInt('AWS_SAGEMAKER_MAX_TOKENS') || 1024;
    const temperature =
      typeof this.config.temperature === 'number'
        ? this.config.temperature
        : (getEnvFloat('AWS_SAGEMAKER_TEMPERATURE') ?? 0.7);
    const topP =
      typeof this.config.topP === 'number'
        ? this.config.topP
        : (getEnvFloat('AWS_SAGEMAKER_TOP_P') ?? 1.0);
    const stopSequences = this.config.stopSequences || [];

    let payload: any;

    logger.debug(`Formatting payload for model type: ${this.modelType}`);

    switch (this.modelType) {
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

      case 'llama':
        // TODO(Will): Can these be consolidated?
        try {
          const messages = JSON.parse(prompt);
          if (Array.isArray(messages)) {
            payload = {
              inputs: messages,
              parameters: {
                max_new_tokens: maxTokens,
                temperature,
                top_p: topP,
                stop: stopSequences.length > 0 ? stopSequences : undefined,
              },
            };
          } else {
            throw new Error('Not valid messages format');
          }
        } catch {
          // Simple text completion for Llama
          payload = {
            inputs: prompt,
            parameters: {
              max_new_tokens: maxTokens,
              temperature,
              top_p: topP,
              stop: stopSequences.length > 0 ? stopSequences : undefined,
            },
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
    let responseJson;

    logger.debug(`Parsing response for model type: ${this.modelType}`);

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

    switch (this.modelType) {
      case 'openai':
        return (
          responseJson.choices?.[0]?.message?.content ||
          responseJson.choices?.[0]?.text ||
          responseJson.generation ||
          responseJson
        );

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
   * Try to retrieve a cached completion result. Returns the cached response or null.
   */
  private async getCachedCompletionResult(
    transformedPrompt: string,
    originalPrompt: string,
    isTransformed: boolean,
    bustCache: boolean,
  ): Promise<ProviderResponse | null> {
    const { isCacheEnabled, getCache } = await import('../cache');
    if (!isCacheEnabled() || bustCache) {
      return null;
    }

    const cacheKey = this.getCacheKey(transformedPrompt);
    const cache = getCache ? getCache() : await import('../cache').then((m) => m.getCache());
    const cachedResult = await cache.get<string>(cacheKey);
    if (!cachedResult) {
      return null;
    }

    logger.debug(`Using cached SageMaker response for ${this.getEndpointName()}`);
    try {
      const parsedResult = JSON.parse(cachedResult) as ProviderResponse;
      if (parsedResult.tokenUsage) {
        parsedResult.tokenUsage.cached = parsedResult.tokenUsage.total || 0;
      }
      if (isTransformed && parsedResult.metadata) {
        parsedResult.metadata.transformed = true;
        parsedResult.metadata.originalPrompt = originalPrompt;
      }
      return { ...parsedResult, cached: true };
    } catch (_) {
      logger.warn(`Failed to parse cached SageMaker response: ${_}`);
      return null;
    }
  }

  /**
   * Store a completion result in cache.
   */
  private async storeCompletionCache(
    result: ProviderResponse,
    transformedPrompt: string,
    bustCache: boolean,
  ): Promise<void> {
    const { isCacheEnabled, getCache } = await import('../cache');
    if (!isCacheEnabled() || bustCache || !result.output || result.error) {
      return;
    }

    const cacheKey = this.getCacheKey(transformedPrompt);
    const cache = getCache ? getCache() : await import('../cache').then((m) => m.getCache());
    try {
      await cache.set(cacheKey, JSON.stringify(result));
      logger.debug(`Stored SageMaker response in cache with key: ${cacheKey.substring(0, 100)}...`);
    } catch (_) {
      logger.warn(`Failed to store SageMaker response in cache: ${_}`);
    }
  }

  /**
   * Invoke SageMaker endpoint for text generation with caching, delay support, and transformations
   */
  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    _options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const delayMs = context?.originalProvider?.delay || this.delay;
    const transformedPrompt = await this.applyTransformation(prompt, context);
    const isTransformed = transformedPrompt !== prompt;

    if (isTransformed) {
      logger.debug(`Prompt transformed for SageMaker endpoint ${this.getEndpointName()}`);
      logger.debug(`Original: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`);
      logger.debug(
        `Transformed: ${transformedPrompt.substring(0, 100)}${transformedPrompt.length > 100 ? '...' : ''}`,
      );
    }

    const bustCache = context?.bustCache ?? context?.debug === true;

    const cachedResponse = await this.getCachedCompletionResult(
      transformedPrompt,
      prompt,
      isTransformed,
      bustCache,
    );
    if (cachedResponse) {
      return cachedResponse;
    }

    if (delayMs && delayMs > 0) {
      logger.debug(
        `Applying delay of ${delayMs}ms before calling SageMaker endpoint ${this.getEndpointName()}`,
      );
      await sleep(delayMs);
    }

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
      const _latency = Date.now() - startTime;

      if (!response.Body) {
        logger.error('No response body returned from SageMaker endpoint');
        return { error: 'No response body returned from SageMaker endpoint' };
      }

      const responseBody = new TextDecoder().decode(response.Body);
      logger.debug(
        `SageMaker response (truncated): ${responseBody.length > 1000 ? responseBody.substring(0, 1000) + '...' : responseBody}`,
      );

      const output = await this.parseResponse(responseBody);

      // Handle known errors (e.g. 424 from malformed request payloads)
      if (typeof output === 'object' && output !== null && 'code' in output) {
        const code = output.code;
        if (Number.isInteger(code) && code === 424) {
          const errorMessage = `API Error: 424${output?.message ? ` ${output.message}` : ''}\n${JSON.stringify(output)}`;
          logger.error(errorMessage);
          return { error: errorMessage };
        }
      }

      const promptTokens = Math.ceil(payload.length / 4);
      const completionTokens = Math.ceil((typeof output === 'string' ? output.length : 0) / 4);

      const result: ProviderResponse = {
        output,
        raw: responseBody,
        tokenUsage: {
          prompt: promptTokens,
          completion: completionTokens,
          total: promptTokens + completionTokens,
          cached: 0,
          numRequests: 1,
        },
        metadata: {
          latencyMs: _latency,
          modelType: this.config.modelType || 'custom',
          transformed: isTransformed,
          originalPrompt: isTransformed ? prompt : undefined,
        },
      };

      await this.storeCompletionCache(result, transformedPrompt, bustCache);

      return result;
    } catch (error: any) {
      logger.error(`SageMaker API error: ${error}`);
      return { error: `SageMaker API error: ${error.message || String(error)}` };
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
   * Build the embedding request payload based on model type.
   */
  private buildEmbeddingPayload(text: string): string {
    const modelType = this.config.modelType || 'custom';
    logger.debug(`Formatting embedding payload for model type: ${modelType}`);

    switch (modelType) {
      case 'openai':
        return JSON.stringify({ input: text, model: 'embedding' });
      case 'huggingface':
        return JSON.stringify({ inputs: text });
      case 'custom':
      default:
        return JSON.stringify({ input: text, text, inputs: text });
    }
  }

  /**
   * Try to retrieve a cached embedding result. Returns the cached response or null.
   */
  private async getCachedEmbeddingResult(
    transformedText: string,
    bustCache: boolean,
  ): Promise<ProviderEmbeddingResponse | null> {
    const { isCacheEnabled, getCache } = await import('../cache');
    if (!isCacheEnabled() || bustCache) {
      return null;
    }

    const cacheKey = this.getCacheKey(transformedText);
    const cache = (await getCache)
      ? await getCache()
      : await import('../cache').then((m) => m.getCache());
    const cachedResult = await cache.get<string>(cacheKey);
    if (!cachedResult) {
      return null;
    }

    logger.debug(`Using cached SageMaker embedding response for ${this.getEndpointName()}`);
    try {
      const parsedResult = JSON.parse(cachedResult) as ProviderEmbeddingResponse;
      if (parsedResult.tokenUsage) {
        parsedResult.tokenUsage.cached = parsedResult.tokenUsage.prompt || 0;
      }
      return { ...parsedResult, cached: true };
    } catch (_) {
      logger.warn(`Failed to parse cached SageMaker embedding response: ${_}`);
      return null;
    }
  }

  /**
   * Try to extract embedding using the configured response format path.
   * Returns the embedding array or null if extraction failed.
   */
  private async tryExtractEmbeddingFromPath(
    responseJson: any,
    text: string,
    transformedText: string,
    isTransformed: boolean,
    context: CallApiContextParams | undefined,
  ): Promise<ProviderEmbeddingResponse | null> {
    const pathExpression = this.config.responseFormat?.path;
    if (!pathExpression) {
      return null;
    }

    try {
      const extracted = await this.extractFromPath(responseJson, pathExpression);
      if (Array.isArray(extracted) && extracted.every((val) => typeof val === 'number')) {
        const result = {
          embedding: extracted,
          tokenUsage: {
            prompt: Math.ceil(text.length / 4),
            cached: 0,
            numRequests: 1,
          },
          metadata: {
            transformed: isTransformed,
            originalText: isTransformed ? text : undefined,
          },
        };
        await this.cacheEmbeddingResult(
          result,
          transformedText,
          context,
          isTransformed,
          isTransformed ? text : undefined,
        );
        return result;
      }
      logger.warn('Extracted data is not a valid embedding array, trying other extraction methods');
    } catch (error) {
      logger.warn(
        `Failed to extract embedding from path expression: ${pathExpression}, Error: ${error}`,
      );
      logger.debug(`Response JSON structure: ${JSON.stringify(responseJson).substring(0, 200)}...`);
    }
    return null;
  }

  /**
   * Invoke SageMaker endpoint for embeddings with caching, delay support, and transformations
   */
  async callEmbeddingApi(
    text: string,
    context?: CallApiContextParams,
  ): Promise<ProviderEmbeddingResponse> {
    const delayMs = context?.originalProvider?.delay || this.delay;
    const transformedText = await this.applyTransformation(text, context);
    const isTransformed = transformedText !== text;

    if (isTransformed) {
      logger.debug(`Text transformed for SageMaker embedding endpoint ${this.getEndpointName()}`);
      logger.debug(`Original: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
      logger.debug(
        `Transformed: ${transformedText.substring(0, 100)}${transformedText.length > 100 ? '...' : ''}`,
      );
    }

    const bustCache = context?.debug === true;

    const cachedResponse = await this.getCachedEmbeddingResult(transformedText, bustCache);
    if (cachedResponse) {
      return cachedResponse;
    }

    if (delayMs && delayMs > 0) {
      logger.debug(
        `Applying delay of ${delayMs}ms before calling SageMaker embedding endpoint ${this.getEndpointName()}`,
      );
      await sleep(delayMs);
    }

    const runtime = await this.getSageMakerRuntimeInstance();
    const payload = this.buildEmbeddingPayload(transformedText);

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

      const response = await runtime.send(command);

      if (!response.Body) {
        logger.error('No response body returned from SageMaker embedding endpoint');
        return { error: 'No response body returned from SageMaker embedding endpoint' };
      }

      const responseBody = new TextDecoder().decode(response.Body);
      logger.debug(`SageMaker embedding response: ${responseBody.substring(0, 200)}...`);

      let responseJson;
      try {
        responseJson = JSON.parse(responseBody);
      } catch (_) {
        return { error: `Failed to parse embedding response as JSON: ${_}` };
      }

      // Try to extract via configured path expression first
      const pathResult = await this.tryExtractEmbeddingFromPath(
        responseJson,
        text,
        transformedText,
        isTransformed,
        context,
      );
      if (pathResult) {
        return pathResult;
      }

      // Fallback: try common embedding response formats
      const embedding =
        responseJson.embedding ||
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
          prompt: Math.ceil(text.length / 4),
          cached: 0,
          numRequests: 1,
        },
        metadata: {
          transformed: isTransformed,
          originalText: isTransformed ? text : undefined,
        },
      };

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
      return { error: `SageMaker embedding API error: ${error.message || String(error)}` };
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
