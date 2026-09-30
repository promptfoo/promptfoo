import { maybeLoadFromExternalFile } from '../../util/file';
import { renderVarsInObject } from '../../util/index';
import {
  formatCandidateContents,
  geminiFormatAndSystemInstructions,
  getCandidate,
  isNonCandidateStreamChunk,
  mergeGoogleCompletionOptions,
  mergeGoogleRequestTools,
  mergeParts,
  normalizeGoogleServiceTier,
  normalizeSafetySettings,
  removeDeprecatedGeminiGenerationParams,
  removeGoogleFunctionDeclarations,
  resolveGoogleToolConfig,
} from './util';

import type { CallApiContextParams, ProviderResponse, TokenUsage } from '../../types/index';
import type { CompletionOptions, Tool } from './types';
import type { GeminiApiResponse, GeminiResponseData } from './util';

type GeminiFacade = 'ai-studio' | 'vertex';

/** Build Gemini requests while preserving each provider's wire format. */
export async function prepareGeminiRequest(
  modelName: string,
  providerConfig: CompletionOptions,
  prompt: string,
  context: CallApiContextParams | undefined,
  facade: GeminiFacade,
  getTools: (options: { skipExecutableToolFiles: boolean }) => Promise<Tool[]>,
) {
  const config = mergeGoogleCompletionOptions(
    providerConfig,
    context?.prompt?.config as Partial<CompletionOptions> | undefined,
  );

  const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
    prompt,
    context?.vars,
    config.systemInstruction,
    { useAssistantRole: config.useAssistantRole },
  );

  const { toolConfig, toolsDisabled } = resolveGoogleToolConfig(config);
  const allTools = await getTools({
    skipExecutableToolFiles: toolsDisabled,
  });
  const requestTools = toolsDisabled ? removeGoogleFunctionDeclarations(allTools) : allTools;
  const {
    service_tier: passthroughServiceTier,
    serviceTier: camelCasePassthroughServiceTier,
    tools: passthroughTools,
    toolConfig: _passthroughToolConfig,
    tool_config: _passthroughToolConfigSnakeCase,
    ...passthrough
  } = config.passthrough || {};
  const vertexMode = facade === 'vertex';
  const serviceTier = normalizeGoogleServiceTier(
    passthroughServiceTier ?? camelCasePassthroughServiceTier ?? config.service_tier,
    vertexMode,
  );
  const serviceTierField = vertexMode ? 'serviceTier' : 'service_tier';
  const requestPassthroughTools =
    toolsDisabled && passthroughTools !== undefined
      ? removeGoogleFunctionDeclarations(passthroughTools)
      : passthroughTools;

  const mergedTools = mergeGoogleRequestTools(requestTools, requestPassthroughTools);

  const body: Record<string, any> = {
    contents,
    generationConfig: {
      ...(facade === 'vertex'
        ? {
            context: config.context,
            examples: config.examples,
            stopSequences: config.stopSequences,
            temperature: config.temperature,
            maxOutputTokens: config.maxOutputTokens,
            topP: config.topP,
            topK: config.topK,
          }
        : {
            ...(config.temperature !== undefined && { temperature: config.temperature }),
            ...(config.topP !== undefined && { topP: config.topP }),
            ...(config.topK !== undefined && { topK: config.topK }),
            ...(config.stopSequences !== undefined && { stopSequences: config.stopSequences }),
            ...(config.maxOutputTokens !== undefined && {
              maxOutputTokens: config.maxOutputTokens,
            }),
          }),
      ...config.generationConfig,
      ...(modelName.includes('-tts') && {
        response_modalities: undefined,
        responseModalities: config.generationConfig?.responseModalities ??
          config.generationConfig?.response_modalities?.map((modality) =>
            modality.toUpperCase(),
          ) ?? ['AUDIO'],
        speechConfig: config.generationConfig?.speechConfig ?? {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
      }),
    },
    ...(facade === 'vertex'
      ? config.safetySettings !== undefined && {
          safetySettings: normalizeSafetySettings(config.safetySettings),
        }
      : { safetySettings: normalizeSafetySettings(config.safetySettings) }),
    ...(toolConfig ? { toolConfig } : {}),
    ...(mergedTools ? { tools: mergedTools } : {}),
    ...(systemInstruction
      ? { [vertexMode ? 'systemInstruction' : 'system_instruction']: systemInstruction }
      : {}),
    ...(serviceTier ? { [serviceTierField]: serviceTier } : {}),
    ...passthrough,
    ...(facade === 'vertex' &&
      config.modelArmor &&
      (config.modelArmor.promptTemplate || config.modelArmor.responseTemplate) && {
        model_armor_config: {
          ...(config.modelArmor.promptTemplate && {
            prompt_template_name: config.modelArmor.promptTemplate,
          }),
          ...(config.modelArmor.responseTemplate && {
            response_template_name: config.modelArmor.responseTemplate,
          }),
        },
      }),
  };
  body.generationConfig = removeDeprecatedGeminiGenerationParams(modelName, body.generationConfig);

  applyResponseSchema(body, config, context, facade);
  return { body, config, toolsDisabled };
}

