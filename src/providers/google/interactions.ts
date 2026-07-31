import { storeBlob } from '../../blobs';
import { fetchWithCache } from '../../cache';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { fetchWithTimeout } from '../../util/fetch/index';
import { getNunjucksEngine } from '../../util/templates';
import { sleep } from '../../util/time';
import { getRequestTimeoutMs } from '../shared';
import { GoogleAuthManager } from './auth';
import {
  calculateGoogleCost,
  mergeGoogleCompletionOptions,
  parseConfigResponseSchema,
  parseConfigSystemInstruction,
} from './util';

import type { EnvOverrides } from '../../types/env';
import type { ApiProvider, CallApiContextParams, ProviderResponse } from '../../types/index';
import type { CompletionOptions, GoogleProviderConfig } from './types';

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
  steps?: Array<{ type?: string; content?: InteractionContent[]; error?: { message?: string } }>;
  usage?: {
    total_input_tokens?: number;
    total_output_tokens?: number;
    total_reasoning_tokens?: number;
    total_thought_tokens?: number;
    total_tool_use_tokens?: number;
    total_cached_tokens?: number;
    total_tokens?: number;
    input_tokens_by_modality?: Array<{ modality?: string; tokens?: number }>;
    tool_use_tokens_by_modality?: Array<{ modality?: string; tokens?: number }>;
    cached_tokens_by_modality?: Array<{ modality?: string; tokens?: number }>;
    output_tokens_by_modality?: Array<{ modality?: string; tokens?: number }>;
  };
};

type ParsedInteractionInput = {
  input: string | unknown[] | Record<string, unknown>;
  systemInstruction?: string;
  hasSystemInstruction?: boolean;
};

function normalizeAudioMimeType(format?: string): string {
  if (format?.startsWith('audio/')) {
    return format;
  }
  if (format === 'mp3') {
    return 'audio/mpeg';
  }
  if (format === 'pcm16') {
    return 'audio/pcm';
  }
  return `audio/${format || 'mpeg'}`;
}

function getInteractionText(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(getInteractionText);
  }
  if (!value || typeof value !== 'object') {
    return [];
  }
  const record = value as Record<string, unknown>;
  if (typeof record.text === 'string') {
    return [record.text];
  }
  return getInteractionText(record.content ?? record.parts);
}

function parseInteractionInput(
  prompt: string,
  extractSystemInstructions: boolean,
): ParsedInteractionInput {
  try {
    const parsedPrompt = JSON.parse(prompt) as unknown;
    const envelopeSystemInstruction =
      parsedPrompt && typeof parsedPrompt === 'object' && !Array.isArray(parsedPrompt)
        ? getInteractionText((parsedPrompt as { system_instruction?: unknown }).system_instruction)
        : [];
    const parsed =
      parsedPrompt &&
      typeof parsedPrompt === 'object' &&
      !Array.isArray(parsedPrompt) &&
      Array.isArray((parsedPrompt as { contents?: unknown }).contents)
        ? (parsedPrompt as { contents: unknown[] }).contents
        : parsedPrompt;
    if (Array.isArray(parsed)) {
      const systemInstructions = [...envelopeSystemInstruction];
      const input = parsed.flatMap((content): unknown[] => {
        if (!content || typeof content !== 'object') {
          return [content];
        }

        const normalizePart = (part: unknown) => {
          if (!part || typeof part !== 'object') {
            return part;
          }
          if (!('type' in part)) {
            const geminiPart = part as {
              text?: string;
              inlineData?: { mimeType?: string; data?: string };
              inline_data?: { mime_type?: string; data?: string };
              fileData?: { mimeType?: string; fileUri?: string };
              file_data?: { mime_type?: string; file_uri?: string };
            };
            if (typeof geminiPart.text === 'string') {
              return { type: 'text', text: geminiPart.text };
            }
            const inlineData = geminiPart.inlineData || geminiPart.inline_data;
            const mimeType =
              geminiPart.inlineData?.mimeType ||
              geminiPart.inline_data?.mime_type ||
              geminiPart.fileData?.mimeType ||
              geminiPart.file_data?.mime_type;
            if (mimeType) {
              const type = mimeType.startsWith('video/')
                ? 'video'
                : mimeType.startsWith('audio/')
                  ? 'audio'
                  : 'image';
              return inlineData
                ? { type, mime_type: mimeType, data: inlineData.data }
                : {
                    type,
                    mime_type: mimeType,
                    uri: geminiPart.fileData?.fileUri || geminiPart.file_data?.file_uri,
                  };
            }
            return part;
          }
          const imagePart = part as { type?: string; image_url?: string | { url?: string } };
          if (imagePart.type === 'input_audio') {
            const inputAudio = (part as { input_audio?: { data?: string; format?: string } })
              .input_audio;
            if (inputAudio?.data) {
              const mimeType = normalizeAudioMimeType(inputAudio.format?.toLowerCase());
              return { type: 'audio', mime_type: mimeType, data: inputAudio.data };
            }
          }
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
          return [normalizePart(content)];
        }

        const {
          role,
          content: messageContent,
          parts,
          ...message
        } = content as Record<string, unknown>;
        const interactionContent = messageContent ?? parts;
        if (role === 'system' && extractSystemInstructions) {
          systemInstructions.push(...getInteractionText(interactionContent));
          return [];
        }
        const normalizedContent = Array.isArray(interactionContent)
          ? interactionContent.map((part) => normalizePart(part))
          : typeof interactionContent === 'string'
            ? [{ type: 'text', text: interactionContent }]
            : interactionContent && typeof interactionContent === 'object'
              ? [normalizePart(interactionContent)]
              : [];
        return [
          {
            ...message,
            type: role === 'assistant' || role === 'model' ? 'model_output' : 'user_input',
            content: normalizedContent,
          },
        ];
      });
      if (input.length === 0 && systemInstructions.length > 0) {
        return {
          input: [
            {
              type: 'user_input',
              content: systemInstructions.map((text) => ({ type: 'text', text })),
            },
          ],
          hasSystemInstruction: true,
        };
      }
      return {
        input,
        ...(systemInstructions.length > 0
          ? {
              systemInstruction: systemInstructions.join('\n'),
              hasSystemInstruction: true,
            }
          : {}),
      };
    }
    return {
      input:
        parsed && typeof parsed === 'object'
          ? (parsed as unknown[] | Record<string, unknown>)
          : prompt,
      ...(envelopeSystemInstruction.length > 0
        ? {
            systemInstruction: envelopeSystemInstruction.join('\n'),
            hasSystemInstruction: true,
          }
        : {}),
    };
  } catch {
    return { input: prompt };
  }
}

