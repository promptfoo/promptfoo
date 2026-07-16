import { storeBlob } from '../../blobs';
import { fetchWithCache } from '../../cache';
import { getEnvString } from '../../envars';
import { fetchWithTimeout } from '../../util/fetch/index';
import { getNunjucksEngine } from '../../util/templates';
import { getRequestTimeoutMs } from '../shared';
import { GoogleAuthManager } from './auth';
import { calculateGoogleCost, mergeGoogleCompletionOptions } from './util';

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
    total_reasoning_tokens?: number;
    total_thought_tokens?: number;
    total_tool_use_tokens?: number;
    total_cached_tokens?: number;
    total_tokens?: number;
    output_tokens_by_modality?: Array<{ modality?: string; tokens?: number }>;
  };
};

function parseInteractionInput(prompt: string): string | unknown[] | Record<string, unknown> {
  try {
    const parsed = JSON.parse(prompt) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((content) => {
        if (!content || typeof content !== 'object') {
          return content;
        }

        const normalizePart = (part: unknown) => {
          if (!part || typeof part !== 'object' || !('type' in part)) {
            return part;
          }
          const imagePart = part as { type?: string; image_url?: string | { url?: string } };
          if (imagePart.type !== 'image_url' && imagePart.type !== 'input_image') {
            return part;
          }
          const imageUrl =
            typeof imagePart.image_url === 'string'
              ? imagePart.image_url
              : imagePart.image_url?.url;
          if (!imageUrl) {
            return part;
          }
          const inlineImage = /^data:([^;,]+);base64,(.*)$/is.exec(imageUrl);
          return inlineImage
            ? { type: 'image', mime_type: inlineImage[1], data: inlineImage[2] }
            : { type: 'image', uri: imageUrl };
        };

        if (!('role' in content)) {
          return normalizePart(content);
        }

        const { role, content: messageContent, ...message } = content as Record<string, unknown>;
        const normalizedContent = Array.isArray(messageContent)
          ? messageContent.map((part) => normalizePart(part))
          : typeof messageContent === 'string'
            ? [{ type: 'text', text: messageContent }]
            : messageContent && typeof messageContent === 'object'
              ? [normalizePart(messageContent)]
              : [];
        return {
          ...message,
          type: role === 'assistant' || role === 'model' ? 'model_output' : 'user_input',
          content: normalizedContent,
        };
      });
    }
    return parsed && typeof parsed === 'object'
      ? (parsed as unknown[] | Record<string, unknown>)
      : prompt;
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
  const steps = data.steps || [];
  const latestUserInput = steps.map((step) => step.type).lastIndexOf('user_input');
  return steps
    .slice(latestUserInput + 1)
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content || []);
}

function getInteractionsEndpoint(config: CompletionOptions, env?: EnvOverrides): string {
  const endpointFromHost = (apiHost: string) => {
    const normalizedHost = /^https?:\/\//i.test(apiHost) ? apiHost : `https://${apiHost}`;
    return `${normalizedHost.replace(/\/$/, '')}/v1beta/interactions`;
  };

  if (config.apiHost) {
    return endpointFromHost(config.apiHost);
  }
  if (config.apiBaseUrl) {
    return `${config.apiBaseUrl.replace(/\/$/, '')}/v1beta/interactions`;
  }

  const apiHost = env?.GOOGLE_API_HOST || getEnvString('GOOGLE_API_HOST');
  if (apiHost) {
    return endpointFromHost(apiHost);
  }
  const apiBaseUrl = env?.GOOGLE_API_BASE_URL || getEnvString('GOOGLE_API_BASE_URL');
  if (apiBaseUrl) {
    return `${apiBaseUrl.replace(/\/$/, '')}/v1beta/interactions`;
  }
  return 'https://generativelanguage.googleapis.com/v1beta/interactions';
}

export class GoogleInteractionsProvider implements ApiProvider {
  modelName: string;
  config: CompletionOptions;
  env?: EnvOverrides;
  private providerId?: string;

  constructor(
    modelName: string,
    options: { config?: CompletionOptions; env?: EnvOverrides; id?: string } = {},
  ) {
    this.modelName = modelName;
    this.config = options.config || {};
    this.env = options.env;
    this.providerId = options.id;
  }

