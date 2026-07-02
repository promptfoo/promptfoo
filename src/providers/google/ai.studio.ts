import { type FetchWithCacheResult, fetchWithCache } from '../../cache';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { maybeLoadFromExternalFile } from '../../util/file';
import { renderVarsInObject } from '../../util/index';
import { getNunjucksEngine } from '../../util/templates';
import { getRequestTimeoutMs, parseChatPrompt } from '../shared';
import { GoogleGenericProvider, type GoogleProviderOptions } from './base';
import {
  addGeminiUsage,
  createGeminiRetrySignal,
  createGeminiUsageTotals,
  getGeminiErrorHeaders,
  getGeminiErrorMessage,
  getGeminiErrorStatus,
  getGeminiErrorStatusText,
  getGeminiMaxRetries,
  getGeminiResponseUsage,
  getGeminiRetryAfterMs,
  isGeminiHardQuotaError,
  isGeminiRetryableError,
  isGeminiRetryableHttpResponse,
  isGeminiRetryableResponseData,
  throwIfGeminiAborted,
  waitBeforeGeminiRetry,
} from './retry';
import { CHAT_MODELS } from './shared';
import {
  calculateGoogleCost,
  collectGroundingMetadata,
  createAuthCacheDiscriminator,
  formatCandidateContents,
  geminiFormatAndSystemInstructions,
  getCandidate,
  getLastPromptSafetyRatings,
  isNonCandidateStreamChunk,
  mergeGoogleCompletionOptions,
  mergeParts,
  normalizeSafetySettings,
  removeGoogleFunctionDeclarations,
  resolveGoogleToolConfig,
} from './util';

import type { EnvOverrides } from '../../types/env';
import type {
  ApiEmbeddingProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  GuardrailResponse,
  ProviderEmbeddingResponse,
  ProviderResponse,
} from '../../types/index';
import type { CompletionOptions } from './types';
import type { GeminiResponseData } from './util';

const DEFAULT_API_HOST = 'generativelanguage.googleapis.com';
const GENERATE_CONTENT_MODEL_PREFIXES = ['gemini', 'gemma', 'codegemma', 'paligemma'];

function usesGenerateContentApi(modelName: string): boolean {
  return GENERATE_CONTENT_MODEL_PREFIXES.some((prefix) => modelName.startsWith(prefix));
}

function shouldBustCache(context?: CallApiContextParams): boolean {
  return context?.bustCache ?? context?.debug ?? false;
}

/**
 * Google AI Studio provider for Gemini models.
 *
 * Extends GoogleGenericProvider for shared functionality like MCP integration,
 * authentication management, and resource cleanup.
 */