const INTERACTION_GENERATION_FIELDS = new Set([
  'max_output_tokens',
  'seed',
  'stop_sequences',
  'thinking_level',
  'thinking_summaries',
  'tool_choice',
  'transcription_config',
  'video_config',
]);

const INTERACTION_GENERATION_ALIASES: Record<string, string> = {
  maxOutputTokens: 'max_output_tokens',
  stopSequences: 'stop_sequences',
  thinkingLevel: 'thinking_level',
  thinkingSummaries: 'thinking_summaries',
  toolChoice: 'tool_choice',
  transcriptionConfig: 'transcription_config',
  videoConfig: 'video_config',
};

const INTERACTION_TOP_LEVEL_GENERATION_FIELDS = new Set([
  ...INTERACTION_GENERATION_FIELDS,
  ...Object.keys(INTERACTION_GENERATION_ALIASES),
  'temperature',
  'top_p',
  'topP',
  'top_k',
  'topK',
  'thinkingConfig',
  'thinking_config',
  'thinkingBudget',
  'thinking_budget',
  'negative_prompt',
  'negativePrompt',
  'responseMimeType',
  'response_mime_type',
  'responseSchema',
  'response_schema',
]);

type NormalizedInteractionGenerationConfig = {
  config: Record<string, unknown>;
  error?: string;
};

function normalizeInteractionThinkingLevel(value: unknown): unknown {
  return typeof value === 'string' ? value.toLowerCase() : value;
}

function normalizeInteractionGenerationConfig(
  value: unknown,
): NormalizedInteractionGenerationConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { config: {} };
  }

  const config: Record<string, unknown> = {};
  for (const [field, fieldValue] of Object.entries(value)) {
    if (field === 'thinkingConfig' || field === 'thinking_config') {
      if (!fieldValue || typeof fieldValue !== 'object' || Array.isArray(fieldValue)) {
        continue;
      }
      const thinkingConfig = fieldValue as Record<string, unknown>;
      const thinkingBudget = thinkingConfig.thinkingBudget ?? thinkingConfig.thinking_budget;
      if (typeof thinkingBudget === 'number') {
        return {
          config: {},
          error:
            'Gemini Interactions generation_config does not support numeric thinkingBudget; use thinkingConfig.thinkingLevel instead.',
        };
      }
      const thinkingLevel = thinkingConfig.thinkingLevel ?? thinkingConfig.thinking_level;
      if (thinkingLevel !== undefined) {
        config.thinking_level = normalizeInteractionThinkingLevel(thinkingLevel);
      }
      continue;
    }
    if (field === 'thinkingBudget' || field === 'thinking_budget') {
      if (typeof fieldValue === 'number') {
        return {
          config: {},
          error:
            'Gemini Interactions generation_config does not support numeric thinkingBudget; use thinking_level instead.',
        };
      }
      continue;
    }

    const normalizedField = INTERACTION_GENERATION_ALIASES[field] || field;
    if (!INTERACTION_GENERATION_FIELDS.has(normalizedField) || fieldValue === undefined) {
      continue;
    }
    config[normalizedField] =
      normalizedField === 'thinking_level'
        ? normalizeInteractionThinkingLevel(fieldValue)
        : fieldValue;
  }
  return { config };
}