  id(): string {
    return this.providerId || `google:${this.modelName}`;
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
    const rawApiKey =
      GoogleAuthManager.getApiKey(config, this.env).apiKey ||
      this.env?.GOOGLE_GENERATIVE_AI_API_KEY ||
      getEnvString('GOOGLE_GENERATIVE_AI_API_KEY');
    const apiKey = rawApiKey ? getNunjucksEngine().renderString(rawApiKey, {}) : undefined;
    if (!apiKey) {
      return {
        error:
          'Gemini Interactions API requires an API key. Set GOOGLE_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, GEMINI_API_KEY, or PALM_API_KEY, or add apiKey to the provider config.',
      };
    }

    const endpoint = getInteractionsEndpoint(config, this.env);
    const headers = {
      'Content-Type': 'application/json',
      'Api-Revision': '2026-05-20',
      'x-goog-api-key': apiKey,
      ...config.headers,
    };
    const unsupportedGenerationFields = new Set([
      'temperature',
      'top_p',
      'topP',
      'stop_sequences',
      'stopSequences',
      'negative_prompt',
      'negativePrompt',
      'system_instruction',
      'systemInstruction',
      'service_tier',
      'serviceTier',
    ]);
    const passthroughGenerationConfig = config.passthrough?.generation_config;
    const generationConfig = {
      ...(config.maxOutputTokens === undefined
        ? {}
        : { max_output_tokens: config.maxOutputTokens }),
      ...Object.fromEntries(
        Object.entries({
          ...(config.generationConfig || {}),
          ...(passthroughGenerationConfig &&
          typeof passthroughGenerationConfig === 'object' &&
          !Array.isArray(passthroughGenerationConfig)
            ? passthroughGenerationConfig
            : {}),
        }).filter(([field]) => !unsupportedGenerationFields.has(field)),
      ),
    };
    const passthrough = Object.fromEntries(
      Object.entries(config.passthrough || {}).filter(
        ([field]) =>
          field !== 'generation_config' &&
          field !== 'generationConfig' &&
          !unsupportedGenerationFields.has(field),
      ),
    );
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
      ...(config.safetySettings ? { safety_settings: config.safetySettings } : {}),
      ...(Object.keys(generationConfig).length > 0 ? { generation_config: generationConfig } : {}),
      ...passthrough,
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
        } as RequestInit,
        getRequestTimeoutMs(),
        'json',
        // Interactions API credentials must not be persisted, even as a stable cache fingerprint.
        true,
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
    const video = [...outputContent].reverse().find((part) => part.type === 'video');
    if (!video?.data && !video?.uri) {
      return { error: 'Gemini interaction did not return video output', raw: data };
    }

    let blobRef;
    let videoBuffer = video.data ? Buffer.from(video.data, 'base64') : undefined;
    if (!videoBuffer && video.uri) {
      try {
        const downloadUrl = new URL(video.uri, endpoint);
        const endpointOrigin = new URL(endpoint).origin;
        if (
          downloadUrl.origin === endpointOrigin ||
          (downloadUrl.protocol === 'https:' &&
            downloadUrl.hostname === 'generativelanguage.googleapis.com')
        ) {
          const downloadHeaders =
            downloadUrl.origin === endpointOrigin ? headers : { 'x-goog-api-key': apiKey };
          let response = await fetchWithTimeout(
            downloadUrl.toString(),
            {
              method: 'GET',
              headers: downloadHeaders,
              redirect: 'manual',
            },
            getRequestTimeoutMs(),
          );
          const redirectLocation = response.headers.get('location');
          if (response.status >= 300 && response.status < 400 && redirectLocation) {
            const redirectUrl = new URL(redirectLocation, downloadUrl);
            const isTrustedRedirect =
              redirectUrl.origin === downloadUrl.origin ||
              (redirectUrl.protocol === 'https:' &&
                (redirectUrl.hostname === 'storage.googleapis.com' ||
                  redirectUrl.hostname.endsWith('.storage.googleapis.com') ||
                  redirectUrl.hostname.endsWith('.googleusercontent.com')));
            if (!isTrustedRedirect) {
              return {
                error: `Refusing untrusted Gemini interaction video redirect: ${redirectUrl.origin}`,
              };
            }
            response = await fetchWithTimeout(
              redirectUrl.toString(),
              {
                method: 'GET',
                ...(redirectUrl.origin === downloadUrl.origin ? { headers: downloadHeaders } : {}),
                redirect: 'manual',
              },
              getRequestTimeoutMs(),
            );
          }
          if (!response.ok) {
            return { error: `Failed to download Gemini interaction video: ${response.statusText}` };
          }
          videoBuffer = Buffer.from(await response.arrayBuffer());
        }
      } catch (err) {
        return { error: `Failed to download Gemini interaction video: ${String(err)}` };
      }
    }
    if (videoBuffer) {
      try {
        ({ ref: blobRef } = await storeBlob(videoBuffer, video.mime_type || 'video/mp4', {
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
    const thoughtTokens = usage?.total_reasoning_tokens ?? usage?.total_thought_tokens ?? 0;
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
