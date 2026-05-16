import crypto from 'crypto';

import { z } from 'zod';
import { getEnvFloat, getEnvInt, getEnvString } from '../envars';
import logger from '../logger';
import telemetry from '../telemetry';
import { getTransformErrorMessage, TransformInputType, transform } from '../util/transform';
import { StringOrFunctionSchema } from '../validators/shared';

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
import type { TransformContext, TransformFunction } from '../types/transform';

/**
 * Sleep utility function for implementing delays
 * @param ms Milliseconds to sleep
 * @returns Promise that resolves after the specified delay
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function stringifyTransformResult(result: unknown): string | undefined {
  if (result === undefined || result === null) {
    logger.debug('Transform function returned null or undefined, using original prompt');
    return undefined;
  }
  if (typeof result === 'string') {
    return result;
  }
  return typeof result === 'object' ? JSON.stringify(result) : String(result);
}

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
  transform: StringOrFunctionSchema.optional(), // Transform expression, file path, or function

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
  transform?: string | TransformFunction;

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

      const transformFn = this.transform;

      logger.debug(`Applying transform to prompt for SageMaker endpoint ${this.getEndpointName()}`);

      // Inline string expressions are evaluated directly here because SageMaker exposes
      // the inline identifier as `prompt` rather than `output`; routing them through
      // `src/util/transform` would rename the identifier and break existing configs.
      // Direct TransformFunction values and file:// references delegate to the shared
      // `transform()` utility.
      if (typeof transformFn === 'string' && !transformFn.startsWith('file://')) {
        // SECURITY WARNING: Using new Function() with dynamic content can be risky
        // This is safe only if transform content comes from trusted sources (like config files)
        // and not from user input or external API responses
        let result: unknown;
        if (transformFn.includes('=>')) {
          const fn = new Function(
            'prompt',
            'context',
            `try { return (${transformFn})(prompt, context); } catch(e) { throw new Error("Transform function error: " + e.message); }`,
          );
          result = await Promise.resolve(fn(prompt, transformContext));
        } else {
          const fn = new Function(
            'prompt',
            'context',
            `try { ${transformFn} } catch(e) { throw new Error("Transform function error: " + e.message); }`,
          );
          result = await Promise.resolve(fn(prompt, transformContext));
        }

        const transformedPrompt = stringifyTransformResult(result);
        if (transformedPrompt !== undefined) {
          return transformedPrompt;
        }
      } else {
        const transformed = await transform(
          transformFn,
          prompt,
          transformContext,
          false,
          TransformInputType.OUTPUT,
        );

        const transformedPrompt = stringifyTransformResult(transformed);
        if (transformedPrompt !== undefined) {
          return transformedPrompt;
        }
      }

      // Fall back to the original prompt if the transform result is not usable
      logger.warn(`Transform did not produce a valid result, using original prompt`);
      return prompt;
    } catch (error) {
      // User-supplied function transforms must surface their errors so programming
      // mistakes don't silently run the endpoint against the untransformed prompt.
      // Inline-string and file:// transforms keep the legacy best-effort contract
      // (log and fall through) so existing SageMaker configs aren't regressed.
      if (typeof this.transform === 'function') {
        throw error;
      }
      logger.error(`Error applying transform to prompt: ${error}`);
      return prompt;
    }
  }

  /**
   * Run `applyTransformation` and convert a function-transform throw into a
   * `ProviderResponse.error` so the evaluator sees a uniform error row instead
   * of an uncaught rejection.
   */
  protected async runTransformSafely(
    input: string,
    context: CallApiContextParams | undefined,
    errorPrefix: string,
  ): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
    try {
      return { ok: true, value: await this.applyTransformation(input, context) };
    } catch (transformError) {
      const message = `${errorPrefix}: ${getTransformErrorMessage(transformError)}`;
      logger.error(message);
      return { ok: false, error: message };
    }
  }

  protected getDelayMs(context?: CallApiContextParams): number | undefined {
    return context?.originalProvider?.delay || this.delay;
  }

  protected logTransformation(
    label: 'Prompt' | 'Text',
    original: string,
    transformed: string,
  ): void {
    if (original === transformed) {
      return;
    }

    logger.debug(
      `${label} transformed for SageMaker ${label === 'Text' ? 'embedding ' : ''}endpoint ${this.getEndpointName()}`,
    );
    logger.debug(`Original: ${original.substring(0, 100)}${original.length > 100 ? '...' : ''}`);
    logger.debug(
      `Transformed: ${transformed.substring(0, 100)}${transformed.length > 100 ? '...' : ''}`,
    );
  }

  protected async applyConfiguredDelay(
    delayMs: number | undefined,
    target: 'endpoint' | 'embedding endpoint',
  ): Promise<void> {
    if (!delayMs || delayMs <= 0) {
      return;
    }

    logger.debug(
      `Applying delay of ${delayMs}ms before calling SageMaker ${target} ${this.getEndpointName()}`,
    );
    await sleep(delayMs);
  }

  protected async resolveCache(getCacheFn?: typeof import('../cache').getCache) {
    return getCacheFn ? getCacheFn() : import('../cache').then((module) => module.getCache());
  }

  protected async sendInvokeEndpointCommand(runtime: any, payload: string) {
    const { InvokeEndpointCommand } = await import('@aws-sdk/client-sagemaker-runtime');
    const command = new InvokeEndpointCommand({
      EndpointName: this.getEndpointName(),
      ContentType: this.getContentType(),
      Accept: this.getAcceptType(),
      Body: payload,
    });
    const startTime = Date.now();
    const response = await runtime.send(command);
    return { ...response, latencyMs: Date.now() - startTime };
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
    const maxTokens = this.config.maxTokens ?? getEnvInt('AWS_SAGEMAKER_MAX_TOKENS') ?? 1024;
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
   * Invoke SageMaker endpoint for text generation with caching, delay support, and transformations
   */
  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    _options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const { isCacheEnabled, getCache } = await import('../cache');
    const transformResult = await this.runTransformSafely(
      prompt,
      context,
      'SageMaker transform error',
    );
    if (!transformResult.ok) {
      return { error: transformResult.error };
    }
    const transformedPrompt = transformResult.value;
    const isTransformed = transformedPrompt !== prompt;
    const bustCache = context?.bustCache ?? context?.debug === true;

    this.logTransformation('Prompt', prompt, transformedPrompt);

    const cachedResult = await this.getCachedCompletionResult(
      transformedPrompt,
      prompt,
      isTransformed,
      isCacheEnabled(),
      bustCache,
      getCache,
    );
    if (cachedResult) {
      return cachedResult;
    }

    await this.applyConfiguredDelay(this.getDelayMs(context), 'endpoint');

    const invocationResult = await this.invokeCompletionEndpoint(
      transformedPrompt,
      prompt,
      isTransformed,
    );
    if (invocationResult.error) {
      return invocationResult;
    }

    await this.cacheCompletionResult(
      invocationResult,
      transformedPrompt,
      isCacheEnabled(),
      bustCache,
      getCache,
    );
    return invocationResult;
  }

  private async getCachedCompletionResult(
    transformedPrompt: string,
    originalPrompt: string,
    isTransformed: boolean,
    cacheEnabled: boolean,
    bustCache: boolean,
    getCacheFn?: typeof import('../cache').getCache,
  ): Promise<ProviderResponse | undefined> {
    if (!cacheEnabled || bustCache) {
      return undefined;
    }

    const cacheKey = this.getCacheKey(transformedPrompt);
    const cache = await this.resolveCache(getCacheFn);
    const cachedResult = await cache.get<string>(cacheKey);
    if (!cachedResult) {
      return undefined;
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
    } catch (error) {
      logger.warn(`Failed to parse cached SageMaker response: ${error}`);
      return undefined;
    }
  }

  private async invokeCompletionEndpoint(
    transformedPrompt: string,
    originalPrompt: string,
    isTransformed: boolean,
  ): Promise<ProviderResponse> {
    const runtime = await this.getSageMakerRuntimeInstance();
    const payload = this.formatPayload(transformedPrompt);

    logger.debug(`Calling SageMaker endpoint ${this.getEndpointName()}`);
    logger.debug(
      `With payload: ${payload.length > 1000 ? `${payload.substring(0, 1000)}...` : payload}`,
    );

    try {
      const response = await this.sendInvokeEndpointCommand(runtime, payload);
      if (!response.Body) {
        logger.error('No response body returned from SageMaker endpoint');
        return { error: 'No response body returned from SageMaker endpoint' };
      }

      const responseBody = new TextDecoder().decode(response.Body);
      logger.debug(
        `SageMaker response (truncated): ${responseBody.length > 1000 ? `${responseBody.substring(0, 1000)}...` : responseBody}`,
      );

      const output = await this.parseResponse(responseBody);
      const knownError = this.getKnownCompletionError(output);
      if (knownError) {
        return knownError;
      }

      return this.createCompletionResult(
        output,
        responseBody,
        payload,
        response.latencyMs,
        originalPrompt,
        isTransformed,
      );
    } catch (error: any) {
      logger.error(`SageMaker API error: ${error}`);
      return { error: `SageMaker API error: ${error.message || String(error)}` };
    }
  }

  private getKnownCompletionError(output: any): ProviderResponse | undefined {
    if (!output || typeof output !== 'object' || !('code' in output)) {
      return undefined;
    }

    const code = output.code;
    if (!Number.isInteger(code) || code !== 424) {
      return undefined;
    }

    const errorMessage = `API Error: 424${output?.message ? ` ${output.message}` : ''}\n${JSON.stringify(output)}`;
    logger.error(errorMessage);
    return { error: errorMessage };
  }

  private createCompletionResult(
    output: any,
    responseBody: string,
    payload: string,
    latencyMs: number,
    originalPrompt: string,
    isTransformed: boolean,
  ): ProviderResponse {
    const promptTokens = Math.ceil(payload.length / 4);
    const completionTokens = Math.ceil((typeof output === 'string' ? output.length : 0) / 4);

    return {
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
        latencyMs,
        modelType: this.config.modelType || 'custom',
        transformed: isTransformed,
        originalPrompt: isTransformed ? originalPrompt : undefined,
      },
    };
  }

  private async cacheCompletionResult(
    result: ProviderResponse,
    transformedPrompt: string,
    cacheEnabled: boolean,
    bustCache: boolean,
    getCacheFn?: typeof import('../cache').getCache,
  ): Promise<void> {
    if (!cacheEnabled || bustCache || !result.output || result.error) {
      return;
    }

    const cacheKey = this.getCacheKey(transformedPrompt);
    const cache = await this.resolveCache(getCacheFn);
    try {
      await cache.set(cacheKey, JSON.stringify(result));
      logger.debug(`Stored SageMaker response in cache with key: ${cacheKey.substring(0, 100)}...`);
    } catch (error) {
      logger.warn(`Failed to store SageMaker response in cache: ${error}`);
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
    const { isCacheEnabled, getCache } = await import('../cache');
    const transformResult = await this.runTransformSafely(
      text,
      context,
      'SageMaker embedding transform error',
    );
    if (!transformResult.ok) {
      return { error: transformResult.error };
    }
    const transformedText = transformResult.value;
    const isTransformed = transformedText !== text;
    const bustCache = context?.debug === true;

    this.logTransformation('Text', text, transformedText);

    const cachedResult = await this.getCachedEmbeddingResult(
      transformedText,
      isCacheEnabled(),
      bustCache,
      getCache,
    );
    if (cachedResult) {
      return cachedResult;
    }

    await this.applyConfiguredDelay(this.getDelayMs(context), 'embedding endpoint');
    return this.invokeEmbeddingEndpoint(text, transformedText, isTransformed, context);
  }

  private async getCachedEmbeddingResult(
    transformedText: string,
    cacheEnabled: boolean,
    bustCache: boolean,
    getCacheFn?: typeof import('../cache').getCache,
  ): Promise<ProviderEmbeddingResponse | undefined> {
    if (!cacheEnabled || bustCache) {
      return undefined;
    }

    const cacheKey = this.getCacheKey(transformedText);
    const cache = await this.resolveCache(getCacheFn);
    const cachedResult = await cache.get<string>(cacheKey);
    if (!cachedResult) {
      return undefined;
    }

    logger.debug(`Using cached SageMaker embedding response for ${this.getEndpointName()}`);
    try {
      const parsedResult = JSON.parse(cachedResult) as ProviderEmbeddingResponse;
      if (parsedResult.tokenUsage) {
        parsedResult.tokenUsage.cached = parsedResult.tokenUsage.prompt || 0;
      }
      return { ...parsedResult, cached: true };
    } catch (error) {
      logger.warn(`Failed to parse cached SageMaker embedding response: ${error}`);
      return undefined;
    }
  }

  private async invokeEmbeddingEndpoint(
    originalText: string,
    transformedText: string,
    isTransformed: boolean,
    context?: CallApiContextParams,
  ): Promise<ProviderEmbeddingResponse> {
    const runtime = await this.getSageMakerRuntimeInstance();
    const payload = this.formatEmbeddingPayload(transformedText);

    logger.debug(`Calling SageMaker embedding endpoint ${this.getEndpointName()}`);
    logger.debug(`With payload: ${payload}`);

    try {
      const response = await this.sendInvokeEndpointCommand(runtime, payload);
      if (!response.Body) {
        logger.error('No response body returned from SageMaker embedding endpoint');
        return { error: 'No response body returned from SageMaker embedding endpoint' };
      }

      const responseBody = new TextDecoder().decode(response.Body);
      logger.debug(`SageMaker embedding response: ${responseBody.substring(0, 200)}...`);

      const responseJson = this.parseEmbeddingResponseJson(responseBody);
      if ('error' in responseJson) {
        return responseJson;
      }

      const extractedResult = await this.getPathExtractedEmbeddingResult(
        responseJson,
        originalText,
        transformedText,
        isTransformed,
        context,
      );
      if (extractedResult) {
        return extractedResult;
      }

      const embedding = this.findEmbedding(responseJson);
      if (!embedding) {
        return {
          error: `Invalid embedding response format. Could not find embedding array in: ${JSON.stringify(responseJson).substring(0, 100)}...`,
        };
      }

      const result = this.createEmbeddingResult(embedding, originalText, isTransformed);
      await this.cacheEmbeddingResult(
        result,
        transformedText,
        context,
        isTransformed,
        isTransformed ? originalText : undefined,
      );
      return result;
    } catch (error: any) {
      logger.error(`SageMaker embedding API error: ${error}`);
      return { error: `SageMaker embedding API error: ${error.message || String(error)}` };
    }
  }

  private formatEmbeddingPayload(transformedText: string): string {
    const modelType = this.config.modelType || 'custom';
    logger.debug(`Formatting embedding payload for model type: ${modelType}`);

    if (modelType === 'openai') {
      return JSON.stringify({ input: transformedText, model: 'embedding' });
    }

    if (modelType === 'huggingface') {
      return JSON.stringify({ inputs: transformedText });
    }

    return JSON.stringify({
      input: transformedText,
      text: transformedText,
      inputs: transformedText,
    });
  }

  private parseEmbeddingResponseJson(responseBody: string): any | ProviderEmbeddingResponse {
    try {
      return JSON.parse(responseBody);
    } catch (error) {
      return { error: `Failed to parse embedding response as JSON: ${error}` };
    }
  }

  private async getPathExtractedEmbeddingResult(
    responseJson: any,
    originalText: string,
    transformedText: string,
    isTransformed: boolean,
    context?: CallApiContextParams,
  ): Promise<ProviderEmbeddingResponse | undefined> {
    const pathExpression = this.config.responseFormat?.path;
    if (!pathExpression) {
      return undefined;
    }

    try {
      const extracted = await this.extractFromPath(responseJson, pathExpression);
      if (!this.isEmbeddingArray(extracted)) {
        logger.warn(
          'Extracted data is not a valid embedding array, trying other extraction methods',
        );
        return undefined;
      }

      const result = this.createEmbeddingResult(extracted, originalText, isTransformed);
      await this.cacheEmbeddingResult(
        result,
        transformedText,
        context,
        isTransformed,
        isTransformed ? originalText : undefined,
      );
      return result;
    } catch (error) {
      logger.warn(
        `Failed to extract embedding from path expression: ${pathExpression}, Error: ${error}`,
      );
      logger.debug(`Response JSON structure: ${JSON.stringify(responseJson).substring(0, 200)}...`);
      return undefined;
    }
  }

  private findEmbedding(responseJson: any): number[] | undefined {
    const embedding =
      responseJson.embedding ||
      responseJson.embeddings ||
      responseJson.data?.[0]?.embedding ||
      (Array.isArray(responseJson) ? responseJson[0] : responseJson);
    return this.isEmbeddingArray(embedding) ? embedding : undefined;
  }

  private isEmbeddingArray(value: unknown): value is number[] {
    return Array.isArray(value) && value.every((item) => typeof item === 'number');
  }

  private createEmbeddingResult(
    embedding: number[],
    originalText: string,
    isTransformed: boolean,
  ): ProviderEmbeddingResponse {
    return {
      embedding,
      tokenUsage: {
        prompt: Math.ceil(originalText.length / 4),
        cached: 0,
        numRequests: 1,
      },
      metadata: {
        transformed: isTransformed,
        originalText: isTransformed ? originalText : undefined,
      },
    };
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
