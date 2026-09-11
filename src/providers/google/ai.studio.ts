import { fetchWithCache } from '../../cache';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import {
  type ApiEmbeddingProvider,
  type CallApiContextParams,
  type CallApiOptionsParams,
  type GuardrailResponse,
  inheritProviderCapabilities,
  type ProviderEmbeddingResponse,
  type ProviderResponse,
} from '../../types/providers';
import { getNunjucksEngine } from '../../util/templates';
import {
  getRequestTimeoutMs,
  parseChatPrompt,
  shouldBustProviderCache,
  withResponseCacheMetadata,
} from '../shared';
import { GoogleGenericProvider, type GoogleProviderOptions } from './base';
import { getGeminiTokenUsage, parseGeminiContent, prepareGeminiRequest } from './gemini';
import { CHAT_MODELS } from './shared';
import {
  calculateGoogleCost,
  calculateGoogleCostFromUsage,
  collectGroundingMetadata,
  collectThoughtSignatures,
  createAuthCacheDiscriminator,
  getGoogleResponseServiceTier,
  getLastPromptSafetyRatings,
  mergeGoogleCompletionOptions,
  normalizeGeminiAudio,
  normalizeSafetySettings,
} from './util';

import type { EnvOverrides } from '../../types/env';
import type { CompletionOptions } from './types';
import type { GeminiResponseData } from './util';

const DEFAULT_API_HOST = 'generativelanguage.googleapis.com';
const GENERATE_CONTENT_MODEL_PREFIXES = ['gemini', 'gemma', 'codegemma', 'paligemma'];

function usesGenerateContentApi(modelName: string): boolean {
  return GENERATE_CONTENT_MODEL_PREFIXES.some((prefix) => modelName.startsWith(prefix));
}

/**
 * Google AI Studio provider for Gemini models.
 *
 * Extends GoogleGenericProvider for shared functionality like MCP integration,
 * authentication management, and resource cleanup.
 */
export class AIStudioChatProvider extends GoogleGenericProvider {
  constructor(modelName: string, options: GoogleProviderOptions = {}) {
    if (!CHAT_MODELS.includes(modelName)) {
      logger.debug(`Using unknown Google chat model: ${modelName}`);
    }
    // Force non-vertex mode for AI Studio
    super(modelName, {
      ...options,
      config: { ...options.config, vertexai: false },
    });
  }

  /**
   * Get the API endpoint URL for Google AI Studio.
   *
   * @param action - Optional action like 'generateContent'
   * @returns The full API endpoint URL
   */
  getApiEndpoint(action?: string): string {
    const apiVersion = this.getApiVersion();
    const baseUrl = this.getApiBaseUrl();
    const actionSuffix = action ? `:${action}` : '';
    return `${baseUrl}/${apiVersion}/models/${this.modelName}${actionSuffix}`;
  }

  /**
   * Get the API version.
   *
   * Uses config.apiVersion if set, otherwise defaults to v1beta — Google's
   * primary endpoint for current Gemini models, including the Gemini 3.x
   * family. The legacy gemini-2.0-flash-thinking-exp model only responds on
   * v1alpha. Set config.apiVersion to 'v1alpha' to opt into preview-only
   * features such as media_resolution.
   */
  private getApiVersion(): string {
    // Allow explicit override
    if (this.config.apiVersion) {
      return this.config.apiVersion;
    }
    // gemini-2.0-flash-thinking-exp only responds on v1alpha; everything else
    // (including Gemini 3.x) uses the stable v1beta endpoint.
    return this.modelName === 'gemini-2.0-flash-thinking-exp' ? 'v1alpha' : 'v1beta';
  }

  /**
   * Get the API host for Google AI Studio.
   * Public for use by integrations like Adaline Gateway.
   */
  getApiHost(): string {
    const apiHost =
      this.config.apiHost ||
      this.env?.GOOGLE_API_HOST ||
      this.env?.PALM_API_HOST ||
      getEnvString('GOOGLE_API_HOST') ||
      getEnvString('PALM_API_HOST') ||
      DEFAULT_API_HOST;
    return getNunjucksEngine().renderString(apiHost, {});
  }

