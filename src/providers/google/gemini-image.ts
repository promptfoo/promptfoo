import { fetchWithCache } from '../../cache';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../shared';
import {
  createAuthCacheDiscriminator,
  geminiFormatAndSystemInstructions,
  getGoogleClient,
  loadCredentials,
  resolveProjectId,
} from './util';

import type { EnvOverrides } from '../../types/env';
import type { ApiProvider, CallApiContextParams, ProviderResponse } from '../../types/index';
import type { CompletionOptions } from './types';

interface GeminiImageOptions {
  config?: CompletionOptions;
  id?: string;
  env?: EnvOverrides;
}

/**
 * Gemini native image generation provider.
 *
 * Uses the Gemini generateContent API with responseModalities set to include images.
 * This is different from Imagen models which use the :predict endpoint.
 *
 * Supported models:
 * - gemini-2.5-flash-preview-image-generation
 * - gemini-3-pro-image-preview (Nano Banana Pro)
 */
export class GeminiImageProvider implements ApiProvider {
  modelName: string;
  config: CompletionOptions;
  env?: EnvOverrides;

  constructor(modelName: string, options: GeminiImageOptions = {}) {
    this.modelName = modelName;
    this.config = options.config || {};
    this.env = options.env;
  }

  id(): string {
    return `google:${this.modelName}`;
  }

  toString(): string {
    return `[Google Gemini Image Generation Provider ${this.modelName}]`;
  }

  private getApiKey(): string | undefined {
    return (
      this.config.apiKey ||
      getEnvString('GOOGLE_API_KEY') ||
      getEnvString('GOOGLE_GENERATIVE_AI_API_KEY') ||
      getEnvString('GEMINI_API_KEY') ||
      this.env?.GOOGLE_API_KEY ||
      this.env?.GOOGLE_GENERATIVE_AI_API_KEY ||
      this.env?.GEMINI_API_KEY
    );
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    if (!prompt) {
      return {
        error: 'Prompt is required for image generation',
      };
    }

    // Check if we should use Vertex AI (when projectId is provided)
    const projectId =
      this.config.projectId ||
      getEnvString('GOOGLE_CLOUD_PROJECT') ||
      getEnvString('GOOGLE_PROJECT_ID') ||
      this.env?.GOOGLE_CLOUD_PROJECT ||
      this.env?.GOOGLE_PROJECT_ID;

    if (projectId) {
      return this.callVertexApi(prompt, context);
    }

    // Otherwise, try Google AI Studio with API key
    const apiKey = this.getApiKey();
    if (apiKey) {
      return this.callAIStudioApi(prompt, context);
    }

    return {
      error:
        'Gemini image models require either:\n' +
        '1. Google AI Studio: Set GOOGLE_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or GEMINI_API_KEY environment variable\n' +
        '2. Vertex AI: Set GOOGLE_CLOUD_PROJECT environment variable or provide projectId in config, and run "gcloud auth application-default login"',
    };
  }

