import {
  formatCandidateContents,
  geminiFormatAndSystemInstructions,
  getCandidate,
  isNonCandidateStreamChunk,
  mergeGoogleCompletionOptions,
  mergeGoogleRequestTools,
  mergeParts,
  normalizeGoogleServiceTier,
  removeGoogleFunctionDeclarations,
  resolveGoogleToolConfig,
} from './util';

import type { CallApiContextParams, ProviderResponse, TokenUsage } from '../../types/index';
import type { GoogleProviderConfig, Tool } from './types';
import type { GeminiApiResponse, GeminiResponseData } from './util';

type GeminiFacade = 'ai-studio' | 'vertex';

/** Resolve the common inputs before each provider builds its transport-specific request. */
export async function prepareGeminiRequest(
  providerConfig: GoogleProviderConfig,
  prompt: string,
  context: CallApiContextParams | undefined,
  getTools: (options: { skipExecutableToolFiles: boolean }) => Promise<Tool[]>,
) {
  const promptConfig = context?.prompt?.config as Partial<GoogleProviderConfig> | undefined;
  const config = mergeGoogleCompletionOptions(providerConfig, promptConfig);
  const promptBasePath = promptConfig?.basePath ?? providerConfig.basePath;

  const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
    prompt,
    context?.vars,
    config.systemInstruction,
    {
      basePath:
        promptConfig?.systemInstruction === undefined ? providerConfig.basePath : promptBasePath,
      useAssistantRole: config.useAssistantRole,
    },
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
    // resolveGoogleToolConfig already folds these in; keeping them in the raw spread would
    // let a conflicting passthrough mode overwrite a resolved NONE, so the request would
    // carry mode ANY with the declarations already stripped.
    toolConfig: _passthroughToolConfig,
    tool_config: _passthroughToolConfigSnakeCase,
    ...passthrough
  } = config.passthrough || {};
  const serviceTier = normalizeGoogleServiceTier(
    passthroughServiceTier ?? camelCasePassthroughServiceTier ?? config.service_tier,
  );
  const requestPassthroughTools =
    toolsDisabled && passthroughTools !== undefined
      ? removeGoogleFunctionDeclarations(passthroughTools)
      : passthroughTools;
  const mergedTools = mergeGoogleRequestTools(requestTools, requestPassthroughTools);

  return {
    config,
    promptConfig,
    promptBasePath,
    contents,
    systemInstruction,
    toolConfig,
    toolsDisabled,
    passthrough,
    serviceTier,
    mergedTools,
  };
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
