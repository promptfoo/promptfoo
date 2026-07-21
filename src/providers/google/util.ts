import crypto from 'crypto';

import Clone from 'rfdc';
import { z } from 'zod';
import logger from '../../logger';
import { extractBase64FromDataUrl, isDataUrl, parseDataUrl } from '../../util/dataUrl';
import { maybeLoadFromExternalFile } from '../../util/file';
import { isJavascriptFile } from '../../util/fileExtensions';
import { parseFileUrl } from '../../util/functions/loadFunction';
import { renderVarsInObject } from '../../util/index';
import { getAjv } from '../../util/json';
import { getNunjucksEngine } from '../../util/templates';
import {
  calculateCost,
  clampCachedTokens,
  type ProviderConfig,
  parseChatPrompt,
  transformToolChoice,
} from '../shared';
import { loadCredentials } from './auth';
import { GOOGLE_MODELS } from './shared';
import { VALID_SCHEMA_TYPES } from './types';
import type { AnySchema } from 'ajv';

import type { VarValue } from '../../types/shared';
import type { CompletionOptions, Content, FunctionCall, Part, Schema, Tool } from './types';

/**
 * Normalizes safety settings to use the correct Google API field name `threshold`.
 * Accepts the legacy `probability` field for backwards compatibility and maps it to `threshold`.
 */
export function normalizeSafetySettings(
  safetySettings: CompletionOptions['safetySettings'],
): { category: string; threshold: string }[] | undefined {
  if (!safetySettings) {
    return undefined;
  }
  return safetySettings.map(({ category, threshold, probability }) => ({
    category,
    threshold: threshold || probability || '',
  }));
}

type GoogleToolConfig = NonNullable<CompletionOptions['toolConfig']>;

function normalizeGoogleToolMode(
  mode: unknown,
): NonNullable<NonNullable<GoogleToolConfig['functionCallingConfig']>['mode']> | undefined {
  if (typeof mode !== 'string') {
    return undefined;
  }

  switch (mode.toUpperCase()) {
    case 'MODE_UNSPECIFIED':
    case 'AUTO':
    case 'VALIDATED':
    case 'ANY':
    case 'NONE':
      return mode.toUpperCase() as NonNullable<
        NonNullable<GoogleToolConfig['functionCallingConfig']>['mode']
      >;
    default:
      return undefined;
  }
}

function normalizeExplicitGoogleToolConfig(
  config: CompletionOptions,
): GoogleToolConfig | undefined {
  if (config.toolConfig) {
    const { functionCallingConfig: rawFunctionCallingConfig, ...restToolConfig } =
      config.toolConfig;
    const normalizedToolConfig: GoogleToolConfig = { ...restToolConfig };

    if (rawFunctionCallingConfig) {
      const {
        mode: rawMode,
        allowedFunctionNames,
        ...restFunctionCallingConfig
      } = rawFunctionCallingConfig;
      const mode = normalizeGoogleToolMode(rawMode);
      const functionCallingConfig = {
        ...restFunctionCallingConfig,
        ...(mode ? { mode } : {}),
        ...(allowedFunctionNames?.length ? { allowedFunctionNames } : {}),
      };
      if (Object.keys(functionCallingConfig).length > 0) {
        normalizedToolConfig.functionCallingConfig = functionCallingConfig;
      }
    }

    return Object.keys(normalizedToolConfig).length > 0 ? normalizedToolConfig : undefined;
  }

  if (config.tool_config) {
    const {
      function_calling_config: rawFunctionCallingConfig,
      retrieval_config: retrievalConfig,
      include_server_side_tool_invocations: includeServerSideToolInvocations,
    } = config.tool_config;
    const normalizedToolConfig: GoogleToolConfig = {
      ...(retrievalConfig
        ? {
            retrievalConfig: {
              ...(retrievalConfig.lat_lng ? { latLng: retrievalConfig.lat_lng } : {}),
              ...(retrievalConfig.language_code
                ? { languageCode: retrievalConfig.language_code }
                : {}),
            },
          }
        : {}),
      ...(includeServerSideToolInvocations === undefined
        ? {}
        : { includeServerSideToolInvocations }),
    };

    if (rawFunctionCallingConfig) {
      const {
        mode: rawMode,
        allowed_function_names: allowedFunctionNames,
        stream_function_call_arguments: streamFunctionCallArguments,
      } = rawFunctionCallingConfig;
      const mode = normalizeGoogleToolMode(rawMode);
      const functionCallingConfig = {
        ...(mode ? { mode } : {}),
        ...(allowedFunctionNames?.length ? { allowedFunctionNames } : {}),
        ...(streamFunctionCallArguments === undefined ? {} : { streamFunctionCallArguments }),
      };
      if (Object.keys(functionCallingConfig).length > 0) {
        normalizedToolConfig.functionCallingConfig = functionCallingConfig;
      }
    }

    return Object.keys(normalizedToolConfig).length > 0 ? normalizedToolConfig : undefined;
  }

  return undefined;
}

export function resolveGoogleToolConfig(config: CompletionOptions): {
  toolConfig?: GoogleToolConfig;
  toolsDisabled: boolean;
} {
  const explicitConfig = normalizeExplicitGoogleToolConfig(config);
  const transformedToolChoice = transformToolChoice(config.tool_choice, 'google');
  const toolChoiceConfig =
    transformedToolChoice && typeof transformedToolChoice === 'object'
      ? (transformedToolChoice as GoogleToolConfig)
      : undefined;
  const explicitMode = normalizeGoogleToolMode(explicitConfig?.functionCallingConfig?.mode);
  const camelCaseMode = normalizeGoogleToolMode(config.toolConfig?.functionCallingConfig?.mode);
  const snakeCaseMode = normalizeGoogleToolMode(config.tool_config?.function_calling_config?.mode);
  const toolChoiceMode = normalizeGoogleToolMode(toolChoiceConfig?.functionCallingConfig?.mode);

  if (
    explicitMode === 'NONE' ||
    camelCaseMode === 'NONE' ||
    snakeCaseMode === 'NONE' ||
    toolChoiceMode === 'NONE'
  ) {
    return {
      toolConfig: { ...explicitConfig, functionCallingConfig: { mode: 'NONE' } },
      toolsDisabled: true,
    };
  }

  return {
    ...(explicitConfig
      ? {
          toolConfig: {
            ...toolChoiceConfig,
            ...explicitConfig,
            ...(toolChoiceConfig?.functionCallingConfig || explicitConfig.functionCallingConfig
              ? {
                  functionCallingConfig: {
                    ...toolChoiceConfig?.functionCallingConfig,
                    ...explicitConfig.functionCallingConfig,
                  },
                }
              : {}),
          },
        }
      : toolChoiceConfig
        ? { toolConfig: toolChoiceConfig }
        : {}),
    toolsDisabled: false,
  };
}