  /**
   * Get the base URL for Google AI Studio API.
   */
  private getApiBaseUrl(): string {
    // Check for apiHost first (most specific override)
    const apiHost =
      this.config.apiHost ||
      this.env?.GOOGLE_API_HOST ||
      this.env?.PALM_API_HOST ||
      getEnvString('GOOGLE_API_HOST') ||
      getEnvString('PALM_API_HOST');
    if (apiHost) {
      const renderedHost = getNunjucksEngine().renderString(apiHost, {});
      return `https://${renderedHost}`;
    }

    // Check for apiBaseUrl (less specific override)
    if (
      this.config.apiBaseUrl ||
      this.env?.GOOGLE_API_BASE_URL ||
      getEnvString('GOOGLE_API_BASE_URL')
    ) {
      return (
        this.config.apiBaseUrl ||
        this.env?.GOOGLE_API_BASE_URL ||
        getEnvString('GOOGLE_API_BASE_URL')!
      );
    }

    // Default: render the default host with Nunjucks for template variable support
    const renderedHost = getNunjucksEngine().renderString(DEFAULT_API_HOST, {});
    return `https://${renderedHost}`;
  }

  /**
   * Get authentication headers for Google AI Studio.
   * API key is passed via x-goog-api-key header for improved security.
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    const apiKey = this.getApiKey();
    if (apiKey) {
      headers['x-goog-api-key'] = apiKey;
    }

    return headers;
  }

  /**
   * Call the Google AI Studio API.
   */
  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    options?.abortSignal?.throwIfAborted();
    // Wait for MCP initialization if pending
    await this.initializeMCP(options?.abortSignal);

    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(
        'Google API key is not set. Set the GOOGLE_API_KEY or GEMINI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    if (usesGenerateContentApi(this.modelName)) {
      return this.callGemini(prompt, context, options);
    }

    // Legacy PaLM API path
    // https://developers.generativeai.google/tutorials/curl_quickstart
    // https://ai.google.dev/api/rest/v1beta/models/generateMessage
    // Merge configs from the provider and the prompt
    const config = mergeGoogleCompletionOptions(
      this.config,
      context?.prompt?.config as Partial<CompletionOptions> | undefined,
    );
    const messages = parseChatPrompt(prompt, [{ content: prompt }]);
    const body = {
      prompt: { messages },
      temperature: config.temperature,
      topP: config.topP,
      topK: config.topK,
      safetySettings: normalizeSafetySettings(config.safetySettings),
      stopSequences: config.stopSequences,
      maxOutputTokens: config.maxOutputTokens,
    };