function normalizeInteractionServiceTier(
  value: unknown,
): 'flex' | 'standard' | 'priority' | undefined {
  return value === 'flex' || value === 'standard' || value === 'priority' ? value : undefined;
}

type InteractionStructuredOutputLayer = {
  generationConfigs: unknown[];
  responseSchema?: string;
};

function parseInteractionStructuredOutput(
  layers: InteractionStructuredOutputLayer[],
  contextVars?: CallApiContextParams['vars'],
): { mimeType?: string; schema?: unknown } {
  let legacyMimeType: unknown;
  let legacyResponseSchema: unknown;
  for (const layer of layers) {
    let layerMimeType: unknown;
    let layerResponseSchema: unknown;
    for (const generationConfig of layer.generationConfigs) {
      if (
        !generationConfig ||
        typeof generationConfig !== 'object' ||
        Array.isArray(generationConfig)
      ) {
        continue;
      }
      const config = generationConfig as Record<string, unknown>;
      const responseMimeType = config.response_mime_type ?? config.responseMimeType;
      const responseSchemaValue = config.response_schema ?? config.responseSchema;
      if (responseMimeType !== undefined) {
        layerMimeType = responseMimeType;
      }
      if (responseSchemaValue !== undefined) {
        layerResponseSchema = responseSchemaValue;
      }
    }
    if (layer.responseSchema !== undefined && layerResponseSchema !== undefined) {
      throw new Error(
        '`responseSchema` provided but `generationConfig.response_schema` already set.',
      );
    }
    if (layerMimeType !== undefined) {
      legacyMimeType = layerMimeType;
    }
    const resolvedLayerSchema = layer.responseSchema ?? layerResponseSchema;
    if (resolvedLayerSchema !== undefined) {
      legacyResponseSchema = resolvedLayerSchema;
    }
  }

  const schema =
    legacyResponseSchema === undefined
      ? undefined
      : parseConfigResponseSchema(legacyResponseSchema as string, contextVars);
  const mimeType =
    typeof legacyMimeType === 'string'
      ? legacyMimeType
      : schema === undefined
        ? undefined
        : 'application/json';
  return { mimeType, schema };
}

function normalizeInteractionSafetySettings(
  safetySettings: NonNullable<CompletionOptions['safetySettings']>,
) {
  return safetySettings.map(({ category, threshold, probability }) => ({
    type: category.replace(/^HARM_CATEGORY_/i, '').toLowerCase(),
    ...(threshold || probability ? { threshold: (threshold || probability)?.toLowerCase() } : {}),
  }));
}