export function mergeGoogleCompletionOptions(
  baseConfig: CompletionOptions,
  promptConfig?: Partial<CompletionOptions>,
): CompletionOptions {
  const mergedConfig = {
    ...baseConfig,
    ...promptConfig,
  };

  // When the prompt explicitly sets any tool-policy field, replace the entire
  // base policy so semantics from base (e.g. allowedFunctionNames) don't leak
  // through under a different field name. We treat `undefined` as "not set" so
  // a defaulted variable like `{ tool_choice: undefined }` doesn't blank the base.
  const promptHasToolChoice = promptConfig?.tool_choice !== undefined;
  const promptHasToolConfig = promptConfig?.toolConfig !== undefined;
  const promptHasSnakeToolConfig = promptConfig?.tool_config !== undefined;

  if (promptHasToolChoice || promptHasToolConfig || promptHasSnakeToolConfig) {
    delete mergedConfig.tool_choice;
    delete mergedConfig.toolConfig;
    delete mergedConfig.tool_config;

    if (promptHasToolChoice) {
      mergedConfig.tool_choice = promptConfig!.tool_choice;
    }
    if (promptHasToolConfig) {
      mergedConfig.toolConfig = promptConfig!.toolConfig;
    }
    if (promptHasSnakeToolConfig) {
      mergedConfig.tool_config = promptConfig!.tool_config;
    }
  }

  return mergedConfig;
}

export function removeGoogleFunctionDeclarations(tools: unknown): Tool[] {
  const toolList = Array.isArray(tools) ? tools : [tools];
  return toolList.flatMap((rawTool) => {
    if (!rawTool || typeof rawTool !== 'object' || Array.isArray(rawTool)) {
      return [];
    }
    const { functionDeclarations, function_declarations, ...tool } = rawTool as Tool & {
      function_declarations?: unknown;
    };
    return (functionDeclarations || function_declarations) && Object.keys(tool).length === 0
      ? []
      : [tool as Tool];
  });
}

/**
 * Gemini 3.6 Flash and Gemini 3.5 Flash-Lite ignore sampling parameters and
 * reject candidate counts. Remove both typed and raw passthrough spellings.
 */
export function removeDeprecatedGeminiGenerationParams<T>(
  modelName: string,
  generationConfig: T,
): T {
  if (!modelName.startsWith('gemini-3.6-flash') && !modelName.startsWith('gemini-3.5-flash-lite')) {
    return generationConfig;
  }
  if (
    !generationConfig ||
    typeof generationConfig !== 'object' ||
    Array.isArray(generationConfig)
  ) {
    return generationConfig;
  }

  const sanitized = { ...generationConfig } as Record<string, unknown>;
  for (const field of [
    'temperature',
    'topP',
    'top_p',
    'topK',
    'top_k',
    'candidateCount',
    'candidate_count',
  ]) {
    delete sanitized[field];
  }
  return sanitized as T;
}

function stripExecutableToolFileReferencesFromValue(tools: unknown): unknown {
  if (typeof tools === 'string' && tools.startsWith('file://')) {
    const { filePath } = parseFileUrl(tools);
    if (filePath.endsWith('.py') || isJavascriptFile(filePath)) {
      return undefined;
    }
  }
  if (Array.isArray(tools)) {
    return tools.flatMap((tool) => {
      const strippedTool = stripExecutableToolFileReferencesFromValue(tool);
      return strippedTool === undefined ? [] : [strippedTool];
    });
  }
  return tools;
}

export function stripExecutableToolFileReferences(
  tools: unknown,
  vars?: Record<string, VarValue>,
): unknown {
  return stripExecutableToolFileReferencesFromValue(renderVarsInObject(tools, vars));
}

/**
 * Calculates the cost for a Google API call.
 *
 * Handles tiered pricing for models where cost varies by prompt size.
 * For example, Gemini Pro models have higher rates for prompts >200k tokens.
 * Some models (e.g. Gemini 2.0 Flash) have different pricing on Vertex AI.
 *
 * @param modelName - The name of the model used
 * @param config - Provider configuration (may contain custom cost override)
 * @param promptTokens - Number of tokens in the prompt
 * @param completionTokens - Number of tokens in the completion
 * @param isVertexMode - Whether the call was made via Vertex AI (uses Vertex pricing when available)
 * @param audioPromptTokens - Number of audio tokens included in the prompt token count
 * @param audioCompletionTokens - Number of audio tokens included in the completion token count
 * @param videoCompletionTokens - Number of video tokens included in the completion token count
 * @param imagePromptTokens - Number of image tokens included in the prompt token count
 * @param cachedPromptTokens - Number of cached tokens included in the prompt token count
 * @param cachedAudioPromptTokens - Number of cached audio tokens included in the prompt token count
 * @param cachedImagePromptTokens - Number of cached image tokens included in the prompt token count
 * @returns The calculated cost in dollars, or undefined if it cannot be calculated
 */