type GeminiContent =
  | { kind: 'response'; response: ProviderResponse }
  | {
      kind: 'content';
      output: NonNullable<ReturnType<typeof formatCandidateContents>>;
      candidate: ReturnType<typeof getCandidate>;
      data: GeminiResponseData[];
      lastData: GeminiResponseData;
    };

/** Parse single and streamed responses once; callers retain their public response shape. */
export function parseGeminiContent(
  data: GeminiApiResponse | GeminiApiResponse[number],
  facade: GeminiFacade,
  safetyAsOutput = false,
): GeminiContent {
  const chunks = (Array.isArray(data) ? data : [data]) as GeminiResponseData[];
  const lastData = chunks[chunks.length - 1];
  const respond = (response: ProviderResponse): GeminiContent => ({ kind: 'response', response });
  if (!lastData) {
    return respond({
      error: `${facade === 'vertex' ? 'No output found' : 'No response data found'} in response: ${JSON.stringify(data)}`,
    });
  }
  if (facade !== 'ai-studio') {
    const first = Array.isArray(data) ? data[0] : data;
    const error = first && 'error' in first ? first.error : undefined;
    if (error) {
      return respond({ error: `Error ${error.code}: ${error.message}` });
    }
  }
  let output: ReturnType<typeof formatCandidateContents> | undefined;
  let candidate: ReturnType<typeof getCandidate> | undefined;
  for (const datum of chunks) {
    const promptBlock = facade === 'ai-studio' ? undefined : getPromptBlockResponse(datum);
    if (promptBlock) {
      return respond(promptBlock);
    }
    // Usage and prompt-safety frames do not replace the last meaningful candidate.
    if (Array.isArray(data) && isNonCandidateStreamChunk(datum)) {
      continue;
    }
    const current = getCandidate(datum);
    const failure =
      facade === 'vertex' ? getCandidateFailure(datum, current, data, safetyAsOutput) : undefined;
    if (failure) {
      return respond(failure);
    }
    if (!current.content?.parts && ['STOP', 'MAX_TOKENS'].includes(current.finishReason ?? '')) {
      candidate = {
        ...current,
        content: candidate?.content ?? current.content,
        safetyRatings: current.safetyRatings ?? candidate?.safetyRatings,
      };
      continue;
    }
    if (facade === 'vertex' && !current.content?.parts) {
      return respond({ error: `No output found in response: ${JSON.stringify(data)}` });
    }
    candidate = current;
    output = mergeParts(output, formatCandidateContents(current));
  }
  if (output === undefined || output === '' || candidate === undefined) {
    const error = `No output found in response: ${JSON.stringify(data)}`;
    if (facade === 'ai-studio') {
      throw new Error(error);
    }
    return respond({ error });
  }
  return { kind: 'content', output, candidate, data: chunks, lastData };
}

function getBlockedTokenUsage(datum: GeminiResponseData): TokenUsage {
  return {
    total: datum.usageMetadata?.totalTokenCount || 0,
    prompt: datum.usageMetadata?.promptTokenCount || 0,
    completion: datum.usageMetadata?.candidatesTokenCount || 0,
  };
}