  private async callAIStudioApi(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        error:
          'API key not found. Set GOOGLE_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or GEMINI_API_KEY environment variable.',
      };
    }

    const apiHost = this.config.apiHost || 'generativelanguage.googleapis.com';
    const apiVersion = this.modelName.startsWith('gemini-3-') ? 'v1alpha' : 'v1beta';
    // Use header-based auth instead of query param to avoid API key in logs
    const endpoint = `https://${apiHost}/${apiVersion}/models/${this.modelName}:generateContent`;

    const { contents } = geminiFormatAndSystemInstructions(prompt, context?.vars);
    const body = this.buildRequestBody(contents);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
        ...(this.config.headers || {}),
      };
      const authDiscriminator = createAuthCacheDiscriminator(headers);
      const startTime = Date.now();
      const { data, cached } = (await fetchWithCache(
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
      )) as { data: any; cached: boolean };
      const latencyMs = Date.now() - startTime;

      return this.processResponse(data, cached, latencyMs);
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
  }

  private async callVertexApi(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    // Gemini 3 models require the global endpoint
    const isGemini3 = this.modelName.startsWith('gemini-3-');
    const location = isGemini3
      ? 'global'
      : this.config.region ||
        getEnvString('GOOGLE_LOCATION') ||
        this.env?.GOOGLE_LOCATION ||
        'us-central1';

    try {
      const credentials = loadCredentials(this.config.credentials);
      const { client } = await getGoogleClient({ credentials });
      const projectId = await resolveProjectId(this.config, this.env);

      if (!projectId) {
        return {
          error:
            'Google project ID is required for Vertex AI. Set GOOGLE_PROJECT_ID or add projectId to provider config.',
        };
      }

      // Gemini 3 uses v1, older models use v1beta1
      const apiVersion = isGemini3 ? 'v1' : 'v1beta1';
      // Global endpoint uses a different URL format (no region prefix)
      const baseUrl = isGemini3
        ? 'https://aiplatform.googleapis.com'
        : `https://${location}-aiplatform.googleapis.com`;
      const endpoint = `${baseUrl}/${apiVersion}/projects/${projectId}/locations/${location}/publishers/google/models/${this.modelName}:generateContent`;

      logger.debug(`Vertex AI Gemini Image API endpoint: ${endpoint}`);
      logger.debug(`Project ID: ${projectId}, Location: ${location}, Model: ${this.modelName}`);

      const { contents } = geminiFormatAndSystemInstructions(prompt, context?.vars);
      const body = this.buildRequestBody(contents);

      const startTime = Date.now();
      const response = await client.request({
        url: endpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.headers || {}),
        },
        data: body,
        timeout: REQUEST_TIMEOUT_MS,
      });
      const latencyMs = Date.now() - startTime;

      return this.processResponse(response.data, false, latencyMs);
    } catch (err: any) {
      if (err.response?.data?.error) {
        return {
          error: `Vertex AI error: ${err.response.data.error.message || 'Unknown error'}`,
        };
      }
      return {
        error: `Failed to call Vertex AI: ${err.message || 'Unknown error'}`,
      };
    }
  }

  private buildRequestBody(contents: any): Record<string, any> {
    const body: Record<string, any> = {
      contents,
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        ...(this.config.temperature !== undefined && { temperature: this.config.temperature }),
        ...(this.config.topP !== undefined && { topP: this.config.topP }),
        ...(this.config.topK !== undefined && { topK: this.config.topK }),
        ...(this.config.maxOutputTokens !== undefined && {
          maxOutputTokens: this.config.maxOutputTokens,
        }),
        ...this.config.generationConfig,
      },
    };

    // Add image-specific configuration if provided
    // Note: imageSize is only supported for Gemini 3 models (v1alpha API)
    const isGemini3 = this.modelName.startsWith('gemini-3-');
    if (this.config.imageAspectRatio || (this.config.imageSize && isGemini3)) {
      body.generationConfig.imageConfig = {
        ...(this.config.imageAspectRatio && { aspectRatio: this.config.imageAspectRatio }),
        ...(this.config.imageSize && isGemini3 && { imageSize: this.config.imageSize }),
      };
    }

    // Add safety settings if provided
    if (this.config.safetySettings) {
      body.safetySettings = this.config.safetySettings;
    }

    return body;
  }

  private processResponse(data: any, cached?: boolean, latencyMs?: number): ProviderResponse {
    logger.debug(`Response data: ${JSON.stringify(data).substring(0, 500)}...`);

    if (!data || typeof data !== 'object') {
      return {
        error: 'Invalid response from API',
      };
    }

    if (data.error) {
      return {
        error: data.error.message || JSON.stringify(data.error),
      };
    }

    if (!data.candidates || data.candidates.length === 0) {
      // Check if the prompt was blocked
      let errorDetails = 'No candidates returned in API response.';

      if (data.promptFeedback?.blockReason) {
        errorDetails = `Response blocked: ${data.promptFeedback.blockReason}`;
      }

      return {
        error: errorDetails,
      };
    }

    const candidate = data.candidates[0];

    // Check if candidate was blocked
    if (
      candidate.finishReason &&
      ['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'].includes(
        candidate.finishReason,
      )
    ) {
      return {
        error: `Response was blocked with finish reason: ${candidate.finishReason}`,
      };
    }

    if (!candidate.content?.parts) {
      return {
        error: 'No content parts in response',
      };
    }

    // Extract text and images from the response
    const outputParts: string[] = [];
    let totalCost = 0;

    for (const part of candidate.content.parts) {
      if (part.text) {
        outputParts.push(part.text);
      } else if (part.inlineData) {
        // Convert inline image data to markdown format
        const mimeType = part.inlineData.mimeType || 'image/png';
        const base64Data = part.inlineData.data;
        outputParts.push(`![Generated Image](data:${mimeType};base64,${base64Data})`);
        totalCost += this.getCostPerImage();
      }
    }

    if (outputParts.length === 0) {
      return {
        error: 'No valid content generated',
      };
    }

    // Calculate token usage
    const tokenUsage = cached
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
        };

    return {
      output: outputParts.join('\n\n'),
      cached,
      latencyMs,
      cost: totalCost > 0 ? totalCost : undefined,
      tokenUsage,
      raw: data,
    };
  }

  private getCostPerImage(): number {
    // Pricing for Gemini native image generation
    // Gemini 2.5 Flash Image: $0.039/image (1290 output tokens * $30/1M tokens)
    // Gemini 3 Pro Image: Pricing TBD, using estimate
    const costMap: Record<string, number> = {
      'gemini-2.5-flash-image': 0.039,
      'gemini-2.5-flash-preview-image-generation': 0.039, // Deprecated alias
      'gemini-3-pro-image-preview': 0.05, // Estimated
    };

    return costMap[this.modelName] || 0.04; // Default cost
  }
}