export function calculateGoogleCost(
  modelName: string,
  config: ProviderConfig,
  promptTokens?: number,
  completionTokens?: number,
  isVertexMode?: boolean,
  audioPromptTokens?: number,
  audioCompletionTokens?: number,
  videoCompletionTokens?: number,
  imagePromptTokens?: number,
  cachedPromptTokens?: number,
  cachedAudioPromptTokens?: number,
  cachedImagePromptTokens?: number,
): number | undefined {
  const model = GOOGLE_MODELS.find((m) => m.id === modelName);

  if (
    typeof promptTokens !== 'number' ||
    typeof completionTokens !== 'number' ||
    !Number.isFinite(promptTokens) ||
    !Number.isFinite(completionTokens)
  ) {
    return calculateCost(modelName, config, promptTokens, completionTokens, GOOGLE_MODELS);
  }

  const modelCost =
    model?.tieredCost && promptTokens > model.tieredCost.threshold
      ? model.tieredCost.above
      : isVertexMode && model?.vertexCost
        ? model.vertexCost
        : model?.cost;
  if (!modelCost) {
    return undefined;
  }

  const serviceTier =
    (config.passthrough as { service_tier?: unknown; serviceTier?: unknown } | undefined)
      ?.service_tier ??
    (config.passthrough as { serviceTier?: unknown } | undefined)?.serviceTier ??
    config.service_tier;
  let serviceTierMultiplier = 1;
  if (serviceTier === 'priority') {
    serviceTierMultiplier = modelCost.priorityMultiplier ?? 1;
  } else if (serviceTier === 'flex') {
    serviceTierMultiplier = modelCost.flexMultiplier ?? 1;
  }

  const region = (config as { region?: unknown }).region;
  const vertexRegionalMultiplier =
    isVertexMode && typeof region === 'string' && region !== 'global'
      ? (model?.vertexRegionalMultiplier ?? 1)
      : 1;
  const inputCost = config.inputCost ?? config.cost ?? modelCost.input * vertexRegionalMultiplier;
  const outputCost =
    config.outputCost ?? config.cost ?? modelCost.output * vertexRegionalMultiplier;
  const audioInputTokens = clampCachedTokens(audioPromptTokens, promptTokens);
  const imageInputTokens = clampCachedTokens(
    imagePromptTokens,
    Math.max(promptTokens - audioInputTokens, 0),
  );
  const textInputTokens = Math.max(promptTokens - audioInputTokens - imageInputTokens, 0);
  const cachedTokens = clampCachedTokens(cachedPromptTokens, promptTokens);
  let cachedAudioTokens = clampCachedTokens(
    cachedAudioPromptTokens,
    Math.min(cachedTokens, audioInputTokens),
  );
  let cachedImageTokens = clampCachedTokens(
    cachedImagePromptTokens,
    Math.min(Math.max(cachedTokens - cachedAudioTokens, 0), imageInputTokens),
  );
  if (cachedAudioTokens === 0 && cachedImageTokens === 0) {
    const cachedNonTextTokens = Math.max(cachedTokens - textInputTokens, 0);
    if (imageInputTokens === 0) {
      cachedAudioTokens = Math.min(cachedNonTextTokens, audioInputTokens);
    } else if (audioInputTokens === 0) {
      cachedImageTokens = Math.min(cachedNonTextTokens, imageInputTokens);
    }
  }
  const cachedTextTokens = Math.min(
    Math.max(cachedTokens - cachedAudioTokens - cachedImageTokens, 0),
    textInputTokens,
  );
  const audioOutputTokens = clampCachedTokens(audioCompletionTokens, completionTokens);
  const videoOutputTokens = clampCachedTokens(
    videoCompletionTokens,
    Math.max(completionTokens - audioOutputTokens, 0),
  );
  const audioInputCost =
    config.audioInputCost ??
    config.audioCost ??
    config.inputCost ??
    config.cost ??
    (modelCost.audioInput === undefined
      ? undefined
      : modelCost.audioInput * vertexRegionalMultiplier) ??
    inputCost;
  const audioOutputCost =
    config.audioOutputCost ??
    config.audioCost ??
    config.outputCost ??
    config.cost ??
    (modelCost.audioOutput === undefined
      ? undefined
      : modelCost.audioOutput * vertexRegionalMultiplier) ??
    outputCost;
  const videoOutputCost =
    config.videoOutputCost ??
    config.outputCost ??
    config.cost ??
    (modelCost.videoOutput === undefined
      ? undefined
      : modelCost.videoOutput * vertexRegionalMultiplier) ??
    outputCost;
  const imageInputCost =
    config.imageInputCost ??
    config.inputCost ??
    config.cost ??
    (modelCost.imageInput === undefined
      ? undefined
      : modelCost.imageInput * vertexRegionalMultiplier) ??
    inputCost;
  const serviceTierCacheRead =
    serviceTier === 'priority' && modelCost.priorityCacheRead !== undefined
      ? modelCost.priorityCacheRead / serviceTierMultiplier
      : serviceTier === 'flex' && modelCost.flexCacheRead !== undefined
        ? modelCost.flexCacheRead / serviceTierMultiplier
        : modelCost.cacheRead;
  const cachedInputCost =
    config.inputCost ??
    config.cost ??
    (serviceTierCacheRead === undefined
      ? undefined
      : serviceTierCacheRead * vertexRegionalMultiplier) ??
    inputCost;
  const cachedAudioInputCost =
    config.audioInputCost ??
    config.audioCost ??
    config.inputCost ??
    config.cost ??
    (modelCost.cacheReadAudio === undefined
      ? undefined
      : modelCost.cacheReadAudio * vertexRegionalMultiplier) ??
    (serviceTierCacheRead === undefined
      ? undefined
      : serviceTierCacheRead * vertexRegionalMultiplier) ??
    audioInputCost;
  const cachedImageInputCost =
    config.imageInputCost ??
    config.inputCost ??
    config.cost ??
    (serviceTierCacheRead === undefined
      ? undefined
      : serviceTierCacheRead * vertexRegionalMultiplier) ??
    imageInputCost;
  // A modality/base cost override on the request takes precedence over the
  // catalog's tier-specific audio rate.
  const hasAudioInputOverride =
    config.audioInputCost !== undefined ||
    config.audioCost !== undefined ||
    config.inputCost !== undefined ||
    config.cost !== undefined;
  let serviceTierAudioInputCost = audioInputCost;
  if (!hasAudioInputOverride) {
    if (serviceTier === 'priority' && modelCost.priorityAudioInput !== undefined) {
      serviceTierAudioInputCost =
        (modelCost.priorityAudioInput / serviceTierMultiplier) * vertexRegionalMultiplier;
    } else if (serviceTier === 'flex' && modelCost.flexAudioInput !== undefined) {
      serviceTierAudioInputCost =
        (modelCost.flexAudioInput / serviceTierMultiplier) * vertexRegionalMultiplier;
    }
  }

  return (
    ((textInputTokens - cachedTextTokens) * inputCost +
      cachedTextTokens * cachedInputCost +
      (audioInputTokens - cachedAudioTokens) * serviceTierAudioInputCost +
      cachedAudioTokens * cachedAudioInputCost +
      (imageInputTokens - cachedImageTokens) * imageInputCost +
      cachedImageTokens * cachedImageInputCost +
      (completionTokens - audioOutputTokens - videoOutputTokens) * outputCost +
      audioOutputTokens * audioOutputCost +
      videoOutputTokens * videoOutputCost) *
    serviceTierMultiplier
  );
}

const getGoogleModalityTokenCount = (details: unknown, modalities: string[]): number => {
  if (!Array.isArray(details)) {
    return 0;
  }
  return details.reduce((total, detail) => {
    const tokenCount = detail?.tokenCount ?? detail?.token_count;
    return modalities.includes(detail?.modality) &&
      typeof tokenCount === 'number' &&
      Number.isFinite(tokenCount)
      ? total + Math.max(tokenCount, 0)
      : total;
  }, 0);
};

export function calculateGoogleCostFromUsage(
  modelName: string,
  config: ProviderConfig,
  promptTokens: number | undefined,
  completionTokens: number | undefined,
  isVertexMode: boolean,
  usageMetadata: any,
): number | undefined {
  const promptDetails = usageMetadata?.promptTokensDetails ?? usageMetadata?.prompt_tokens_details;
  const toolPromptDetails =
    usageMetadata?.toolUsePromptTokensDetails ?? usageMetadata?.tool_use_prompt_tokens_details;
  const responseDetails =
    usageMetadata?.candidatesTokensDetails ??
    usageMetadata?.responseTokensDetails ??
    usageMetadata?.candidates_tokens_details ??
    usageMetadata?.response_tokens_details;
  const cacheDetails = usageMetadata?.cacheTokensDetails ?? usageMetadata?.cache_tokens_details;
  const toolPromptTokens =
    usageMetadata?.toolUsePromptTokenCount ?? usageMetadata?.tool_use_prompt_token_count ?? 0;
  const promptTokensForCost =
    typeof promptTokens === 'number' &&
    typeof toolPromptTokens === 'number' &&
    Number.isFinite(toolPromptTokens)
      ? promptTokens + Math.max(toolPromptTokens, 0)
      : promptTokens;
  const audioPromptTokens =
    getGoogleModalityTokenCount(promptDetails, ['AUDIO']) +
    getGoogleModalityTokenCount(toolPromptDetails, ['AUDIO']);
  const imagePromptTokens =
    getGoogleModalityTokenCount(promptDetails, ['IMAGE', 'VIDEO', 'DOCUMENT']) +
    getGoogleModalityTokenCount(toolPromptDetails, ['IMAGE', 'VIDEO', 'DOCUMENT']);

  return calculateGoogleCost(
    modelName,
    config,
    promptTokensForCost,
    completionTokens,
    isVertexMode,
    audioPromptTokens,
    getGoogleModalityTokenCount(responseDetails, ['AUDIO']),
    getGoogleModalityTokenCount(responseDetails, ['VIDEO']),
    imagePromptTokens,
    usageMetadata?.cachedContentTokenCount ?? usageMetadata?.cached_content_token_count,
    getGoogleModalityTokenCount(cacheDetails, ['AUDIO']),
    getGoogleModalityTokenCount(cacheDetails, ['IMAGE', 'VIDEO', 'DOCUMENT']),
  );
}

const ajv = getAjv();
// property_ordering is an optional field sometimes present in gemini tool configs, but ajv doesn't know about it.
// At the moment we will just ignore it, so the is-valid-function-call won't check property field ordering.
ajv.addKeyword('property_ordering');
const clone = Clone();

type Probability = 'NEGLIGIBLE' | 'LOW' | 'MEDIUM' | 'HIGH';

