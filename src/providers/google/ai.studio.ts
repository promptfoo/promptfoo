import { fetchWithCache } from '../../cache';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { maybeLoadFromExternalFile } from '../../util/file';
import { renderVarsInObject } from '../../util/index';
import { getNunjucksEngine } from '../../util/templates';
import { parseChatPrompt, REQUEST_TIMEOUT_MS } from '../shared';
import { GoogleGenericProvider, type GoogleProviderOptions } from './base';
import { CHAT_MODELS } from './shared';
import {
  calculateGoogleCost,
  createAuthCacheDiscriminator,
  formatCandidateContents,
  geminiFormatAndSystemInstructions,
  getCandidate,
} from './util';

import type { EnvOverrides } from '../../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  GuardrailResponse,
  ProviderResponse,
} from '../../types/index';
import type { CompletionOptions } from './types';
import type { GeminiResponseData } from './util';

const DEFAULT_API_HOST = 'generativelanguage.googleapis.com';

class AIStudioGenericProvider implements ApiProvider {
  modelName: string;

  config: CompletionOptions;
  env?: EnvOverrides;

  constructor(
    modelName: string,
    options: { config?: CompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.env = env;
    this.modelName = modelName;
    this.config = config || {};
    this.id = id ? () => id : this.id;
  }

  id(): string {
    return `google:${this.modelName}`;
  }

  toString(): string {
    return `[Google AI Studio Provider ${this.modelName}]`;
  }

  getApiUrlDefault(): string {
    const renderedHost = getNunjucksEngine().renderString(DEFAULT_API_HOST, {});
    return `https://${renderedHost}`;
  }

  getApiHost(): string | undefined {
    const apiHost =
      this.config.apiHost ||
      this.env?.GOOGLE_API_HOST ||
      this.env?.PALM_API_HOST ||
      getEnvString('GOOGLE_API_HOST') ||
      getEnvString('PALM_API_HOST') ||
      DEFAULT_API_HOST;
    return getNunjucksEngine().renderString(apiHost, {});
  }

  getApiUrl(): string {
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
    return (
      this.config.apiBaseUrl ||
      this.env?.GOOGLE_API_BASE_URL ||
      getEnvString('GOOGLE_API_BASE_URL') ||
      this.getApiUrlDefault()
    );
  }

  getApiKey(): string | undefined {
    // Priority aligned with Python SDK: GOOGLE_API_KEY > GEMINI_API_KEY
    const apiKey =
      this.config.apiKey ||
      this.env?.GOOGLE_API_KEY ||
      this.env?.GEMINI_API_KEY ||
      this.env?.PALM_API_KEY ||
      getEnvString('GOOGLE_API_KEY') ||
      getEnvString('GEMINI_API_KEY') ||
      getEnvString('PALM_API_KEY');
    if (apiKey) {
      return getNunjucksEngine().renderString(apiKey, {});
    }
    return undefined;
  }

  // @ts-ignore: Prompt is not used in this implementation
  async callApi(_prompt: string): Promise<ProviderResponse> {
    throw new Error('Not implemented');
  }
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
   * Uses config.apiVersion if set, otherwise auto-detects based on model
   * (v1alpha for thinking/gemini-3 models, v1beta for others).
   */
  private getApiVersion(): string {
    // Allow explicit override
    if (this.config.apiVersion) {
      return this.config.apiVersion;
    }
    // Auto-detect based on model
    return this.modelName === 'gemini-2.0-flash-thinking-exp' ||
      this.modelName.startsWith('gemini-3-')
      ? 'v1alpha'
      : 'v1beta';
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
  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
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

    const isGemini = this.modelName.startsWith('gemini');
    if (isGemini) {
      return this.callGemini(prompt, context);
    }

    // Legacy PaLM API path
    // https://developers.generativeai.google/tutorials/curl_quickstart
    // https://ai.google.dev/api/rest/v1beta/models/generateMessage
    // Merge configs from the provider and the prompt
    const config = {
      ...this.config,
      ...context?.prompt?.config,
    };
    const messages = parseChatPrompt(prompt, [{ content: prompt }]);
    const body = {
      prompt: { messages },
      temperature: config.temperature,
      topP: config.topP,
      topK: config.topK,
      safetySettings: config.safetySettings,
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
        REQUEST_TIMEOUT_MS,
        'json',
        context?.bustCache ?? context?.debug,
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
      const cost = cached
        ? undefined
        : calculateGoogleCost(
            this.modelName,
            config,
            data.usageMetadata?.promptTokenCount,
            data.usageMetadata?.candidatesTokenCount,
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
  async callGemini(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(
        'Google API key is not set. Set the GOOGLE_API_KEY or GEMINI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    // Merge configs from the provider and the prompt
    const config = {
      ...this.config,
      ...context?.prompt?.config,
    };

    const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
      prompt,
      context?.vars,
      config.systemInstruction,
      { useAssistantRole: config.useAssistantRole },
    );

    // Get all tools (MCP + config tools) using base class method
    const allTools = await this.getAllTools(context);

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
      safetySettings: config.safetySettings,
      ...(config.toolConfig ? { toolConfig: config.toolConfig } : {}),
      ...(allTools.length > 0 ? { tools: allTools } : {}),
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

    let data;
    let cached = false;
    try {
      const endpoint = this.getApiEndpoint('generateContent');
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
        REQUEST_TIMEOUT_MS,
        'json',
        false,
      )) as {
        data: GeminiResponseData;
        cached: boolean;
      });
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    let output, candidate;
    try {
      candidate = getCandidate(data);
      output = formatCandidateContents(candidate);
    } catch (err) {
      return {
        error: `${String(err)}`,
      };
    }

    try {
      let guardrails: GuardrailResponse | undefined;

      if (data.promptFeedback?.safetyRatings || candidate.safetyRatings) {
        const flaggedInput = data.promptFeedback?.safetyRatings?.some(
          (r) => r.probability !== 'NEGLIGIBLE',
        );
        const flaggedOutput = candidate.safetyRatings?.some((r) => r.probability !== 'NEGLIGIBLE');
        const flagged = flaggedInput || flaggedOutput;

        guardrails = {
          flaggedInput,
          flaggedOutput,
          flagged,
        };
      }

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
      const cost = cached
        ? undefined
        : calculateGoogleCost(
            this.modelName,
            config,
            data.usageMetadata?.promptTokenCount,
            data.usageMetadata?.candidatesTokenCount,
          );

      return {
        output,
        tokenUsage,
        cost,
        raw: data,
        cached,
        ...(guardrails && { guardrails }),
        metadata: {
          ...(candidate.groundingChunks && { groundingChunks: candidate.groundingChunks }),
          ...(candidate.groundingMetadata && { groundingMetadata: candidate.groundingMetadata }),
          ...(candidate.groundingSupports && { groundingSupports: candidate.groundingSupports }),
          ...(candidate.webSearchQueries && { webSearchQueries: candidate.webSearchQueries }),
        },
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }

  // cleanup() is inherited from GoogleGenericProvider
}

export const DefaultGradingProvider = new AIStudioGenericProvider('gemini-2.5-pro');
export const DefaultGradingJsonProvider = new AIStudioGenericProvider('gemini-2.5-pro', {
  config: {
    generationConfig: {
      response_mime_type: 'application/json',
    },
  },
});
export const DefaultLlmRubricProvider = new AIStudioGenericProvider('gemini-2.5-pro');
export const DefaultSuggestionsProvider = new AIStudioGenericProvider('gemini-2.5-pro');
export const DefaultSynthesizeProvider = new AIStudioGenericProvider('gemini-2.5-pro');