function getInteractionModalityTokenCount(
  details: Array<{ modality?: string; tokens?: number }> | undefined,
  modalities: string[],
): number {
  return (details || [])
    .filter((detail) => modalities.includes(detail.modality?.toLowerCase() || ''))
    .reduce((total, detail) => total + Math.max(detail.tokens ?? 0, 0), 0);
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

function getVertexInteractionsEndpoint(
  config: GoogleProviderConfig,
  projectId: string,
  env?: EnvOverrides,
): string {
  const region =
    config.region ||
    env?.VERTEX_REGION ||
    getEnvString('VERTEX_REGION') ||
    getEnvString('GOOGLE_CLOUD_LOCATION') ||
    'global';
  const configuredHost =
    config.apiBaseUrl ||
    config.apiHost ||
    env?.VERTEX_API_HOST ||
    getEnvString('VERTEX_API_HOST') ||
    (region === 'global' ? 'aiplatform.googleapis.com' : `${region}-aiplatform.googleapis.com`);
  const host = /^https?:\/\//i.test(configuredHost) ? configuredHost : `https://${configuredHost}`;
  return `${host.replace(/\/$/, '')}/v1beta1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(region)}/interactions`;
}

export class GoogleInteractionsProvider implements ApiProvider {
  modelName: string;
  config: GoogleProviderConfig;
  env?: EnvOverrides;
  private providerId?: string;

  constructor(
    modelName: string,
    options: { config?: GoogleProviderConfig; env?: EnvOverrides; id?: string } = {},
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

    const promptConfig = context?.prompt?.config as Partial<CompletionOptions> | undefined;
    const config = mergeGoogleCompletionOptions(this.config, promptConfig) as GoogleProviderConfig;
    const providerPassthrough = this.config.passthrough || {};
    const promptPassthrough = promptConfig?.passthrough || {};
    const mergedPassthrough = {
      ...providerPassthrough,
      ...promptPassthrough,
    };
    const passthroughModel = promptPassthrough.model ?? providerPassthrough.model;
    const effectiveModel = typeof passthroughModel === 'string' ? passthroughModel : this.modelName;
    const isVideoModel = effectiveModel === 'gemini-omni-flash-preview';
    const {
      input: interactionInput,
      systemInstruction: promptSystemInstruction,
      hasSystemInstruction: hasPromptSystemInstruction,
    } = parseInteractionInput(prompt, !isVideoModel);
    const requestInput =
      promptPassthrough.input ??
      providerPassthrough.input ??
      (config.vertexai && typeof interactionInput === 'string'
        ? [{ type: 'text', text: interactionInput }]
        : interactionInput);
    if (
      (typeof requestInput === 'string' && !requestInput.trim()) ||
      (Array.isArray(requestInput) && requestInput.length === 0)
    ) {
      return { error: 'Gemini Interactions prompt must contain at least one input item.' };
    }
    const previousInteractionId =
      promptPassthrough.previous_interaction_id ??
      promptPassthrough.previousInteractionId ??
      promptConfig?.previousInteractionId ??
      providerPassthrough.previous_interaction_id ??
      providerPassthrough.previousInteractionId ??
      this.config.previousInteractionId;
    const providerPassthroughResponseFormat =
      providerPassthrough.response_format ?? providerPassthrough.responseFormat;
    const promptPassthroughResponseFormat =
      promptPassthrough.response_format ?? promptPassthrough.responseFormat;
    const providerPassthroughSystemInstruction =
      providerPassthrough.system_instruction ?? providerPassthrough.systemInstruction;
    const promptPassthroughSystemInstruction =
      promptPassthrough.system_instruction ?? promptPassthrough.systemInstruction;
    const passthroughSystemInstruction =
      promptPassthroughSystemInstruction ??
      (promptConfig?.systemInstruction === undefined && !hasPromptSystemInstruction
        ? providerPassthroughSystemInstruction
        : undefined);
    const hasConfigTools = Array.isArray(config.tools)
      ? config.tools.length > 0
      : Boolean(config.tools);
    const hasPassthroughTools = Array.isArray(mergedPassthrough.tools)
      ? mergedPassthrough.tools.length > 0
      : Boolean(mergedPassthrough.tools);
    const hasClientExecutedTools = Array.isArray(mergedPassthrough.tools)
      ? mergedPassthrough.tools.some(
          (tool) =>
            tool !== null &&
            typeof tool === 'object' &&
            !Array.isArray(tool) &&
            ['function', 'computer_use'].includes(String((tool as { type?: unknown }).type)),
        )
      : false;
    const hasMcpTools = config.mcp?.enabled === true;
    if (config.vertexai && isVideoModel && previousInteractionId) {
      return {
        error:
          'Gemini Omni on Vertex AI does not support previousInteractionId. Use the Google AI Studio route for conversational video editing.',
      };
    }
    if (isVideoModel && (hasConfigTools || hasPassthroughTools || hasMcpTools)) {
      return {
        error:
          'Gemini Omni Flash does not support tools, including grounding, code execution, or function calling.',
      };
    }
    if (!isVideoModel && (hasConfigTools || hasMcpTools)) {
      return {
        error:
          'Gemini Interactions models require Interactions-native tool declarations in config.passthrough.tools; generateContent-style config.tools and MCP tools are not supported on this route.',
      };
    }
    if (!isVideoModel && hasClientExecutedTools) {
      return {
        error:
          'Gemini Interactions custom function and computer-use tools are not supported because Promptfoo does not yet handle requires_action responses. Use managed built-in tools in config.passthrough.tools.',
      };
    }
    let apiKey: string | undefined;
    let endpoint: string;
    let headers: Record<string, string>;
    if (config.vertexai) {
      try {
        const { client, projectId: authProjectId } = await GoogleAuthManager.getOAuthClient({
          credentials: config.credentials,
          googleAuthOptions: config.googleAuthOptions,
          keyFilename: config.keyFilename,
          scopes: config.scopes,
        });
        const projectId =
          config.projectId ||
          this.env?.VERTEX_PROJECT_ID ||
          this.env?.GOOGLE_PROJECT_ID ||
          this.env?.GOOGLE_CLOUD_PROJECT ||
          getEnvString('VERTEX_PROJECT_ID') ||
          getEnvString('GOOGLE_PROJECT_ID') ||
          getEnvString('GOOGLE_CLOUD_PROJECT') ||
          authProjectId;
        if (!projectId) {
          return {
            error:
              'Gemini Omni on Vertex AI requires a project ID. Set GOOGLE_CLOUD_PROJECT or add projectId to the provider config.',
          };
        }
        const accessToken = await client.getAccessToken();
        const token = typeof accessToken === 'string' ? accessToken : accessToken?.token;
        if (!token) {
          return { error: 'Gemini Omni on Vertex AI could not obtain an OAuth access token.' };
        }
        endpoint = getVertexInteractionsEndpoint(config, projectId, this.env);
        const { authorization, ...authHeaders } =
          typeof client.getRequestHeaders === 'function'
            ? Object.fromEntries((await client.getRequestHeaders(endpoint)).entries())
            : {};
        headers = {
          'Content-Type': 'application/json',
          'Api-Revision': '2026-05-20',
          Authorization: authorization || `Bearer ${token}`,
          ...authHeaders,
          ...config.headers,
        };
      } catch (err) {
        return { error: `Gemini Omni Vertex AI authentication error: ${String(err)}` };
      }
    } else {
      const rawApiKey =
        GoogleAuthManager.getApiKey(config, this.env).apiKey ||
        this.env?.GOOGLE_GENERATIVE_AI_API_KEY ||
        getEnvString('GOOGLE_GENERATIVE_AI_API_KEY');
      apiKey = rawApiKey ? getNunjucksEngine().renderString(rawApiKey, {}) : undefined;
      if (!apiKey) {
        return {
          error:
            'Gemini Interactions API requires an API key. Set GOOGLE_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, GEMINI_API_KEY, or PALM_API_KEY, or add apiKey to the provider config.',
        };
      }
      endpoint = getInteractionsEndpoint(config, this.env);
      headers = {
        'Content-Type': 'application/json',
        'Api-Revision': '2026-05-20',
        'x-goog-api-key': apiKey,
        ...config.headers,
      };
    }
    const providerGenerationConfig = normalizeInteractionGenerationConfig({
      ...(this.config.maxOutputTokens === undefined
        ? {}
        : { max_output_tokens: this.config.maxOutputTokens }),
      ...(this.config.stopSequences === undefined
        ? {}
        : { stop_sequences: this.config.stopSequences }),
      ...(this.config.seed === undefined ? {} : { seed: this.config.seed }),
      ...(this.config.generationConfig || {}),
    });
    if (providerGenerationConfig.error) {
      return { error: providerGenerationConfig.error };
    }
    const promptGenerationConfig = normalizeInteractionGenerationConfig({
      ...(promptConfig?.maxOutputTokens === undefined
        ? {}
        : { max_output_tokens: promptConfig.maxOutputTokens }),
      ...(promptConfig?.stopSequences === undefined
        ? {}
        : { stop_sequences: promptConfig.stopSequences }),
      ...(promptConfig?.seed === undefined ? {} : { seed: promptConfig.seed }),
      ...(promptConfig?.generationConfig || {}),
    });
    if (promptGenerationConfig.error) {
      return { error: promptGenerationConfig.error };
    }
    const providerPassthroughCamelGenerationConfig = normalizeInteractionGenerationConfig(
      providerPassthrough.generationConfig,
    );
    if (providerPassthroughCamelGenerationConfig.error) {
      return { error: providerPassthroughCamelGenerationConfig.error };
    }
    const providerPassthroughGenerationConfig = normalizeInteractionGenerationConfig(
      providerPassthrough.generation_config,
    );
    if (providerPassthroughGenerationConfig.error) {
      return { error: providerPassthroughGenerationConfig.error };
    }
    const promptPassthroughCamelGenerationConfig = normalizeInteractionGenerationConfig(
      promptPassthrough.generationConfig,
    );
    if (promptPassthroughCamelGenerationConfig.error) {
      return { error: promptPassthroughCamelGenerationConfig.error };
    }
    const promptPassthroughGenerationConfig = normalizeInteractionGenerationConfig(
      promptPassthrough.generation_config,
    );
    if (promptPassthroughGenerationConfig.error) {
      return { error: promptPassthroughGenerationConfig.error };
    }
    const generationConfig = {
      ...providerGenerationConfig.config,
      ...providerPassthroughCamelGenerationConfig.config,
      ...providerPassthroughGenerationConfig.config,
      ...promptGenerationConfig.config,
      ...promptPassthroughCamelGenerationConfig.config,
      ...promptPassthroughGenerationConfig.config,
    };
    const providerServiceTier =
      providerPassthrough.service_tier ??
      providerPassthrough.serviceTier ??
      this.config.service_tier;
    const promptServiceTier =
      promptPassthrough.service_tier ?? promptPassthrough.serviceTier ?? promptConfig?.service_tier;
    const rawServiceTier = promptServiceTier ?? providerServiceTier;
    const serviceTier = normalizeInteractionServiceTier(rawServiceTier);
    if (rawServiceTier !== undefined && serviceTier === undefined) {
      return {
        error: 'Gemini Interactions service_tier must be one of flex, standard, or priority.',
      };
    }
    const billingConfig = {
      ...config,
      service_tier: serviceTier,
      passthrough: {
        ...(config.passthrough || {}),
        service_tier: serviceTier,
        serviceTier,
      },
    };
    const passthrough = {
      ...Object.fromEntries(
        Object.entries(mergedPassthrough).filter(
          ([field]) =>
            field !== 'generation_config' &&
            field !== 'generationConfig' &&
            field !== 'model' &&
            field !== 'service_tier' &&
            field !== 'serviceTier' &&
            field !== 'previous_interaction_id' &&
            field !== 'previousInteractionId' &&
            field !== 'response_format' &&
            field !== 'responseFormat' &&
            field !== 'system_instruction' &&
            field !== 'systemInstruction' &&
            field !== 'input' &&
            field !== 'store' &&
            field !== 'safety_settings' &&
            !INTERACTION_TOP_LEVEL_GENERATION_FIELDS.has(field),
        ),
      ),
      ...(!isVideoModel && passthroughSystemInstruction !== undefined
        ? { system_instruction: passthroughSystemInstruction }
        : {}),
    };
    const systemInstructionContent =
      !isVideoModel && passthroughSystemInstruction === undefined
        ? parseConfigSystemInstruction(config.systemInstruction, context?.vars)
        : undefined;
    const systemInstruction =
      !isVideoModel && passthroughSystemInstruction === undefined
        ? [
            ...(systemInstructionContent?.parts
              .map((part) => part.text)
              .filter((text): text is string => typeof text === 'string') ?? []),
            ...(promptSystemInstruction ? [promptSystemInstruction] : []),
          ].join('\n')
        : undefined;
    const promptStructuredOutput =
      !isVideoModel && promptPassthroughResponseFormat === undefined
        ? parseInteractionStructuredOutput(
            [
              {
                generationConfigs: [promptConfig?.generationConfig],
                responseSchema: promptConfig?.responseSchema,
              },
              {
                generationConfigs: [
                  promptPassthrough.generationConfig,
                  promptPassthrough.generation_config,
                ],
              },
            ],
            context?.vars,
          )
        : undefined;
    const hasPromptStructuredOutput =
      promptStructuredOutput?.mimeType !== undefined ||
      promptStructuredOutput?.schema !== undefined;
    const passthroughResponseFormat =
      promptPassthroughResponseFormat ??
      (hasPromptStructuredOutput ? undefined : providerPassthroughResponseFormat);
    const providerStructuredOutput =
      !isVideoModel && passthroughResponseFormat === undefined && !hasPromptStructuredOutput
        ? parseInteractionStructuredOutput(
            [
              {
                generationConfigs: [this.config.generationConfig],
                responseSchema: this.config.responseSchema,
              },
              {
                generationConfigs: [
                  providerPassthrough.generationConfig,
                  providerPassthrough.generation_config,
                ],
              },
            ],
            context?.vars,
          )
        : undefined;
    const structuredOutput = hasPromptStructuredOutput
      ? promptStructuredOutput
      : providerStructuredOutput;
    const generatedVideoResponseFormat = config.vertexai
      ? [
          {
            type: 'video',
            ...(config.aspectRatio ? { aspect_ratio: config.aspectRatio } : {}),
          },
        ]
      : {
          type: 'video',
          ...(config.aspectRatio ? { aspect_ratio: config.aspectRatio } : {}),
        };
    const videoResponseFormat =
      promptPassthroughResponseFormat ??
      (promptConfig?.aspectRatio === undefined
        ? (providerPassthroughResponseFormat ?? generatedVideoResponseFormat)
        : generatedVideoResponseFormat);
    const store =
      promptPassthrough.store ??
      promptConfig?.store ??
      providerPassthrough.store ??
      this.config.store;
    const providerSafetySettings =
      providerPassthrough.safety_settings ??
      (this.config.safetySettings
        ? normalizeInteractionSafetySettings(this.config.safetySettings)
        : undefined);
    const promptSafetySettings =
      promptPassthrough.safety_settings ??
      (promptConfig?.safetySettings
        ? normalizeInteractionSafetySettings(promptConfig.safetySettings)
        : undefined);
    const safetySettings = promptSafetySettings ?? providerSafetySettings;
    const body = {
      model: effectiveModel,
      input: requestInput,
      ...(isVideoModel
        ? { response_format: videoResponseFormat }
        : passthroughResponseFormat === undefined
          ? structuredOutput?.mimeType || structuredOutput?.schema !== undefined
            ? {
                response_format: [
                  {
                    type: 'text',
                    ...(structuredOutput.mimeType ? { mime_type: structuredOutput.mimeType } : {}),
                    ...(structuredOutput.schema === undefined
                      ? {}
                      : { schema: structuredOutput.schema }),
                  },
                ],
              }
            : {}
          : { response_format: passthroughResponseFormat }),
      ...(previousInteractionId === undefined
        ? {}
        : { previous_interaction_id: previousInteractionId }),
      ...(store === undefined ? {} : { store }),
      ...(safetySettings === undefined ? {} : { safety_settings: safetySettings }),
      ...(systemInstruction ? { system_instruction: systemInstruction } : {}),
      ...(Object.keys(generationConfig).length > 0 ? { generation_config: generationConfig } : {}),
      ...(serviceTier ? { service_tier: serviceTier } : {}),
      ...passthrough,
      background: false,
      stream: false,
    };

    let data: InteractionResponse;
    let cached: boolean;
    let httpStatus: number;
    let httpStatusText: string;
    try {
      ({
        data,
        cached,
        status: httpStatus,
        statusText: httpStatusText,
      } = (await fetchWithCache(
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
      )) as { data: InteractionResponse; cached: boolean; status: number; statusText: string });
    } catch (err) {
      return { error: `Gemini Interactions API error: ${String(err)}` };
    }

    if (data.error?.message) {
      return { error: `Gemini Interactions API error: ${data.error.message}` };
    }
    if (httpStatus && (httpStatus < 200 || httpStatus >= 300)) {
      // Gateways and proxies can fail without a Google-shaped `error.message` body.
      return {
        error: `Gemini Interactions API error: HTTP ${httpStatus} ${httpStatusText}`.trim(),
        raw: data,
      };
    }

    const pollTimeoutMs = config.timeoutMs ?? getRequestTimeoutMs();
    const pollStartedAt = Date.now();
    let pollCount = 0;
    while (data.status === 'in_progress' && data.id) {
      const elapsed = Date.now() - pollStartedAt;
      if (elapsed >= pollTimeoutMs) {
        return {
          error: `Gemini interaction timed out after ${pollTimeoutMs}ms (status: ${data.status})`,
          raw: data,
        };
      }
      if (pollCount > 0) {
        await sleep(Math.min(1_000, pollTimeoutMs - elapsed));
      }
      try {
        ({
          data,
          status: httpStatus,
          statusText: httpStatusText,
        } = (await fetchWithCache(
          `${endpoint}/${encodeURIComponent(data.id)}`,
          { method: 'GET', headers } as RequestInit,
          Math.max(pollTimeoutMs - (Date.now() - pollStartedAt), 1),
          'json',
          true,
        )) as { data: InteractionResponse; cached: boolean; status: number; statusText: string });
      } catch (err) {
        return { error: `Gemini Interactions API polling error: ${String(err)}` };
      }
      pollCount++;
      if (data.error?.message) {
        return { error: `Gemini Interactions API error: ${data.error.message}`, raw: data };
      }
      if (httpStatus && (httpStatus < 200 || httpStatus >= 300)) {
        return {
          error:
            `Gemini Interactions API polling error: HTTP ${httpStatus} ${httpStatusText}`.trim(),
          raw: data,
        };
      }
    }
    if (data.status && data.status !== 'completed') {
      return { error: `Gemini interaction did not complete (status: ${data.status})`, raw: data };
    }

    const latestUserInput = (data.steps || []).map((step) => step.type).lastIndexOf('user_input');
    const latestOutputError = (data.steps || [])
      .slice(latestUserInput + 1)
      .filter((step) => step.type === 'model_output')
      .find((step) => step.error?.message)?.error?.message;
    if (latestOutputError) {
      return { error: `Gemini Interactions API error: ${latestOutputError}`, raw: data };
    }

    const outputContent = getModelOutputContent(data);
    const lastTextIndex = outputContent.map((part) => part.type === 'text').lastIndexOf(true);
    const lastNonTextIndex = outputContent
      .slice(0, lastTextIndex)
      .map((part) => part.type !== 'text')
      .lastIndexOf(true);
    const text = outputContent
      .slice(lastNonTextIndex + 1, lastTextIndex + 1)
      .filter((part) => part.type === 'text' && part.text)
      .map((part) => part.text)
      .join('');

    const usage = data.usage;
    const promptTokens = (usage?.total_input_tokens ?? 0) + (usage?.total_tool_use_tokens ?? 0);
    const outputTokens = usage?.total_output_tokens ?? 0;
    const thoughtTokens = usage?.total_reasoning_tokens ?? usage?.total_thought_tokens ?? 0;
    const audioInputTokens =
      getInteractionModalityTokenCount(usage?.input_tokens_by_modality, ['audio']) +
      getInteractionModalityTokenCount(usage?.tool_use_tokens_by_modality, ['audio']);
    // Video *input* (e.g. a prior video being edited) is billed at the image rate,
    // matching the standard Gemini path's IMAGE/VIDEO/DOCUMENT input grouping.
    const imageInputTokens =
      getInteractionModalityTokenCount(usage?.input_tokens_by_modality, [
        'image',
        'document',
        'video',
      ]) +
      getInteractionModalityTokenCount(usage?.tool_use_tokens_by_modality, [
        'image',
        'document',
        'video',
      ]);
    const cachedAudioTokens = getInteractionModalityTokenCount(usage?.cached_tokens_by_modality, [
      'audio',
    ]);
    const cachedImageTokens = getInteractionModalityTokenCount(usage?.cached_tokens_by_modality, [
      'image',
      'document',
      'video',
    ]);
    const audioOutputTokens = getInteractionModalityTokenCount(usage?.output_tokens_by_modality, [
      'audio',
    ]);
    const videoTokens = getInteractionModalityTokenCount(usage?.output_tokens_by_modality, [
      'video',
    ]);
    const tokenUsage = {
      prompt: promptTokens,
      completion: outputTokens,
      total: usage?.total_tokens ?? promptTokens + outputTokens + thoughtTokens,
      cached: usage?.total_cached_tokens ?? 0,
      numRequests: 1,
      ...(thoughtTokens > 0 ? { completionDetails: { reasoning: thoughtTokens } } : {}),
    };
    const cost = cached
      ? undefined
      : calculateGoogleCost(
          effectiveModel,
          billingConfig,
          promptTokens,
          outputTokens + thoughtTokens,
          config.vertexai,
          audioInputTokens,
          audioOutputTokens,
          videoTokens,
          imageInputTokens,
          usage?.total_cached_tokens,
          cachedAudioTokens,
          cachedImageTokens,
        );

    if (!isVideoModel) {
      if (!text) {
        return { error: 'Gemini interaction did not return text output', raw: data };
      }
      return {
        output: text,
        cached,
        tokenUsage,
        cost,
        metadata: { interactionId: data.id, status: data.status },
      };
    }

    const video = [...outputContent].reverse().find((part) => part.type === 'video');
    if (!video?.data && !video?.uri) {
      return { error: 'Gemini interaction did not return video output', raw: data };
    }

    let blobRef;
    let videoBuffer = video.data ? Buffer.from(video.data, 'base64') : undefined;
    if (!videoBuffer && video.uri) {
      try {
        let downloadUrl = new URL(video.uri, endpoint);
        if (config.vertexai && downloadUrl.protocol === 'gs:') {
          const bucket = encodeURIComponent(downloadUrl.hostname);
          const object = encodeURIComponent(decodeURIComponent(downloadUrl.pathname.slice(1)));
          downloadUrl = new URL(
            `https://storage.googleapis.com/download/storage/v1/b/${bucket}/o/${object}?alt=media`,
          );
        }
        const endpointOrigin = new URL(endpoint).origin;
        const isVertexStorageDownload =
          config.vertexai && downloadUrl.origin === 'https://storage.googleapis.com';
        if (
          downloadUrl.origin === endpointOrigin ||
          isVertexStorageDownload ||
          (downloadUrl.protocol === 'https:' &&
            downloadUrl.hostname === 'generativelanguage.googleapis.com')
        ) {
          let downloadHeaders: Record<string, string> = {};
          if (downloadUrl.origin === endpointOrigin) {
            downloadHeaders = headers;
          } else if (isVertexStorageDownload) {
            downloadHeaders = Object.fromEntries(
              Object.entries(headers).filter(([header]) =>
                ['authorization', 'x-goog-user-project'].includes(header.toLowerCase()),
              ),
            );
          } else if (apiKey) {
            downloadHeaders = { 'x-goog-api-key': apiKey };
          }
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
            return {
              error:
                `Failed to download Gemini interaction video: HTTP ${response.status} ${response.statusText}`.trim(),
            };
          }
          videoBuffer = Buffer.from(await response.arrayBuffer());
        } else {
          // Not on the download allowlist — keep the raw URI in the output, but say why
          // the video was not fetched instead of silently returning a link we never followed.
          logger.warn(
            '[Google Interactions] Skipping video download from untrusted origin; returning the raw URI',
            { origin: downloadUrl.origin, protocol: downloadUrl.protocol },
          );
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

    const videoUrl = blobRef?.uri ?? video.uri;
    const sanitizedPrompt = prompt
      .replace(/\r?\n|\r/g, ' ')
      .replace(/\[/g, '(')
      .replace(/\]/g, ')')
      .slice(0, 50);

    return {
      output: text || `[Video: ${sanitizedPrompt}](${videoUrl})`,
      cached,
      tokenUsage,
      cost,
      video: {
        id: data.id,
        blobRef,
        url: videoUrl,
        format: video.mime_type?.split('/')[1] || 'mp4',
        model: effectiveModel,
        aspectRatio: config.aspectRatio,
      },
      metadata: { interactionId: data.id, status: data.status },
    };
  }
}