/** Preserve each provider's token accounting, including missing counts. */
export function getGeminiTokenUsage(
  usage: GeminiResponseData['usageMetadata'],
  cached: boolean,
  facade: GeminiFacade,
): TokenUsage {
  const reasoning =
    usage?.thoughtsTokenCount === undefined
      ? {}
      : {
          completionDetails: {
            reasoning: usage.thoughtsTokenCount,
            acceptedPrediction: 0,
            rejectedPrediction: 0,
          },
        };
  if (cached) {
    return {
      cached: usage?.totalTokenCount,
      total: usage?.totalTokenCount,
      numRequests: 1,
      ...reasoning,
    };
  }
  const legacyVertex = facade === 'vertex';
  return {
    prompt:
      usage?.promptTokenCount === undefined && !legacyVertex
        ? undefined
        : (usage?.promptTokenCount || 0) + (usage?.toolUsePromptTokenCount ?? 0),
    completion: legacyVertex ? usage?.candidatesTokenCount || 0 : usage?.candidatesTokenCount,
    total: legacyVertex ? usage?.totalTokenCount || 0 : usage?.totalTokenCount,
    ...(!legacyVertex && { numRequests: 1 }),
    ...(usage?.cachedContentTokenCount !== undefined && { cached: usage.cachedContentTokenCount }),
    ...reasoning,
  };
}

function getPromptBlockResponse(datum: GeminiResponseData): ProviderResponse | undefined {
  if (!datum.promptFeedback?.blockReason) {
    return undefined;
  }
  const { blockReason, blockReasonMessage } = datum.promptFeedback;
  const isModelArmor = blockReason === 'MODEL_ARMOR';
  const message =
    blockReasonMessage ||
    `Content was blocked due to ${isModelArmor ? 'Model Armor' : 'safety settings'}: ${blockReason}`;
  return {
    output: message,
    tokenUsage: getBlockedTokenUsage(datum),
    guardrails: { flagged: true, flaggedInput: true, flaggedOutput: false, reason: message },
    metadata: {
      modelArmor: isModelArmor
        ? { blockReason, ...(blockReasonMessage && { blockReasonMessage }) }
        : undefined,
    },
  };
}

function getCandidateFailure(
  datum: GeminiResponseData,
  current: ReturnType<typeof getCandidate>,
  data: GeminiApiResponse | GeminiApiResponse[number],
  safetyAsOutput: boolean,
): ProviderResponse | undefined {
  const safetyReasons = [
    'SAFETY',
    'PROHIBITED_CONTENT',
    'RECITATION',
    'BLOCKLIST',
    'SPII',
    'IMAGE_SAFETY',
  ];
  if (current.finishReason && safetyReasons.includes(current.finishReason)) {
    const message = `Content was blocked due to safety settings with finish reason: ${current.finishReason}.`;
    const guardrails = {
      flagged: true,
      flaggedInput: false,
      flaggedOutput: true,
      reason: message,
    };
    return safetyAsOutput
      ? { output: message, tokenUsage: getBlockedTokenUsage(datum), guardrails }
      : { error: message, guardrails };
  }
  if (
    current.finishReason &&
    current.finishReason !== 'STOP' &&
    current.finishReason !== 'MAX_TOKENS'
  ) {
    return { error: `Finish reason ${current.finishReason}: ${JSON.stringify(data)}` };
  }
  return undefined;
}

function applyResponseSchema(
  body: Record<string, any>,
  config: CompletionOptions,
  context: CallApiContextParams | undefined,
  facade: GeminiFacade,
): void {
  if (config.responseSchema) {
    if (body.generationConfig.response_schema) {
      throw new Error(
        '`responseSchema` provided but `generationConfig.response_schema` already set.',
      );
    }

    let schema = maybeLoadFromExternalFile(
      renderVarsInObject(config.responseSchema, context?.vars),
    );

    // Vertex parses JSON strings and renders variables inside loaded schemas.
    // AI Studio passes loaded schemas through.
    if (facade !== 'ai-studio') {
      if (typeof schema === 'string') {
        try {
          schema = JSON.parse(schema);
        } catch (error) {
          throw new Error(`Invalid JSON in responseSchema: ${error}`);
        }
      }
      schema = renderVarsInObject(schema, context?.vars);
    }
    body.generationConfig.response_schema = schema;
    body.generationConfig.response_mime_type = 'application/json';
  }
}
