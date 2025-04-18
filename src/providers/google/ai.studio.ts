import { fetchWithCache } from '../../cache';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import type {
  ApiProvider,
  ProviderResponse,
  CallApiContextParams,
  GuardrailResponse,
} from '../../types';
import type { EnvOverrides } from '../../types/env';
import { maybeLoadFromExternalFile, renderVarsInObject } from '../../util';
import { getNunjucksEngine } from '../../util/templates';
import { parseChatPrompt, REQUEST_TIMEOUT_MS } from '../shared';
import { CHAT_MODELS } from './shared';
import type { CompletionOptions } from './types';
import {
  loadFile,
  formatCandidateContents,
  geminiFormatAndSystemInstructions,
  getCandidate,
} from './util';
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

  getApiHost(): string | undefined {
    const apiHost =
      this.config.apiHost ||
      this.env?.GOOGLE_API_HOST ||
      this.env?.PALM_API_HOST ||
      getEnvString('GOOGLE_API_HOST') ||
      getEnvString('PALM_API_HOST') ||
      DEFAULT_API_HOST;
    if (apiHost) {
      return getNunjucksEngine().renderString(apiHost, {});
    }
    return undefined;
  }

  getApiKey(): string | undefined {
    const apiKey =
      this.config.apiKey ||
      this.env?.GOOGLE_API_KEY ||
      this.env?.PALM_API_KEY ||
      getEnvString('GOOGLE_API_KEY') ||
      getEnvString('PALM_API_KEY');
    if (apiKey) {
      return getNunjucksEngine().renderString(apiKey, {});
    }
    return undefined;
  }

  // Add a getCachedOutput method (no-op implementation)
  getCachedOutput(prompt: any, modelConfig: any): string | undefined {
    return undefined;
  }

  // @ts-ignore: Prompt is not used in this implementation
  async callApi(prompt: string): Promise<ProviderResponse> {
    throw new Error('Not implemented');
  }

  async callGemini(
    prompt: string | Array<{ role: string; parts: Array<{ text: string }> }>,
    modelConfig: any,
    {
      stream = false,
      signal,
      temperature,
      maxOutputTokens,
      topP,
      topK,
      stopSequences,
      useGeminiPro,
    }: {
      stream?: boolean;
      signal?: AbortSignal;
      temperature?: number;
      maxOutputTokens?: number;
      topP?: number;
      topK?: number;
      stopSequences?: string[];
      useGeminiPro?: boolean;
    } = {},
  ): Promise<ProviderResponse> {
    if (!this.getApiKey()) {
      throw new Error(
        'Google API key is not set. Set the GOOGLE_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    const modelName = modelConfig.model || this.modelName;
    logger.debug(`Calling Gemini API with model: ${modelName}`);

    const options: Record<string, any> = {};
    if (temperature !== undefined) {
      options.temperature = temperature;
    }
    if (maxOutputTokens !== undefined) {
      options.maxOutputTokens = maxOutputTokens;
    }
    if (topP !== undefined) {
      options.topP = topP;
    }
    if (topK !== undefined) {
      options.topK = topK;
    }
    if (stopSequences?.length) {
      options.stopSequences = stopSequences;
    }

    // Default API version for Gemini API
    let apiVersion = 'v1';

    // Check if the model is Gemini 2.5 and set the appropriate API version
    const isGemini25 = modelName.includes('gemini-2.5');

    // Use v1beta API for Gemini 2.5 models
    if (isGemini25) {
      apiVersion = 'v1beta';
      logger.debug(`Using ${apiVersion} API version for Gemini 2.5`);
    }

    // Support for Gemini 2.5 Flash with thinking capability
    const thinkingConfig = modelConfig.provider?.thinking_config || {};
    const isFlashModel = modelName.includes('flash');

    const enableThinking = isGemini25 && isFlashModel && Object.keys(thinkingConfig).length > 0;

    if (enableThinking) {
      logger.debug(`Enabling thinking capability with config: ${JSON.stringify(thinkingConfig)}`);
    }

    const apiUrl = `https://${this.getApiHost()}/${apiVersion}/models/${modelName}:${
      stream ? 'streamGenerateContent' : 'generateContent'
    }`;

    let body: Record<string, any>;

    if (Array.isArray(prompt)) {
      // Chat-style format with roles
      body = {
        contents: prompt,
        generationConfig: options,
      };
    } else {
      // Simple text prompt
      body = {
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: options,
      };
    }

    // Add thinking configuration if needed
    if (enableThinking) {
      body.thinking_config = {
        ...(thinkingConfig.thinking_budget !== undefined && {
          thinking_budget: thinkingConfig.thinking_budget,
        }),
        ...(thinkingConfig.thinkingBudget !== undefined && {
          thinking_budget: thinkingConfig.thinkingBudget,
        }),
      };
    }

    logger.debug(`API URL: ${apiUrl}`);
    logger.debug(`Request body: ${JSON.stringify(body)}`);

    // Handle cached output if available
    const cachedOutput =
      typeof this.getCachedOutput === 'function'
        ? this.getCachedOutput(prompt, modelConfig)
        : undefined;

    if (cachedOutput) {
      return {
        error: undefined,
        output: cachedOutput,
        tokenUsage: undefined,
        cached: true,
        raw: {},
      };
    }

    let data,
      cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
        `${apiUrl}?key=${this.getApiKey()}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal,
        },
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
        output: undefined,
        tokenUsage: undefined,
      };
    }

    logger.debug(`\tGoogle API response: ${JSON.stringify(data)}`);

    let output, candidate;
    try {
      logger.debug(`Getting candidate from response`);
      candidate = getCandidate(data);
      logger.debug(`Formatting candidate contents`);
      output = formatCandidateContents(candidate);
      logger.debug(
        `Formatted output: ${typeof output === 'string' ? output.substring(0, 100) : JSON.stringify(output).substring(0, 100)}`,
      );
    } catch (err) {
      logger.error(`Error extracting content from response: ${err}`);
      return {
        error: `${String(err)}`,
        output: undefined,
        tokenUsage: undefined,
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

      // Include thinking output if available
      const thinkingOutput = data.thinking?.output || data.thinkingSummary;
      const apiResponse: ProviderResponse = {
        output,
        tokenUsage: cached
          ? {
              cached: data.usageMetadata?.totalTokenCount || data.tokenCount,
              total: data.usageMetadata?.totalTokenCount || data.tokenCount,
              numRequests: 0,
            }
          : {
              prompt: data.usageMetadata?.promptTokenCount,
              completion: data.usageMetadata?.candidatesTokenCount,
              total: data.usageMetadata?.totalTokenCount || data.tokenCount,
              numRequests: 1,
            },
        raw: data,
        cached,
        ...(guardrails && { guardrails }),
        ...(thinkingOutput && { thinking: thinkingOutput }),
      };

      return apiResponse;
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
        output: undefined,
        tokenUsage: undefined,
      };
    }
  }
}

export class AIStudioChatProvider extends AIStudioGenericProvider {
  constructor(
    modelName: string,
    options: { config?: CompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    if (!CHAT_MODELS.includes(modelName)) {
      logger.debug(`Using unknown Google chat model: ${modelName}`);
    }
    super(modelName, options);
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    if (!this.getApiKey()) {
      throw new Error(
        'Google API key is not set. Set the GOOGLE_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    const isGemini = this.modelName.startsWith('gemini');
    if (isGemini) {
      return this.callGemini(prompt, context);
    }

    // https://developers.generativeai.google/tutorials/curl_quickstart
    // https://ai.google.dev/api/rest/v1beta/models/generateMessage
    const messages = parseChatPrompt(prompt, [{ content: prompt }]);
    const body = {
      prompt: { messages },
      temperature: this.config.temperature,
      topP: this.config.topP,
      topK: this.config.topK,
      safetySettings: this.config.safetySettings,
      stopSequences: this.config.stopSequences,
      maxOutputTokens: this.config.maxOutputTokens,
    };

    logger.debug(`Calling Google API: ${JSON.stringify(body)}`);

    let data,
      cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
        `https://${this.getApiHost()}/v1beta3/models/${
          this.modelName
        }:generateMessage?key=${this.getApiKey()}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
        'json',
        false,
      )) as unknown as any);
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    logger.debug(`\tGoogle API response: ${JSON.stringify(data)}`);

    if (!data?.candidates || data.candidates.length === 0) {
      return {
        error: `API did not return any candidate responses: ${JSON.stringify(data)}`,
      };
    }

    try {
      const output = data.candidates[0].content;
      return {
        output,
        tokenUsage: cached
          ? {
              cached: data.usageMetadata?.totalTokenCount,
              total: data.usageMetadata?.totalTokenCount,
              numRequests: 0,
            }
          : {
              prompt: data.usageMetadata?.promptTokenCount,
              completion: data.usageMetadata?.candidatesTokenCount,
              total: data.usageMetadata?.totalTokenCount,
              numRequests: 1,
            },
        raw: data,
        cached,
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }

  async callGemini(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
      prompt,
      context?.vars,
      this.config.systemInstruction,
    );

    // Determine API version based on model and config
    let apiVersion = this.config.apiVersion || 'v1beta';

    // Default to v1beta for most models, but use v1 for 2.5 Flash models unless overridden
    if (!this.config.apiVersion) {
      if (this.modelName === 'gemini-2.0-flash-thinking-exp') {
        apiVersion = 'v1alpha';
      } else if (this.modelName.includes('gemini-2.5-flash')) {
        apiVersion = 'v1';
      }
    }

    const body: Record<string, any> = {
      contents,
      generationConfig: {
        ...(this.config.temperature !== undefined && { temperature: this.config.temperature }),
        ...(this.config.topP !== undefined && { topP: this.config.topP }),
        ...(this.config.topK !== undefined && { topK: this.config.topK }),
        ...(this.config.stopSequences !== undefined && {
          stopSequences: this.config.stopSequences,
        }),
        ...(this.config.maxOutputTokens !== undefined && {
          maxOutputTokens: this.config.maxOutputTokens,
        }),
        ...this.config.generationConfig,
      },
      safetySettings: this.config.safetySettings,
      ...(this.config.toolConfig ? { toolConfig: this.config.toolConfig } : {}),
      ...(this.config.tools ? { tools: loadFile(this.config.tools, context?.vars) } : {}),
      ...(systemInstruction ? { system_instruction: systemInstruction } : {}),
    };

    // Add thinking configuration for Gemini 2.5 models
    if (this.config.thinkingConfig && this.modelName.includes('2.5')) {
      body.thinking_config = {
        ...(this.config.thinkingConfig.thinking_budget !== undefined && {
          thinking_budget: this.config.thinkingConfig.thinking_budget,
        }),
        ...(this.config.thinkingConfig.thinkingBudget !== undefined && {
          thinking_budget: this.config.thinkingConfig.thinkingBudget,
        }),
      };
    }

    if (this.config.responseSchema) {
      if (body.generationConfig.response_schema) {
        throw new Error(
          '`responseSchema` provided but `generationConfig.response_schema` already set.',
        );
      }

      const schema = maybeLoadFromExternalFile(
        renderVarsInObject(this.config.responseSchema, context?.vars),
      );

      body.generationConfig.response_schema = schema;
      body.generationConfig.response_mime_type = 'application/json';
    }

    logger.debug(`Calling Google API: ${JSON.stringify(body)}`);

    let data;
    let cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
        `https://${this.getApiHost()}/${apiVersion}/models/${
          this.modelName
        }:generateContent?key=${this.getApiKey()}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
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

    logger.debug(`\tGoogle API response: ${JSON.stringify(data)}`);
    let output, candidate;
    try {
      logger.debug(`Getting candidate from response`);
      candidate = getCandidate(data);
      logger.debug(`Formatting candidate contents`);
      output = formatCandidateContents(candidate);
      logger.debug(
        `Formatted output: ${typeof output === 'string' ? output.substring(0, 100) : JSON.stringify(output).substring(0, 100)}`,
      );
    } catch (err) {
      logger.error(`Error extracting content from response: ${err}`);
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

      return {
        output,
        tokenUsage: cached
          ? {
              cached: data.usageMetadata?.totalTokenCount,
              total: data.usageMetadata?.totalTokenCount,
              numRequests: 0,
            }
          : {
              prompt: data.usageMetadata?.promptTokenCount,
              completion: data.usageMetadata?.candidatesTokenCount,
              total: data.usageMetadata?.totalTokenCount,
              numRequests: 1,
            },
        raw: data,
        cached,
        ...(guardrails && { guardrails }),
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}
