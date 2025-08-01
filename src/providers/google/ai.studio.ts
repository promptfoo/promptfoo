import { fetchWithCache } from '../../cache';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { renderVarsInObject } from '../../util';
import { maybeLoadFromExternalFile } from '../../util/file';
import { getNunjucksEngine } from '../../util/templates';
import { MCPClient } from '../mcp/client';
import { transformMCPToolsToGoogle } from '../mcp/transform';
import { parseChatPrompt, REQUEST_TIMEOUT_MS } from '../shared';
import { CHAT_MODELS } from './shared';
import {
  formatCandidateContents,
  geminiFormatAndSystemInstructions,
  getCandidate,
  loadFile,
} from './util';

import type {
  ApiProvider,
  CallApiContextParams,
  GuardrailResponse,
  ProviderResponse,
} from '../../types';
import type { EnvOverrides } from '../../types/env';
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
    const apiKey =
      this.config.apiKey ||
      this.env?.GEMINI_API_KEY ||
      this.env?.GOOGLE_API_KEY ||
      this.env?.PALM_API_KEY ||
      getEnvString('GEMINI_API_KEY') ||
      getEnvString('GOOGLE_API_KEY') ||
      getEnvString('PALM_API_KEY');
    if (apiKey) {
      return getNunjucksEngine().renderString(apiKey, {});
    }
    return undefined;
  }

  // @ts-ignore: Prompt is not used in this implementation
  async callApi(prompt: string): Promise<ProviderResponse> {
    throw new Error('Not implemented');
  }
}

export class AIStudioChatProvider extends AIStudioGenericProvider {
  private mcpClient: MCPClient | null = null;
  private initializationPromise: Promise<void> | null = null;

  constructor(
    modelName: string,
    options: { config?: CompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    if (!CHAT_MODELS.includes(modelName)) {
      logger.debug(`Using unknown Google chat model: ${modelName}`);
    }
    super(modelName, options);
    if (this.config.mcp?.enabled) {
      this.initializationPromise = this.initializeMCP();
    }
  }

  private async initializeMCP(): Promise<void> {
    this.mcpClient = new MCPClient(this.config.mcp!);
    await this.mcpClient.initialize();
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
    if (!this.getApiKey()) {
      throw new Error(
        'Google API key is not set. Set the GEMINI_API_KEY or GOOGLE_API_KEY environment variable or add `apiKey` to the provider config.',
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
        `${this.getApiUrl()}/v1beta3/models/${
          this.modelName
        }:generateMessage?key=${this.getApiKey()}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.config.headers, // Allow custom headers to be passed
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
        'json',
        context?.bustCache ?? context?.debug,
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

      return {
        output,
        tokenUsage,
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
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
    if (!this.getApiKey()) {
      throw new Error(
        'Google API key is not set. Set the GEMINI_API_KEY or GOOGLE_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }
    const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
      prompt,
      context?.vars,
      this.config.systemInstruction,
    );

    // Determine API version based on model
    const apiVersion = this.modelName === 'gemini-2.0-flash-thinking-exp' ? 'v1alpha' : 'v1beta';

    // --- MCP tool injection logic ---
    const mcpTools = this.mcpClient ? transformMCPToolsToGoogle(this.mcpClient.getAllTools()) : [];
    const allTools = [
      ...mcpTools,
      ...(this.config.tools ? loadFile(this.config.tools, context?.vars) : []),
    ];
    // --- End MCP tool injection logic ---

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
      ...(allTools.length > 0 ? { tools: allTools } : {}),
      ...(systemInstruction ? { system_instruction: systemInstruction } : {}),
    };

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
        `${this.getApiUrl()}/${apiVersion}/models/${
          this.modelName
        }:generateContent?key=${this.getApiKey()}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.config.headers, // Allow custom headers to be set
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

      return {
        output,
        tokenUsage,
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

  async cleanup(): Promise<void> {
    if (this.mcpClient) {
      await this.initializationPromise;
      await this.mcpClient.cleanup();
      this.mcpClient = null;
    }
  }
}