interface SafetyRating {
  category:
    | 'HARM_CATEGORY_HARASSMENT'
    | 'HARM_CATEGORY_HATE_SPEECH'
    | 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
    | 'HARM_CATEGORY_DANGEROUS_CONTENT';
  probability: Probability;
  blocked: boolean;
}

interface Candidate {
  content: Content;
  finishReason?:
    | 'BLOCKLIST'
    | 'FINISH_REASON_UNSPECIFIED'
    | 'MALFORMED_FUNCTION_CALL'
    | 'MAX_TOKENS'
    | 'OTHER'
    | 'PROHIBITED_CONTENT'
    | 'RECITATION'
    | 'SAFETY'
    | 'SPII'
    | 'STOP';
  groundingChunks?: Record<string, any>[];
  groundingMetadata?: Record<string, any>;
  groundingSupports?: Record<string, any>[];
  safetyRatings: SafetyRating[];
  webSearchQueries?: string[];
}

interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount?: number;
  totalTokenCount: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
  toolUsePromptTokenCount?: number;
  promptTokensDetails?: Array<{ modality: string; tokenCount: number }>;
  toolUsePromptTokensDetails?: Array<{ modality: string; tokenCount: number }>;
  candidatesTokensDetails?: Array<{ modality: string; tokenCount: number }>;
  responseTokensDetails?: Array<{ modality: string; tokenCount: number }>;
  cacheTokensDetails?: Array<{ modality: string; tokenCount: number }>;
}

export interface GeminiErrorResponse {
  error: {
    code: number;
    message: string;
    status: string;
  };
}

export interface GeminiResponseData {
  candidates: Candidate[];
  usageMetadata?: GeminiUsageMetadata;
  promptFeedback?: {
    safetyRatings: Array<{ category: string; probability: string }>;
    blockReason: any;
    /** Message explaining why content was blocked (e.g., by Model Armor) */
    blockReasonMessage?: string;
  };
}

interface GeminiPromptFeedback {
  blockReason?: 'PROHIBITED_CONTENT';
}

interface GeminiUsageMetadata {
  promptTokenCount: number;
  totalTokenCount: number;
  thoughtsTokenCount?: number;
}

interface GeminiBlockedResponse {
  promptFeedback: GeminiPromptFeedback;
  usageMetadata: GeminiUsageMetadata;
}

export type GeminiApiResponse = (
  | GeminiResponseData
  | GeminiErrorResponse
  | GeminiBlockedResponse
)[];

export interface Palm2ApiResponse {
  error?: {
    code: string;
    message: string;
  };
  predictions?: [
    {
      candidates: [
        {
          content: string;
        },
      ];
    },
  ];
}

const PartSchema = z
  .object({
    text: z.string().optional(),
    inline_data: z
      .object({
        mime_type: z.string(),
        data: z.string(),
      })
      .optional(),
  })
  .passthrough();

const ContentSchema = z.object({
  role: z.enum(['user', 'model']).optional(),
  parts: z.array(PartSchema),
});

const GeminiFormatSchema = z.array(ContentSchema);

export type GeminiFormat = { role?: 'user' | 'model'; parts: Part[] }[];

export function maybeCoerceToGeminiFormat(
  contents: any,
  options?: { useAssistantRole?: boolean },
): {
  contents: GeminiFormat;
  coerced: boolean;
  systemInstruction: { parts: [Part, ...Part[]] } | undefined;
} {
  let coerced = false;
  const parseResult = GeminiFormatSchema.safeParse(contents);

  if (parseResult.success) {
    // Check for native Gemini system_instruction format
    let systemInst = undefined;
    if (typeof contents === 'object' && 'system_instruction' in contents) {
      systemInst = contents.system_instruction;
      coerced = true;
    }

    return {
      contents: parseResult.data,
      coerced,
      systemInstruction: systemInst,
    };
  }

  let coercedContents: GeminiFormat;

  // Handle native Gemini format with system_instruction
  if (
    typeof contents === 'object' &&
    contents !== null &&
    !Array.isArray(contents) &&
    'system_instruction' in contents
  ) {
    const systemInst = contents.system_instruction;

    if ('contents' in contents) {
      coercedContents = contents.contents;
    } else {
      // If contents field is not present, use an empty array
      coercedContents = [];
    }

    return {
      contents: coercedContents,
      coerced: true,
      systemInstruction: systemInst,
    };
  }

  if (typeof contents === 'string') {
    coercedContents = [
      {
        parts: [{ text: contents }],
      },
    ];
    coerced = true;
  } else if (
    Array.isArray(contents) &&
    contents.every((item) => typeof item.content === 'string')
  ) {
    // This looks like an OpenAI chat format
    const targetRole = options?.useAssistantRole ? 'assistant' : 'model';
    coercedContents = contents.map((item) => ({
      role: (item.role === 'assistant' ? targetRole : item.role) as 'user' | 'model' | undefined,
      parts: [{ text: item.content }],
    }));
    coerced = true;
  } else if (Array.isArray(contents) && contents.every((item) => item.role && item.content)) {
    // This looks like an OpenAI chat format with content that might be an array or object
    const targetRole = options?.useAssistantRole ? 'assistant' : 'model';
    coercedContents = contents.map((item) => {
      const mappedRole = (item.role === 'assistant' ? targetRole : item.role) as
        | 'user'
        | 'model'
        | undefined;
      if (Array.isArray(item.content)) {
        // Handle array content
        const parts = item.content.map((contentItem: any) => {
          if (typeof contentItem === 'string') {
            return { text: contentItem };
          } else if (contentItem.type === 'text') {
            return { text: contentItem.text };
          } else {
            // Handle other content types if needed
            return contentItem;
          }
        });
        return {
          role: mappedRole,
          parts,
        };
      } else if (typeof item.content === 'object') {
        // Handle object content
        return {
          role: mappedRole,
          parts: [item.content],
        };
      } else {
        // Handle string content
        return {
          role: mappedRole,
          parts: [{ text: item.content }],
        };
      }
    });
    coerced = true;
  } else if (typeof contents === 'object' && contents !== null && 'parts' in contents) {
    // This might be a single content object
    coercedContents = [contents as z.infer<typeof ContentSchema>];
    coerced = true;
  } else {
    logger.warn(`Unknown format for Gemini: ${JSON.stringify(contents)}`);
    // Ensure we always return an array, even for unknown formats
    // This prevents "contents.map is not a function" errors downstream
    // For arrays that don't match known formats, we still return them as-is
    // since they're already arrays and won't cause .map() errors
    const fallbackContents: GeminiFormat = Array.isArray(contents) ? contents : [];
    return { contents: fallbackContents, coerced: false, systemInstruction: undefined };
  }

  let systemPromptParts: { text: string }[] = [];
  coercedContents = coercedContents.filter((message) => {
    if (message.role === ('system' as any) && message.parts.length > 0) {
      systemPromptParts.push(
        ...message.parts.filter(
          (part): part is { text: string } => 'text' in part && typeof part.text === 'string',
        ),
      );
      return false;
    }
    return true;
  });

  // Convert system-only prompts to user messages
  // Gemini does not support execution with systemInstruction only
  if (coercedContents.length === 0 && systemPromptParts.length > 0) {
    coercedContents = [
      {
        role: 'user',
        parts: systemPromptParts,
      },
    ];
    coerced = true;
    systemPromptParts = [];
  }

  return {
    contents: coercedContents,
    coerced,
    systemInstruction:
      systemPromptParts.length > 0 ? { parts: systemPromptParts as [Part, ...Part[]] } : undefined,
  };
}