    let data,
      cached = false;
    try {
      const baseUrl = this.getApiBaseUrl();
      const headers = await this.getAuthHeaders();
      const authDiscriminator = createAuthCacheDiscriminator(headers);
      ({ data, cached } = (await fetchWithCache(
        `${baseUrl}/v1beta3/models/${this.modelName}:generateMessage`,
        {
          method: 'POST',
          signal: options?.abortSignal,
          headers,
          body: JSON.stringify(body),
          ...(authDiscriminator && { _authHash: authDiscriminator }),
        } as RequestInit,
        getRequestTimeoutMs(),
        'json',
        shouldBustProviderCache(context),
      )) as unknown as { data: any; cached: boolean });
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    if (!data?.candidates || data.candidates.length === 0) {
      return {
        error: `API did not return any candidate responses: ${JSON.stringify(data)}`,
      };
    }

    try {
      const output = data.candidates[0].content;
      const tokenUsage = {
        prompt:
          data.usageMetadata?.promptTokenCount === undefined
            ? undefined
            : data.usageMetadata.promptTokenCount +
              (data.usageMetadata?.toolUsePromptTokenCount ?? 0),
        completion: data.usageMetadata?.candidatesTokenCount,
        total: data.usageMetadata?.totalTokenCount,
        numRequests: 1,
        ...(data.usageMetadata?.cachedContentTokenCount !== undefined && {
          cached: data.usageMetadata.cachedContentTokenCount,
        }),
        ...(data.usageMetadata?.thoughtsTokenCount !== undefined && {
          completionDetails: {
            reasoning: data.usageMetadata.thoughtsTokenCount,
            acceptedPrediction: 0,
            rejectedPrediction: 0,
          },
        }),
      };

      // Include thinking tokens in output cost - Google bills them as output tokens
      const completionForCost =
        data.usageMetadata?.candidatesTokenCount == null
          ? undefined
          : data.usageMetadata.candidatesTokenCount + (data.usageMetadata?.thoughtsTokenCount ?? 0);
      const cost = calculateGoogleCostFromUsage(
        this.modelName,
        config,
        data.usageMetadata?.promptTokenCount,
        completionForCost,
        false,
        data.usageMetadata,
      );

      return withResponseCacheMetadata({ output, tokenUsage, cost, raw: data }, cached);
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }

  /**
   * Call the Gemini API specifically.
   */
  async callGemini(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    options?.abortSignal?.throwIfAborted();
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(
        'Google API key is not set. Set the GOOGLE_API_KEY or GEMINI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    const { body, config, toolsDisabled } = await prepareGeminiRequest(
      this.modelName,
      this.config,
      prompt,
      context,
      'ai-studio',
      false,
      (toolOptions) =>
        this.getAllTools(context, { ...toolOptions, abortSignal: options?.abortSignal }),
    );

    let data;
    let cached = false;
    let responseHeaders: unknown;
    try {
      const endpoint = this.getApiEndpoint('generateContent');
      const headers = await this.getAuthHeaders();
      const authDiscriminator = createAuthCacheDiscriminator(headers);
      const response = await fetchWithCache(
        endpoint,
        {
          method: 'POST',
          signal: options?.abortSignal,
          headers,
          body: JSON.stringify(body),
          ...(authDiscriminator && { _authHash: authDiscriminator }),
        } as RequestInit,
        getRequestTimeoutMs(),
        'json',
        shouldBustProviderCache(context),
      );
      data = response.data as GeminiResponseData;
      cached = response.cached;
      responseHeaders = response.headers;
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    let parsed: ReturnType<typeof parseGeminiContent>;
    try {
      parsed = parseGeminiContent(data, 'ai-studio', cached);
    } catch (err) {
      return { error: String(err) };
    }
    if (parsed.kind === 'response') {
      return parsed.response;
    }
    const { output, candidate: finalCandidate, data: dataWithResponse, lastData } = parsed;

    try {
      let guardrails: GuardrailResponse | undefined;
      const promptSafetyRatings = getLastPromptSafetyRatings(dataWithResponse);

      if (promptSafetyRatings || finalCandidate.safetyRatings) {
        const flaggedInput = promptSafetyRatings?.some((r) => r.probability !== 'NEGLIGIBLE');
        const flaggedOutput = finalCandidate.safetyRatings?.some(
          (r) => r.probability !== 'NEGLIGIBLE',
        );
        const flagged = flaggedInput || flaggedOutput;

        guardrails = {
          flaggedInput,
          flaggedOutput,
          flagged,
        };
      }

      const grounding = collectGroundingMetadata(dataWithResponse);
      const thoughtSignatures = collectThoughtSignatures(dataWithResponse);
      const actualServiceTier = getGoogleResponseServiceTier(
        responseHeaders,
        lastData.usageMetadata,
      );

      const tokenUsage = getGeminiTokenUsage(lastData.usageMetadata, cached, 'ai-studio');

      // Include thinking tokens in output cost - Google bills them as output tokens
      const completionForCost =
        lastData.usageMetadata?.candidatesTokenCount == null
          ? undefined
          : lastData.usageMetadata.candidatesTokenCount +
            (lastData.usageMetadata?.thoughtsTokenCount ?? 0);
      const cost = calculateGoogleCostFromUsage(
        this.modelName,
        config,
        lastData.usageMetadata?.promptTokenCount,
        completionForCost,
        false,
        lastData.usageMetadata,
        actualServiceTier,
      );
      const audio = normalizeGeminiAudio(output);

      const response = withResponseCacheMetadata(
        {
          output,
          ...(audio && { audio }),
          tokenUsage,
          cost,
          raw: data,
          cached,
          ...(guardrails && { guardrails }),
          metadata: {
            ...grounding,
            ...(thoughtSignatures.length > 0 && { thoughtSignatures }),
            ...(actualServiceTier && { serviceTier: actualServiceTier }),
          },
        },
        cached,
      );
      try {
        response.output = await this.executeFunctionToolCallbacks(
          output,
          config,
          toolsDisabled,
          options?.abortSignal,
        );
      } catch (error) {
        return {
          ...response,
          ...(options?.abortSignal?.aborted ? {} : { output: undefined }),
          error: String(error),
        };
      }
      return response;
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }

  // cleanup() is inherited from GoogleGenericProvider
}

/**
 * Google AI Studio embedding provider.
 *
 * Calls the Gemini API `:embedContent` endpoint and normalizes the response
 * into `ProviderEmbeddingResponse`.
 *
 * Exposes the three standard knobs the Gemini API accepts: `taskType`
 * (optimizes the vector for a particular use case), `outputDimensionality`
 * (truncates the vector; useful for storage cost), and `title` (only
 * meaningful when `taskType` is `RETRIEVAL_DOCUMENT`).
 */
export class AIStudioEmbeddingProvider
  extends AIStudioChatProvider
  implements ApiEmbeddingProvider
{
  static readonly declaredProviderCapabilities = ['callEmbeddingApi'] as const;
  readonly promptfooCapabilities = inheritProviderCapabilities(
    AIStudioEmbeddingProvider.declaredProviderCapabilities,
  );

  id(): string {
    if (this.customId) {
      return this.customId();
    }
    return `google:embedding:${this.modelName}`;
  }

  toString(): string {
    return `[Google AI Studio Embedding Provider ${this.modelName}]`;
  }

  async callApi(_prompt: string, _context?: CallApiContextParams): Promise<ProviderResponse> {
    return {
      error: `Provider ${this.id()} is an embedding provider; use a non-embedding google: provider for chat completions.`,
    };
  }

  async callEmbeddingApi(
    text: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderEmbeddingResponse> {
    options?.abortSignal?.throwIfAborted();
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        error:
          'Google API key is not set. Set the GOOGLE_API_KEY or GEMINI_API_KEY environment variable or add `apiKey` to the provider config.',
      };
    }

    if (typeof text !== 'string') {
      return {
        error: `Invalid input type for embedding API. Expected string, got ${typeof text}.`,
      };
    }

    const config = this.config as CompletionOptions & {
      taskType?: string;
      outputDimensionality?: number;
      title?: string;
    };

    const body: Record<string, any> = {
      content: { parts: [{ text }] },
      ...(config.taskType !== undefined && { taskType: config.taskType }),
      ...(config.outputDimensionality !== undefined && {
        outputDimensionality: config.outputDimensionality,
      }),
      ...(config.title !== undefined && { title: config.title }),
    };

    let data: any;
    let cached = false;
    try {
      const endpoint = this.getApiEndpoint('embedContent');
      const headers = await this.getAuthHeaders();
      const authDiscriminator = createAuthCacheDiscriminator(headers);
      ({ data, cached } = (await fetchWithCache(
        endpoint,
        {
          method: 'POST',
          signal: options?.abortSignal,
          headers,
          body: JSON.stringify(body),
          ...(authDiscriminator && { _authHash: authDiscriminator }),
        } as RequestInit,
        getRequestTimeoutMs(),
        'json',
        shouldBustProviderCache(context),
      )) as unknown as { data: any; cached: boolean });
    } catch (err) {
      logger.error(`Google AI Studio embedding API call error: ${String(err)}`);
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    const values: number[] | undefined = data?.embedding?.values;
    if (!values) {
      return {
        error: `No embedding found in Google AI Studio response: ${JSON.stringify(data)}`,
      };
    }

    const promptTokens: number | undefined = data?.usageMetadata?.promptTokenCount;
    return withResponseCacheMetadata(
      {
        embedding: values,
        tokenUsage: {
          ...(promptTokens === undefined ? {} : { total: promptTokens }),
          numRequests: 1,
        },
        cost:
          promptTokens === undefined
            ? undefined
            : calculateGoogleCost(this.modelName, this.config, promptTokens, 0),
      },
      cached,
    );
  }
}

const DEFAULT_AI_STUDIO_MODEL = 'gemini-3.8-flash';

export function getGoogleAiStudioProviders(env?: EnvOverrides) {
  const gradingProvider = new AIStudioChatProvider(DEFAULT_AI_STUDIO_MODEL, { env });
  return {
    gradingJsonProvider: new AIStudioChatProvider(DEFAULT_AI_STUDIO_MODEL, {
      env,
      config: { generationConfig: { response_mime_type: 'application/json' } },
    }),
    gradingProvider,
    llmRubricProvider: new AIStudioChatProvider(DEFAULT_AI_STUDIO_MODEL, { env }),
    suggestionsProvider: gradingProvider,
    synthesizeProvider: gradingProvider,
  };
}