export class AIStudioChatProvider extends GoogleGenericProvider {
  get managesRetries(): boolean {
    return usesGenerateContentApi(this.modelName);
  }

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
    // Wait for MCP initialization if pending
    if (this.initializationPromise != null) {
      await this.initializationPromise;
    }

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
          headers,
          body: JSON.stringify(body),
          ...(authDiscriminator && { _authHash: authDiscriminator }),
        } as RequestInit,
        getRequestTimeoutMs(),
        'json',
        shouldBustCache(context),
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
      const tokenUsage = cached
        ? {
            cached: data.usageMetadata?.totalTokenCount,
            total: data.usageMetadata?.totalTokenCount,
            numRequests: 0,
            ...(data.usageMetadata?.thoughtsTokenCount !== undefined && {
              completionDetails: {
                reasoning: data.usageMetadata.thoughtsTokenCount,
                acceptedPrediction: 0,
                rejectedPrediction: 0,
              },
            }),
          }
        : {
            prompt: data.usageMetadata?.promptTokenCount,
            completion: data.usageMetadata?.candidatesTokenCount,
            total: data.usageMetadata?.totalTokenCount,
            numRequests: 1,
            ...(data.usageMetadata?.thoughtsTokenCount !== undefined && {
              completionDetails: {
                reasoning: data.usageMetadata.thoughtsTokenCount,
                acceptedPrediction: 0,
                rejectedPrediction: 0,
              },
            }),
          };

      // Calculate cost (only for non-cached responses)
      // Include thinking tokens in output cost - Google bills them as output tokens
      const completionForCost =
        data.usageMetadata?.candidatesTokenCount == null
          ? undefined
          : data.usageMetadata.candidatesTokenCount + (data.usageMetadata?.thoughtsTokenCount ?? 0);
      const cost = cached
        ? undefined
        : calculateGoogleCost(
            this.modelName,
            config,
            data.usageMetadata?.promptTokenCount,
            completionForCost,
          );

      return {
        output,
        tokenUsage,
        cost,
        raw: data,
        cached,
      };
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

    // Merge configs from the provider and the prompt
    const config = mergeGoogleCompletionOptions(
      this.config,
      context?.prompt?.config as Partial<CompletionOptions> | undefined,
    );

    const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
      prompt,
      context?.vars,
      config.systemInstruction,
      { useAssistantRole: config.useAssistantRole },
    );

    const { toolConfig, toolsDisabled } = resolveGoogleToolConfig(config);
    // Get all tools (MCP + config tools) using base class method
    const allTools = await this.getAllTools(context, {
      skipExecutableToolFiles: toolsDisabled,
    });
    const requestTools = toolsDisabled ? removeGoogleFunctionDeclarations(allTools) : allTools;

    const body: Record<string, any> = {
      contents,
      generationConfig: {
        ...(config.temperature !== undefined && { temperature: config.temperature }),
        ...(config.topP !== undefined && { topP: config.topP }),
        ...(config.topK !== undefined && { topK: config.topK }),
        ...(config.stopSequences !== undefined && {
          stopSequences: config.stopSequences,
        }),
        ...(config.maxOutputTokens !== undefined && {
          maxOutputTokens: config.maxOutputTokens,
        }),
        ...config.generationConfig,
      },
      safetySettings: normalizeSafetySettings(config.safetySettings),
      ...(toolConfig ? { toolConfig } : {}),
      ...(requestTools.length > 0 ? { tools: requestTools } : {}),
      ...(systemInstruction ? { system_instruction: systemInstruction } : {}),
    };

    if (config.responseSchema) {
      if (body.generationConfig.response_schema) {
        throw new Error(
          '`responseSchema` provided but `generationConfig.response_schema` already set.',
        );
      }

      const schema = maybeLoadFromExternalFile(
        renderVarsInObject(config.responseSchema, context?.vars),
      );

      body.generationConfig.response_schema = schema;
      body.generationConfig.response_mime_type = 'application/json';
    }

    let data: GeminiResponseData | undefined;
    let cached = false;
    const maxRetries = getGeminiMaxRetries(config, logger);
    const requestTimeoutMs = getRequestTimeoutMs();
    const retryDeadline = Date.now() + requestTimeoutMs;
    const retrySignal = createGeminiRetrySignal(options?.abortSignal, requestTimeoutMs);
    const usageTotals = createGeminiUsageTotals();
    let numRequests = 0;
    let knownCost = 0;
    let hasKnownCost = false;
    const retryAccounting = () =>
      numRequests > 1 || usageTotals.totalTokenCount > 0
        ? {
            tokenUsage: {
              prompt: usageTotals.promptTokenCount,
              completion: usageTotals.candidatesTokenCount,
              total: usageTotals.totalTokenCount,
              numRequests,
            },
            ...(hasKnownCost && { cost: knownCost }),
          }
        : {};
    const timeoutResponse = (reason: unknown): ProviderResponse => ({
      error: `API call error: ${String(reason)}`,
      ...retryAccounting(),
    });

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        throwIfGeminiAborted(retrySignal);
        if (Date.now() >= retryDeadline) {
          throw new DOMException('The operation timed out', 'TimeoutError');
        }
        const endpoint = this.getApiEndpoint('generateContent');
        const headers = await this.getAuthHeaders();
        const authDiscriminator = createAuthCacheDiscriminator(headers);
        throwIfGeminiAborted(retrySignal);
        if (Date.now() >= retryDeadline) {
          throw new DOMException('The operation timed out', 'TimeoutError');
        }
        numRequests++;
        const result = (await fetchWithCache<GeminiResponseData>(
          endpoint,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            ...(options?.abortSignal && { signal: retrySignal }),
            ...(authDiscriminator && { _authHash: authDiscriminator }),
          } as RequestInit,
          Math.max(1, retryDeadline - Date.now()),
          'json',
          shouldBustCache(context),
          0,
        )) as FetchWithCacheResult<GeminiResponseData>;

        if (result.cached) {
          numRequests--;
        } else {
          const usage = getGeminiResponseUsage(result.data);
          addGeminiUsage(usageTotals, usage);
          if (
            usage &&
            (usage.promptTokenCount !== undefined ||
              usage.candidatesTokenCount !== undefined ||
              usage.thoughtsTokenCount !== undefined)
          ) {
            const attemptCost = calculateGoogleCost(
              this.modelName,
              config,
              usage.promptTokenCount ?? 0,
              (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
            );
            if (attemptCost !== undefined) {
              knownCost += attemptCost;
              hasKnownCost = true;
            }
          }
        }

        if (isGeminiRetryableHttpResponse(result.status, result.data) && attempt < maxRetries) {
          await waitBeforeGeminiRetry(
            config,
            attempt,
            maxRetries,
            getGeminiRetryAfterMs(result, result.data),
            retrySignal,
            logger,
          );
          continue;
        }

        if (result.status >= 400) {
          await result.deleteFromCache?.();
          const headers = getGeminiErrorHeaders(result);
          const detail = getGeminiErrorMessage(result.data);
          return {
            error: `API call error: ${result.status} ${result.statusText || 'Unknown Error'}${detail ? `: ${detail}` : ''}`,
            ...retryAccounting(),
            metadata: {
              http: {
                status: result.status,
                statusText: result.statusText || 'Unknown Error',
                ...(headers && { headers }),
              },
              ...(result.status === 429 && {
                rateLimitKind: isGeminiRetryableHttpResponse(result.status, result.data)
                  ? 'rate_limit'
                  : 'quota',
              }),
            },
          };
        }

        if (isGeminiRetryableResponseData(result.data)) {
          await result.deleteFromCache?.();
          if (attempt < maxRetries) {
            await waitBeforeGeminiRetry(
              config,
              attempt,
              maxRetries,
              undefined,
              retrySignal,
              logger,
            );
            continue;
          }
        }

        data = result.data;
        cached = result.cached;
        break;
      } catch (err) {
        if (options?.abortSignal?.aborted) {
          throwIfGeminiAborted(options.abortSignal);
        }
        if (retrySignal.aborted || Date.now() >= retryDeadline) {
          return timeoutResponse(
            retrySignal.reason ?? new DOMException('The operation timed out', 'TimeoutError'),
          );
        }
        if (attempt < maxRetries && isGeminiRetryableError(err)) {
          try {
            await waitBeforeGeminiRetry(
              config,
              attempt,
              maxRetries,
              getGeminiRetryAfterMs(err),
              retrySignal,
              logger,
            );
          } catch (waitError) {
            if (options?.abortSignal?.aborted) {
              throwIfGeminiAborted(options.abortSignal);
            }
            return timeoutResponse(waitError);
          }
          continue;
        }

        const status = getGeminiErrorStatus(err);
        const headers = getGeminiErrorHeaders(err);
        return {
          error: `API call error: ${String(err)}`,
          ...retryAccounting(),
          ...(status !== undefined && {
            metadata: {
              http: {
                status,
                statusText: getGeminiErrorStatusText(err),
                ...(headers && { headers }),
              },
              ...(status === 429 && {
                rateLimitKind: isGeminiHardQuotaError(err) ? 'quota' : 'rate_limit',
              }),
            },
          }),
        };
      }
    }

    if (!data) {
      return {
        error: 'API call error: Gemini API did not return a response',
        ...retryAccounting(),
      };
    }

    const dataWithResponse = (Array.isArray(data) ? data : [data]) as GeminiResponseData[];
    const lastData = dataWithResponse[dataWithResponse.length - 1];
    if (!lastData) {
      return {
        error: `No response data found in response: ${JSON.stringify(data)}`,
        ...retryAccounting(),
      };
    }
    let output: ReturnType<typeof formatCandidateContents> | undefined;
    let candidate: ReturnType<typeof getCandidate> | undefined;
    try {
      for (const datum of dataWithResponse) {
        if (Array.isArray(data) && isNonCandidateStreamChunk(datum)) {
          continue;
        }

        const candidateForChunk = getCandidate(datum);
        if (candidateForChunk.finishReason === 'STOP' && !candidateForChunk.content?.parts) {
          continue;
        }

        candidate = candidateForChunk;
        output = mergeParts(output, formatCandidateContents(candidate));
      }

      if (output === undefined || candidate === undefined) {
        throw new Error(`No output found in response: ${JSON.stringify(data)}`);
      }
    } catch (err) {
      return {
        error: `${String(err)}`,
        ...retryAccounting(),
      };
    }
    const finalCandidate = candidate;

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

      const tokenUsage = cached
        ? {
            cached: lastData.usageMetadata?.totalTokenCount,
            total: lastData.usageMetadata?.totalTokenCount,
            numRequests: 0,
            ...(lastData.usageMetadata?.thoughtsTokenCount !== undefined && {
              completionDetails: {
                reasoning: lastData.usageMetadata.thoughtsTokenCount,
                acceptedPrediction: 0,
                rejectedPrediction: 0,
              },
            }),
          }
        : {
            prompt: usageTotals.promptTokenCount,
            completion: usageTotals.candidatesTokenCount,
            total: usageTotals.totalTokenCount,
            numRequests,
            ...(usageTotals.hasThoughtsTokenCount && {
              completionDetails: {
                reasoning: usageTotals.thoughtsTokenCount,
                acceptedPrediction: 0,
                rejectedPrediction: 0,
              },
            }),
          };

      // Calculate cost (only for non-cached responses)
      // Include thinking tokens in output cost - Google bills them as output tokens
      const cost = cached || !hasKnownCost ? undefined : knownCost;

      return {
        output,
        tokenUsage,
        cost,
        raw: data,
        cached,
        ...(guardrails && { guardrails }),
        metadata: { ...grounding },
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
        ...retryAccounting(),
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
  override get managesRetries(): boolean {
    return false;
  }

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

  async callEmbeddingApi(text: string): Promise<ProviderEmbeddingResponse> {
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
          headers,
          body: JSON.stringify(body),
          ...(authDiscriminator && { _authHash: authDiscriminator }),
        } as RequestInit,
        getRequestTimeoutMs(),
        'json',
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
    return {
      embedding: values,
      tokenUsage: cached
        ? { cached: promptTokens ?? 0, total: promptTokens ?? 0, numRequests: 0 }
        : { total: promptTokens ?? 0, numRequests: 1 },
      cached,
    };
  }
}

const DEFAULT_AI_STUDIO_MODEL = 'gemini-2.5-pro';

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