// Re-export auth functions from auth.ts for backward compatibility
// These were previously implemented here but are now centralized in auth.ts
export {
  clearCachedAuth,
  determineGoogleVertexMode,
  getGoogleApiKey,
  getGoogleClient,
  hasGoogleDefaultCredentials,
  loadCredentials,
  resolveProjectId,
} from './auth';

// Separate cached auth client for Generative Language API with specific scopes
let cachedGenerativeLanguageAuth: InstanceType<
  typeof import('google-auth-library').GoogleAuth
> | null = null;

/**
 * Gets an OAuth2 access token for Google APIs.
 * Used by providers that need to authenticate via OAuth2 instead of API keys.
 * @param credentials - Optional credentials JSON string or file:// path
 * @param scopes - Optional scopes to use. Defaults to cloud-platform + generative-language scopes
 * @returns The access token string, or undefined if authentication fails
 */
export async function getGoogleAccessToken(credentials?: string): Promise<string | undefined> {
  try {
    // Try with generative-language scopes first (required for Live API)
    if (!cachedGenerativeLanguageAuth) {
      let GoogleAuth;
      try {
        const importedModule = await import('google-auth-library');
        GoogleAuth = importedModule.GoogleAuth;
        cachedGenerativeLanguageAuth = new GoogleAuth({
          scopes: [
            'https://www.googleapis.com/auth/cloud-platform',
            'https://www.googleapis.com/auth/generative-language.retriever',
            'https://www.googleapis.com/auth/generative-language.tuning',
          ],
        });
      } catch {
        throw new Error(
          'The google-auth-library package is required as a peer dependency. Please install it in your project or globally.',
        );
      }
    }

    const processedCredentials = loadCredentials(credentials);

    let client;
    if (processedCredentials) {
      client = await cachedGenerativeLanguageAuth.fromJSON(JSON.parse(processedCredentials));
    } else {
      client = await cachedGenerativeLanguageAuth.getClient();
    }

    const tokenResponse = await client.getAccessToken();
    return tokenResponse.token || undefined;
  } catch (error) {
    logger.debug('[GoogleAuth] Could not get access token', {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

export function getCandidate(data: GeminiResponseData): Candidate {
  if (!data || !data.candidates || data.candidates.length < 1) {
    // Check if the prompt was blocked
    let errorDetails = 'No candidates returned in API response.';

    if (data?.promptFeedback?.blockReason) {
      errorDetails = `Response blocked: ${data.promptFeedback.blockReason}`;
      if (data.promptFeedback.safetyRatings) {
        const flaggedCategories = data.promptFeedback.safetyRatings
          .filter((rating) => rating.probability !== 'NEGLIGIBLE')
          .map((rating) => `${rating.category}: ${rating.probability}`);
        if (flaggedCategories.length > 0) {
          errorDetails += ` (Safety ratings: ${flaggedCategories.join(', ')})`;
        }
      }
    } else if (data?.promptFeedback?.safetyRatings) {
      const flaggedCategories = data.promptFeedback.safetyRatings
        .filter((rating) => rating.probability !== 'NEGLIGIBLE')
        .map((rating) => `${rating.category}: ${rating.probability}`);
      if (flaggedCategories.length > 0) {
        errorDetails = `Response may have been blocked due to safety filters: ${flaggedCategories.join(', ')}`;
      }
    }

    errorDetails += `\n\nGot response: ${JSON.stringify(data)}`;

    throw new Error(errorDetails);
  }
  if (data.candidates.length > 1) {
    logger.debug(
      `Expected one candidate in AI Studio API response, but got ${data.candidates.length}: ${JSON.stringify(data)}`,
    );
  }
  const candidate = data.candidates[0];
  if (!candidate) {
    throw new Error(
      `No candidates returned in API response.\n\nGot response: ${JSON.stringify(data)}`,
    );
  }
  return candidate;
}

export function isNonCandidateStreamChunk(datum: GeminiResponseData): boolean {
  return (
    !datum.candidates?.length &&
    ((Boolean(datum.usageMetadata) && !datum.promptFeedback) ||
      (Boolean(datum.promptFeedback?.safetyRatings) && !datum.promptFeedback?.blockReason))
  );
}

export function getLastPromptSafetyRatings(
  data: GeminiResponseData[],
): NonNullable<GeminiResponseData['promptFeedback']>['safetyRatings'] | undefined {
  let safetyRatings: NonNullable<GeminiResponseData['promptFeedback']>['safetyRatings'] | undefined;

  for (const datum of data) {
    if (datum.promptFeedback?.safetyRatings) {
      safetyRatings = datum.promptFeedback.safetyRatings;
    }
  }

  return safetyRatings;
}

export interface CollectedGroundingMetadata {
  groundingMetadata?: Record<string, any>;
  groundingChunks?: Record<string, any>[];
  groundingSupports?: Record<string, any>[];
  webSearchQueries?: string[];
}

// Aggregate grounding signals across every candidate-bearing chunk. Gemini's
// streaming contract distributes grounding state across chunks: groundingChunks
// only carries new references not in previous responses, groundingSupports
// indices span the whole stream, and webSearchQueries can arrive on a chunk
// distinct from the one that carries searchEntryPoint. Concatenating preserves
// the full citation graph; for the nested groundingMetadata object we keep
// last-wins for scalar/object fields (e.g. searchEntryPoint, retrievalMetadata)
// since those are typically refined as the stream progresses.
// https://ai.google.dev/api/generate-content#v1beta.Candidate
export function collectGroundingMetadata(data: GeminiResponseData[]): CollectedGroundingMetadata {
  const candidates = data.filter((d) => d.candidates?.length).map((d) => getCandidate(d));

  const flatChunks = candidates.flatMap((c) => c.groundingChunks ?? []);
  const flatSupports = candidates.flatMap((c) => c.groundingSupports ?? []);
  const flatQueries = candidates.flatMap((c) => c.webSearchQueries ?? []);

  const metas = candidates
    .map((c) => c.groundingMetadata)
    .filter((m): m is Record<string, any> => Boolean(m));

  let groundingMetadata: Record<string, any> | undefined;
  if (metas.length === 1) {
    groundingMetadata = metas[0];
  } else if (metas.length > 1) {
    const merged: Record<string, any> = {};
    // Last-wins for scalar/object fields like searchEntryPoint, retrievalMetadata.
    for (const m of metas) {
      for (const [key, value] of Object.entries(m)) {
        if (
          key === 'groundingChunks' ||
          key === 'groundingSupports' ||
          key === 'webSearchQueries'
        ) {
          continue;
        }
        if (value !== undefined) {
          merged[key] = value;
        }
      }
    }
    const innerChunks = metas.flatMap(
      (m) => (m.groundingChunks as Record<string, any>[] | undefined) ?? [],
    );
    const innerSupports = metas.flatMap(
      (m) => (m.groundingSupports as Record<string, any>[] | undefined) ?? [],
    );
    const innerQueries = metas.flatMap((m) => (m.webSearchQueries as string[] | undefined) ?? []);
    if (innerChunks.length) {
      merged.groundingChunks = innerChunks;
    }
    if (innerSupports.length) {
      merged.groundingSupports = innerSupports;
    }
    if (innerQueries.length) {
      merged.webSearchQueries = innerQueries;
    }
    groundingMetadata = merged;
  }

  return {
    ...(groundingMetadata && { groundingMetadata }),
    ...(flatChunks.length > 0 && { groundingChunks: flatChunks }),
    ...(flatSupports.length > 0 && { groundingSupports: flatSupports }),
    ...(flatQueries.length > 0 && { webSearchQueries: flatQueries }),
  };
}

export function formatCandidateContents(candidate: Candidate) {
  // Check if the candidate was blocked or stopped for safety reasons
  if (
    candidate.finishReason &&
    ['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'].includes(
      candidate.finishReason,
    )
  ) {
    let errorMessage = `Response was blocked with finish reason: ${candidate.finishReason}`;

    if (candidate.safetyRatings) {
      const flaggedCategories = candidate.safetyRatings
        .filter((rating) => rating.probability !== 'NEGLIGIBLE' || rating.blocked)
        .map(
          (rating) =>
            `${rating.category}: ${rating.probability}${rating.blocked ? ' (BLOCKED)' : ''}`,
        );
      if (flaggedCategories.length > 0) {
        errorMessage += `\nSafety ratings: ${flaggedCategories.join(', ')}`;
      }
    }

    if (candidate.finishReason === 'RECITATION') {
      errorMessage +=
        "\n\nThis typically occurs when the response is too similar to content from the model's training data.";
    } else if (candidate.finishReason === 'SAFETY') {
      errorMessage +=
        '\n\nThe response was blocked due to safety filters. Consider adjusting safety settings or modifying your prompt.';
    }

    throw new Error(errorMessage);
  }

  if (candidate.content?.parts) {
    let output = '';
    let is_text = true;
    for (const part of candidate.content.parts) {
      if ('text' in part) {
        output += part.text;
      } else {
        is_text = false;
      }
    }
    if (is_text) {
      return output;
    } else {
      return candidate.content.parts;
    }
  } else {
    throw new Error(`No output found in response: ${JSON.stringify(candidate)}`);
  }
}

export function mergeParts(parts1: Part[] | string | undefined, parts2: Part[] | string) {
  if (parts1 === undefined) {
    // Detach the accumulator from the raw multipart response before appending later chunks.
    return typeof parts2 === 'string' ? parts2 : [...parts2];
  }

  if (typeof parts1 === 'string' && typeof parts2 === 'string') {
    return parts1 + parts2;
  }

  const array1: Part[] = typeof parts1 === 'string' ? [{ text: parts1 }] : parts1;

  const array2: Part[] = typeof parts2 === 'string' ? [{ text: parts2 }] : parts2;

  array1.push(...array2);

  return array1;
}

export function normalizeGeminiAudio(output: Part[] | string | undefined) {
  if (!Array.isArray(output)) {
    return undefined;
  }

  const audioParts = output.filter((part) => part.inlineData?.mimeType?.startsWith('audio/'));
  if (audioParts.length === 0) {
    return undefined;
  }

  const mimeType = audioParts[0].inlineData!.mimeType;
  const audioData = Buffer.concat(
    audioParts.map((part) => Buffer.from(part.inlineData!.data, 'base64')),
  );
  if (!/^audio\/(?:L16|pcm)(?:;|$)/i.test(mimeType)) {
    return {
      data: audioData.toString('base64'),
      format: mimeType.split(/[;/]/)[1],
    };
  }

  const sampleRate = Number(mimeType.match(/(?:^|;)\s*rate=(\d+)/i)?.[1] ?? 24_000);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + audioData.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(audioData.length, 40);

  return {
    data: Buffer.concat([header, audioData]).toString('base64'),
    format: 'wav',
    sampleRate,
    channels: 1,
  };
}

/**
 * Normalizes and sanitizes tools configuration for Gemini API compatibility.
 * - Handles snake_case to camelCase conversion for backwards compatibility
 * - Sanitizes function declaration schemas to remove unsupported JSON Schema properties
 *   (e.g., additionalProperties, $schema, default) that Gemini doesn't support
 */
export function normalizeTools(tools: Tool[]): Tool[] {
  return tools.map((tool) => {
    const normalizedTool: Tool = { ...tool };

    // Use index access with type assertion to avoid TypeScript errors
    // Handle google_search -> googleSearch conversion
    if ((tool as any).google_search && !normalizedTool.googleSearch) {
      normalizedTool.googleSearch = (tool as any).google_search;
    }

    // Handle code_execution -> codeExecution conversion
    if ((tool as any).code_execution && !normalizedTool.codeExecution) {
      normalizedTool.codeExecution = (tool as any).code_execution;
    }

    // Handle google_search_retrieval -> googleSearchRetrieval conversion
    if ((tool as any).google_search_retrieval && !normalizedTool.googleSearchRetrieval) {
      normalizedTool.googleSearchRetrieval = (tool as any).google_search_retrieval;
    }

    // Sanitize function declarations to remove unsupported schema properties
    // This fixes issues like GitHub #6902 where additionalProperties causes API errors
    if (normalizedTool.functionDeclarations) {
      normalizedTool.functionDeclarations = normalizedTool.functionDeclarations.map((fd) => ({
        ...fd,
        parameters: fd.parameters ? (sanitizeSchemaForGemini(fd.parameters) as Schema) : undefined,
      }));
    }

    return normalizedTool;
  });
}

export function loadFile(
  config_var: Tool[] | string | undefined,
  context_vars: Record<string, VarValue> | undefined,
) {
  // Ensures that files are loaded correctly. Files may be defined in multiple ways:
  // 1. Directly in the provider:
  //    config_var will be the file path, which will be loaded here in maybeLoadFromExternalFile.
  // 2. In a test variable that is used in the provider via a nunjucks:
  //    context_vars will contain a string of the contents of the file with whitespace.
  //    This will be inserted into the nunjucks in contfig_tools and the output needs to be parsed.
  const fileContents = maybeLoadFromExternalFile(renderVarsInObject(config_var, context_vars));
  if (typeof fileContents === 'string') {
    try {
      const parsedContents = JSON.parse(fileContents);
      return Array.isArray(parsedContents) ? normalizeTools(parsedContents) : parsedContents;
    } catch (err) {
      logger.debug(`ERROR: failed to convert file contents to JSON:\n${JSON.stringify(err)}`);
      return fileContents;
    }
  }

  // If fileContents is already an array of tools, normalize them
  if (Array.isArray(fileContents)) {
    return normalizeTools(fileContents);
  }

  return fileContents;
}

function getMimeTypeFromMediaBytes(bytes: Buffer): string | undefined {
  const riffType = bytes.subarray(8, 12).toString('ascii');
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF') {
    if (riffType === 'WEBP') {
      return 'image/webp';
    } else if (riffType === 'WAVE') {
      return 'audio/wav';
    } else if (riffType === 'AVI ') {
      return 'video/avi';
    }
  } else if (
    bytes.subarray(0, 4).toString('ascii') === 'FORM' &&
    ['AIFF', 'AIFC'].includes(riffType)
  ) {
    return 'audio/aiff';
  } else if (bytes.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = bytes.subarray(8, 12).toString('ascii');
    return ['M4A ', 'M4B ', 'M4P ', 'F4A ', 'F4B '].includes(brand) ? 'audio/mp4' : 'video/mp4';
  } else if (bytes.subarray(0, 4).toString('hex') === '1a45dfa3') {
    return 'video/webm';
  } else if (bytes[0] === 0xff && (bytes[1] === 0xf1 || bytes[1] === 0xf9)) {
    return 'audio/aac';
  } else if (
    bytes.subarray(0, 3).toString('ascii') === 'ID3' ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  ) {
    return 'audio/mpeg';
  } else if (bytes.subarray(0, 4).toString('ascii') === 'fLaC') {
    return 'audio/flac';
  } else if (bytes.subarray(0, 4).toString('ascii') === 'OggS') {
    return 'audio/ogg';
  }

  return undefined;
}

function getMimeTypeFromBase64(data: string): string | undefined {
  const parsed = parseDataUrl(data);
  const base64Data = parsed ? parsed.base64Data : data;

  if (!base64Data || base64Data.length < 20 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64Data)) {
    return undefined;
  }

  if (
    parsed &&
    (/^(image|audio|video)\//.test(parsed.mimeType) || parsed.mimeType === 'application/pdf')
  ) {
    return parsed.mimeType;
  }

  if (base64Data.startsWith('/9j/')) {
    return 'image/jpeg';
  } else if (base64Data.startsWith('iVBORw0KGgo')) {
    return 'image/png';
  } else if (base64Data.startsWith('R0lGODlh') || base64Data.startsWith('R0lGODdh')) {
    return 'image/gif';
  } else if (base64Data.startsWith('Qk0') || base64Data.startsWith('Qk1')) {
    return 'image/bmp';
  } else if (base64Data.startsWith('SUkq') || base64Data.startsWith('TU0A')) {
    return 'image/tiff';
  } else if (base64Data.startsWith('AAABAA')) {
    return 'image/x-icon';
  } else if (base64Data.startsWith('JVBER')) {
    return 'application/pdf';
  }

  return getMimeTypeFromMediaBytes(Buffer.from(base64Data, 'base64'));
}

function processImagesInContents(
  contents: GeminiFormat,
  contextVars?: Record<string, VarValue>,
): GeminiFormat {
  if (!contextVars) {
    return contents;
  }

  // Guard: ensure contents is an array
  if (!Array.isArray(contents)) {
    logger.warn('[Google] contents is not an array in processImagesInContents', {
      contentsType: typeof contents,
      contentsValue: contents,
    });
    // Return empty array as fallback to prevent .map() error
    return [];
  }

  const base64ToMimeType = new Map<string, string>();

  for (const value of Object.values(contextVars)) {
    if (typeof value === 'string') {
      const mimeType = getMimeTypeFromBase64(value);
      if (mimeType) {
        base64ToMimeType.set(value, mimeType);
      }
    }
  }

  return contents.map((content) => {
    if (content.parts) {
      const newParts: Part[] = [];

      for (const part of content.parts) {
        if (part.text) {
          const lines = part.text.split('\n');
          let foundValidMedia = false;
          let currentTextBlock = '';
          const processedParts: Part[] = [];

          // First pass: check if any line is valid base64 media from context variables
          for (const line of lines) {
            const trimmedLine = line.trim();

            const mimeType = base64ToMimeType.get(trimmedLine);
            if (mimeType) {
              foundValidMedia = true;

              // Add any accumulated text as a text part
              if (currentTextBlock.length > 0) {
                processedParts.push({
                  text: currentTextBlock,
                });
                currentTextBlock = '';
              }

              // Extract raw base64 data (Google expects raw base64, not data URLs)
              const base64Data = isDataUrl(trimmedLine)
                ? extractBase64FromDataUrl(trimmedLine)
                : trimmedLine;
              processedParts.push({
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              });
            } else {
              // Accumulate text, preserving original formatting including newlines
              if (currentTextBlock.length > 0) {
                currentTextBlock += '\n';
              }
              currentTextBlock += line;
            }
          }

          // Add any remaining text block
          if (currentTextBlock.length > 0) {
            processedParts.push({
              text: currentTextBlock,
            });
          }

          // If we found valid media, use the processed parts; otherwise, keep the original part
          if (foundValidMedia) {
            newParts.push(...processedParts);
          } else {
            newParts.push(part);
          }
        } else {
          // Keep non-text parts as is
          newParts.push(part);
        }
      }

      return {
        ...content,
        parts: newParts,
      };
    }
    return content;
  });
}

/**
 * Parses and processes config-level systemInstruction.
 * Handles file loading, string-to-Content conversion, and Nunjucks template rendering.
 *
 * @param configSystemInstruction - The systemInstruction from config (can be string, Content, or undefined)
 * @param contextVars - Variables for Nunjucks template rendering
 * @returns Processed Content object or undefined
 */
export function parseConfigSystemInstruction(
  configSystemInstruction: Content | string | undefined,
  contextVars?: Record<string, VarValue>,
): Content | undefined {
  if (!configSystemInstruction) {
    return undefined;
  }

  // Make a copy to avoid mutating the original
  let configInstruction = clone(configSystemInstruction);

  // Load systemInstruction from file if it's a file path
  if (typeof configSystemInstruction === 'string') {
    configInstruction = loadFile(configSystemInstruction, contextVars);
  }

  // Convert string to Content structure
  if (typeof configInstruction === 'string') {
    configInstruction = { parts: [{ text: configInstruction }] };
  }

  // Render Nunjucks templates in all text parts
  if (contextVars && configInstruction) {
    const nunjucks = getNunjucksEngine();
    for (const part of configInstruction.parts) {
      if (part.text) {
        try {
          part.text = nunjucks.renderString(part.text, contextVars);
        } catch (err) {
          throw new Error(`Unable to render nunjucks in systemInstruction: ${err}`);
        }
      }
    }
  }

  return configInstruction;
}

export function geminiFormatAndSystemInstructions(
  prompt: string,
  contextVars?: Record<string, VarValue>,
  configSystemInstruction?: Content | string,
  options?: { useAssistantRole?: boolean },
): {
  contents: GeminiFormat;
  systemInstruction: Content | { parts: [Part, ...Part[]] } | undefined;
} {
  let contents: GeminiFormat = parseChatPrompt(prompt, [
    {
      parts: [
        {
          text: prompt,
        },
      ],
      role: 'user',
    },
  ]);
  const {
    contents: updatedContents,
    coerced,
    systemInstruction: parsedSystemInstruction,
  } = maybeCoerceToGeminiFormat(contents, options);
  if (coerced) {
    logger.debug(`Coerced JSON prompt to Gemini format: ${JSON.stringify(contents)}`);
    contents = updatedContents;
  }

  let systemInstruction: Content | undefined = parsedSystemInstruction;

  const parsedConfigInstruction = parseConfigSystemInstruction(
    configSystemInstruction,
    contextVars,
  );
  if (parsedConfigInstruction) {
    systemInstruction = systemInstruction
      ? { parts: [...parsedConfigInstruction.parts, ...systemInstruction.parts] }
      : parsedConfigInstruction;
  }

  // Process images in contents
  contents = processImagesInContents(contents, contextVars);

  return { contents, systemInstruction };
}

/**
 * Recursively traverses a JSON schema object and converts
 * uppercase type keywords (string values) to lowercase.
 * Handles nested objects and arrays within the schema.
 * Creates a deep copy to avoid modifying the original schema.
 *
 * @param {object | any} schemaNode - The current node (object or value) being processed.
 * @returns {object | any} - The processed node with type keywords lowercased.
 */
function normalizeSchemaTypes(schemaNode: any): any {
  // Handle non-objects (including null) and arrays directly by iterating/returning
  if (typeof schemaNode !== 'object' || schemaNode === null) {
    return schemaNode;
  }

  if (Array.isArray(schemaNode)) {
    return schemaNode.map(normalizeSchemaTypes); // Recurse for array elements
  }

  // Create a new object to avoid modifying the original
  const newNode: { [key: string]: any } = {};

  for (const key in schemaNode) {
    if (Object.prototype.hasOwnProperty.call(schemaNode, key)) {
      const value = schemaNode[key];

      if (key === 'type') {
        if (
          typeof value === 'string' &&
          (VALID_SCHEMA_TYPES as ReadonlyArray<string>).includes(value)
        ) {
          // Convert type value(s) to lowercase
          newNode[key] = value.toLowerCase();
        } else if (Array.isArray(value)) {
          // Handle type arrays like ["STRING", "NULL"]
          newNode[key] = value.map((t) =>
            typeof t === 'string' && (VALID_SCHEMA_TYPES as ReadonlyArray<string>).includes(t)
              ? t.toLowerCase()
              : t,
          );
        } else {
          // Handle type used as function field rather than a schema type definition
          newNode[key] = normalizeSchemaTypes(value);
        }
      } else {
        // Recursively process nested objects/arrays
        newNode[key] = normalizeSchemaTypes(value);
      }
    }
  }

  return newNode;
}

export function parseStringObject(input: string | any) {
  if (typeof input === 'string') {
    return JSON.parse(input);
  }
  return input;
}

export function validateFunctionCall(
  output: string | object,
  functions?: Tool[] | string,
  vars?: Record<string, VarValue>,
) {
  let functionCalls: FunctionCall[];
  try {
    let parsedOutput: object | Content = parseStringObject(output);
    if ('toolCall' in parsedOutput) {
      // Live Format
      parsedOutput = (parsedOutput as { toolCall: any }).toolCall;
      functionCalls = (parsedOutput as { functionCalls: any }).functionCalls;
    } else if (Array.isArray(parsedOutput)) {
      // Vertex and AIS Format
      functionCalls = parsedOutput
        .filter((obj) => Object.prototype.hasOwnProperty.call(obj, 'functionCall'))
        .map((obj) => obj.functionCall);
    } else {
      throw new Error('Unrecognized function call format');
    }
  } catch {
    throw new Error(
      `Google did not return a valid-looking function call: ${JSON.stringify(output)}`,
    );
  }

  const interpolatedFunctions = loadFile(functions, vars) as Tool[];

  for (const functionCall of functionCalls) {
    // Parse function call and validate it against schema
    const functionName = functionCall.name;
    const functionArgs = parseStringObject(functionCall.args);
    const functionDeclarations = interpolatedFunctions?.find((f) => 'functionDeclarations' in f);
    const functionSchema = functionDeclarations?.functionDeclarations?.find(
      (f) => f.name === functionName,
    );
    if (!functionSchema) {
      throw new Error(`Called "${functionName}", but there is no function with that name`);
    }
    if (Object.keys(functionArgs).length !== 0 && functionSchema?.parameters) {
      const parameterSchema = normalizeSchemaTypes(functionSchema.parameters);
      let validate;
      try {
        validate = ajv.compile(parameterSchema as AnySchema);
      } catch (err) {
        throw new Error(
          `Tool schema doesn't compile with ajv: ${err}. If this is a valid tool schema you may need to reformulate your assertion without is-valid-function-call.`,
        );
      }
      if (!validate(functionArgs)) {
        throw new Error(
          `Call to "${functionName}":\n${JSON.stringify(functionCall)}\ndoes not match schema:\n${JSON.stringify(validate.errors)}`,
        );
      }
    } else if (!(JSON.stringify(functionArgs) === '{}' && !functionSchema?.parameters)) {
      throw new Error(
        `Call to "${functionName}":\n${JSON.stringify(functionCall)}\ndoes not match schema:\n${JSON.stringify(functionSchema)}`,
      );
    }
  }
}

/**
 * Properties supported by Gemini's function calling API.
 * Based on Google's Schema type definition and API documentation.
 * @see https://ai.google.dev/api/caching#Schema
 */
const GEMINI_SUPPORTED_SCHEMA_PROPERTIES = new Set([
  'type',
  'format',
  'description',
  'nullable',
  'enum',
  'maxItems',
  'minItems',
  'properties',
  'required',
  'propertyOrdering',
  'items',
]);

/**
 * Valid JSON Schema types mapped to Gemini's expected format (uppercase).
 */
const JSON_SCHEMA_TYPE_MAP: Record<string, string> = {
  string: 'STRING',
  number: 'NUMBER',
  integer: 'INTEGER',
  boolean: 'BOOLEAN',
  array: 'ARRAY',
  object: 'OBJECT',
  null: 'STRING', // Gemini doesn't support null type, fall back to STRING
};

/**
 * Recursively sanitizes a JSON Schema for Gemini API compatibility.
 *
 * - Removes unsupported properties (additionalProperties, $schema, default, title, etc.)
 * - Converts type values to uppercase (string → STRING, object → OBJECT)
 * - Recursively processes nested schemas in 'properties' and 'items'
 *
 * @param schema - The JSON Schema object to sanitize
 * @returns A sanitized schema compatible with Gemini's function calling API
 */
export function sanitizeSchemaForGemini(schema: Record<string, any>): Record<string, any> {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(schema)) {
    // Skip properties not supported by Gemini
    if (!GEMINI_SUPPORTED_SCHEMA_PROPERTIES.has(key)) {
      continue;
    }

    if (key === 'type') {
      // Convert type to uppercase for Gemini
      if (typeof value === 'string') {
        const lowerType = value.toLowerCase();
        result[key] = JSON_SCHEMA_TYPE_MAP[lowerType] || value.toUpperCase();
      } else {
        result[key] = value;
      }
    } else if (key === 'properties' && typeof value === 'object' && value !== null) {
      // Recursively sanitize each property schema
      result[key] = {};
      for (const [propName, propSchema] of Object.entries(value)) {
        if (typeof propSchema === 'object' && propSchema !== null) {
          result[key][propName] = sanitizeSchemaForGemini(propSchema as Record<string, any>);
        } else {
          result[key][propName] = propSchema;
        }
      }
    } else if (key === 'items' && typeof value === 'object' && value !== null) {
      // Recursively sanitize array item schema
      result[key] = sanitizeSchemaForGemini(value as Record<string, any>);
    } else {
      // Pass through allowed primitive values (enum, required, maxItems, etc.)
      result[key] = value;
    }
  }

  return result;
}

/**
 * Create a cache discriminator from auth headers.
 *
 * This is used to ensure different API keys/credentials don't share cached responses.
 * The discriminator is included as a custom property in fetchWithCache options,
 * which gets included in the cache key automatically.
 *
 * Security note: We hash auth headers rather than using them directly to avoid
 * exposing sensitive credentials in cache keys or logs. The hash is truncated
 * to 16 hex characters (64 bits) for brevity - collision probability is acceptably
 * low for cache key differentiation (birthday problem: ~4 billion entries needed
 * for 50% collision probability).
 *
 * @param headers - Request headers containing auth info
 * @returns A short hash string for cache key differentiation
 */
export function createAuthCacheDiscriminator(headers: Record<string, string>): string {
  // Extract auth-related header values
  const authValues: string[] = [];

  const authHeaderNames = [
    'authorization',
    'x-goog-api-key',
    'x-api-key',
    'api-key',
    'x-goog-user-project',
  ];

  for (const name of authHeaderNames) {
    const value = headers[name] || headers[name.toLowerCase()];
    if (value) {
      authValues.push(`${name}:${value}`);
    }
  }

  if (authValues.length === 0) {
    return '';
  }

  // Create a short hash for cache key (16 hex chars = 64 bits, sufficient for cache differentiation)
  return crypto.createHash('sha256').update(authValues.join('|')).digest('hex').substring(0, 16);
}
