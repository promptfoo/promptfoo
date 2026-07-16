import { storeBlob } from '../../blobs';
import { fetchWithCache } from '../../cache';
import { getEnvString } from '../../envars';
import { getRequestTimeoutMs } from '../shared';
import {
  calculateGoogleCost,
  createAuthCacheDiscriminator,
  mergeGoogleCompletionOptions,
} from './util';

import type { EnvOverrides } from '../../types/env';
import type { ApiProvider, CallApiContextParams, ProviderResponse } from '../../types/index';
import type { CompletionOptions } from './types';

type InteractionContent = {
  type?: string;
  text?: string;
  data?: string;
  uri?: string;
  mime_type?: string;
};

type InteractionResponse = {
  id?: string;
  status?: string;
  error?: { message?: string };
  steps?: Array<{ type?: string; content?: InteractionContent[] }>;
  usage?: {
    total_input_tokens?: number;
    total_output_tokens?: number;
    total_thought_tokens?: number;
    total_tool_use_tokens?: number;
    total_cached_tokens?: number;
    total_tokens?: number;
    output_tokens_by_modality?: Array<{ modality?: string; tokens?: number }>;
  };
};

function parseInteractionInput(prompt: string): string | unknown[] {
  try {
    const parsed = JSON.parse(prompt);
    return Array.isArray(parsed) ? parsed : prompt;
  } catch {
    return prompt;
  }
}

function getVideoTokenCount(usage: InteractionResponse['usage']): number {
  return (usage?.output_tokens_by_modality || [])
    .filter((detail) => detail.modality?.toLowerCase() === 'video')
    .reduce((total, detail) => total + (detail.tokens ?? 0), 0);
}

function getModelOutputContent(data: InteractionResponse): InteractionContent[] {
  return (data.steps || [])
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content || []);
}

export class GoogleInteractionsProvider implements ApiProvider {
  modelName: string;
  config: CompletionOptions;
  env?: EnvOverrides;

  constructor(modelName: string, options: { config?: CompletionOptions; env?: EnvOverrides } = {}) {
    this.modelName = modelName;
    this.config = options.config || {};
    this.env = options.env;
  }

  id(): string {
    return `google:${this.modelName}`;
  }

  toString(): string {
    return `[Google Interactions Provider ${this.modelName}]`;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    if (!prompt.trim()) {
      return { error: 'Prompt is required for Gemini Interactions API' };
    }

    const config = mergeGoogleCompletionOptions(
      this.config,
      context?.prompt?.config as Partial<CompletionOptions> | undefined,
    );
    const apiKey =
      config.apiKey ||
      this.env?.GOOGLE_API_KEY ||
      this.env?.GOOGLE_GENERATIVE_AI_API_KEY ||
      this.env?.GEMINI_API_KEY ||
      getEnvString('GOOGLE_API_KEY') ||
      getEnvString('GOOGLE_GENERATIVE_AI_API_KEY') ||
      getEnvString('GEMINI_API_KEY');
    if (!apiKey) {
      return {
        error:
          'Gemini Interactions API requires an API key. Set GOOGLE_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or GEMINI_API_KEY, or add apiKey to the provider config.',
      };
    }

    const configuredBase = config.apiBaseUrl?.replace(/\/$/, '');
    const endpoint = configuredBase
      ? `${configuredBase}/v1beta/interactions`
      : `https://${config.apiHost || 'generativelanguage.googleapis.com'}/v1beta/interactions`;
    const headers = {
      'Content-Type': 'application/json',
      'Api-Revision': '2026-05-20',
      'x-goog-api-key': apiKey,
      ...config.headers,
    };
    const authDiscriminator = createAuthCacheDiscriminator(headers);
    const body = {
      model: this.modelName,
      input: parseInteractionInput(prompt),
      response_format: {
        type: 'video',
        ...(config.aspectRatio ? { aspect_ratio: config.aspectRatio } : {}),
      },
      ...(config.previousInteractionId
        ? { previous_interaction_id: config.previousInteractionId }
        : {}),
      ...(config.store === undefined ? {} : { store: config.store }),
      background: false,
      stream: false,
    };

    let data: InteractionResponse;
    let cached: boolean;
    try {
      ({ data, cached } = (await fetchWithCache(
        endpoint,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          ...(authDiscriminator ? { _authHash: authDiscriminator } : {}),
        } as RequestInit,
        getRequestTimeoutMs(),
        'json',
        context?.bustCache ?? context?.debug ?? false,
      )) as { data: InteractionResponse; cached: boolean });
    } catch (err) {
      return { error: `Gemini Interactions API error: ${String(err)}` };
    }

    if (data.error?.message) {
      return { error: `Gemini Interactions API error: ${data.error.message}` };
    }
    if (data.status && data.status !== 'completed') {
      return { error: `Gemini interaction did not complete (status: ${data.status})`, raw: data };
    }

    const outputContent = getModelOutputContent(data);
    const text = outputContent
      .filter((part) => part.type === 'text' && part.text)
      .map((part) => part.text)
      .join('');
    const video = outputContent.find((part) => part.type === 'video');
    if (!video?.data && !video?.uri) {
      return { error: 'Gemini interaction did not return video output', raw: data };
    }

    let blobRef;
    if (video.data) {
      try {
        ({ ref: blobRef } = await storeBlob(Buffer.from(video.data, 'base64'), 'video/mp4', {
          evalId: context?.evaluationId,
          kind: 'video',
          location: 'response.video',
          promptIdx: context?.promptIdx,
          testIdx: context?.testIdx,
        }));
      } catch (err) {
        return { error: `Failed to store Gemini interaction video: ${String(err)}` };
      }
    }

    const usage = data.usage;
    const promptTokens = (usage?.total_input_tokens ?? 0) + (usage?.total_tool_use_tokens ?? 0);
    const outputTokens = usage?.total_output_tokens ?? 0;
    const thoughtTokens = usage?.total_thought_tokens ?? 0;
    const videoTokens = getVideoTokenCount(usage);
    const videoUrl = blobRef?.uri ?? video.uri;
    const sanitizedPrompt = prompt
      .replace(/\r?\n|\r/g, ' ')
      .replace(/\[/g, '(')
      .replace(/\]/g, ')')
      .slice(0, 50);

    return {
      output: text || `[Video: ${sanitizedPrompt}](${videoUrl})`,
      cached,
      tokenUsage: {
        prompt: promptTokens,
        completion: outputTokens,
        total: usage?.total_tokens ?? promptTokens + outputTokens + thoughtTokens,
        cached: usage?.total_cached_tokens ?? 0,
        numRequests: 1,
        ...(thoughtTokens > 0 ? { completionDetails: { reasoning: thoughtTokens } } : {}),
      },
      cost: cached
        ? undefined
        : calculateGoogleCost(
            this.modelName,
            config,
            promptTokens,
            outputTokens + thoughtTokens,
            false,
            undefined,
            undefined,
            videoTokens,
          ),
      video: {
        id: data.id,
        blobRef,
        url: videoUrl,
        format: video.mime_type?.split('/')[1] || 'mp4',
        model: this.modelName,
        aspectRatio: config.aspectRatio,
      },
      metadata: { interactionId: data.id, status: data.status },
    };
  }
}
