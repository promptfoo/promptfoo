import OpenAI from 'openai';
import {
  FunctionToolCallValidationSetupError,
  type TokenUsage,
  type VarValue,
} from '../../types/index';
import { maybeLoadFromExternalFileWithVars } from '../../util/index';
import { createAjv, safeJsonStringify } from '../../util/json';
import { calculateCost } from '../shared';

import type { ProviderConfig } from '../shared';

const GPT_5_LONG_CONTEXT_THRESHOLD = 272_000;

type OpenAIModelCost = {
  input: number;
  output: number;
  audioInput?: number;
  audioOutput?: number;
  longContext?: {
    threshold: number;
    input: number;
    output: number;
  };
};

type OpenAIModelInfo = {
  id: string;
  type?: string;
  cost?: OpenAIModelCost;
};

// see https://platform.openai.com/docs/models
export const OPENAI_CHAT_MODELS: OpenAIModelInfo[] = [
  // TTS model (text input + audio output costs)
  ...['gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'].map((model) => ({
    id: model,
    cost: {
      input: 0.6 / 1e6,
      output: 0 / 1e6,
      audioOutput: 12 / 1e6,
    },
  })),
  // Search preview models
  ...['gpt-4o-search-preview', 'gpt-4o-search-preview-2025-03-11'].map((model) => ({
    id: model,
    cost: {
      input: 2.5 / 1e6,
      output: 10 / 1e6,
    },
  })),
  ...['gpt-4o-mini-search-preview', 'gpt-4o-mini-search-preview-2025-03-11'].map((model) => ({
    id: model,
    cost: {
      input: 0.15 / 1e6,
      output: 0.6 / 1e6,
    },
  })),
  // Computer use models
  ...['computer-use-preview', 'computer-use-preview-2025-03-11'].map((model) => ({
    id: model,
    cost: {
      input: 3 / 1e6,
      output: 12 / 1e6,
    },
  })),
  ...['chatgpt-4o-latest'].map((model) => ({
    id: model,
    cost: {
      input: 5 / 1e6,
      output: 15 / 1e6,
    },
  })),
  ...['gpt-4.1', 'gpt-4.1-2025-04-14'].map((model) => ({
    id: model,
    cost: {
      input: 2 / 1e6,
      output: 8 / 1e6,
    },
  })),
  ...['gpt-4.1-mini', 'gpt-4.1-mini-2025-04-14'].map((model) => ({
    id: model,
    cost: {
      input: 0.4 / 1e6,
      output: 1.6 / 1e6,
    },
  })),
  ...['gpt-4.1-nano', 'gpt-4.1-nano-2025-04-14'].map((model) => ({
    id: model,
    cost: {
      input: 0.1 / 1e6,
      output: 0.4 / 1e6,
    },
  })),
  // GPT-4.5 models deprecated as of 2025-07-14, removed from API
  ...['o1-pro', 'o1-pro-2025-03-19'].map((model) => ({
    id: model,
    cost: {
      input: 150 / 1e6,
      output: 600 / 1e6,
    },
  })),
  ...['o1', 'o1-2024-12-17', 'o1-preview', 'o1-preview-2024-09-12'].map((model) => ({
    id: model,
    cost: {
      input: 15 / 1e6,
      output: 60 / 1e6,
    },
  })),
  // o1-mini pricing per Standard tier
  ...['o1-mini', 'o1-mini-2024-09-12'].map((model) => ({
    id: model,
    cost: {
      input: 1.1 / 1e6,
      output: 4.4 / 1e6,
    },
  })),
  ...['o3', 'o3-2025-04-16'].map((model) => ({
    id: model,
    cost: {
      input: 2 / 1e6,
      output: 8 / 1e6,
    },
  })),
  ...['o3-pro', 'o3-pro-2025-06-10'].map((model) => ({
    id: model,
    cost: {
      input: 20 / 1e6,
      output: 80 / 1e6,
    },
  })),
  ...['o3-mini', 'o3-mini-2025-01-31'].map((model) => ({
    id: model,
    cost: {
      input: 1.1 / 1e6,
      output: 4.4 / 1e6,
    },
  })),
  ...['gpt-4o', 'gpt-4o-2024-11-20', 'gpt-4o-2024-08-06'].map((model) => ({
    id: model,
    cost: {
      input: 2.5 / 1e6,
      output: 10 / 1e6,
    },
  })),
  ...['gpt-4o-2024-05-13'].map((model) => ({
    id: model,
    cost: {
      input: 5 / 1e6,
      output: 15 / 1e6,
    },
  })),
  ...['gpt-4o-mini', 'gpt-4o-mini-2024-07-18'].map((model) => ({
    id: model,
    cost: {
      input: 0.15 / 1e6,
      output: 0.6 / 1e6,
    },
  })),
  ...['gpt-4', 'gpt-4-0613', 'gpt-4-0314'].map((model) => ({
    id: model,
    cost: {
      input: 30 / 1e6,
      output: 60 / 1e6,
    },
  })),
  ...['gpt-4-32k', 'gpt-4-32k-0314', 'gpt-4-32k-0613'].map((model) => ({
    id: model,
    cost: {
      input: 60 / 1e6,
      output: 120 / 1e6,
    },
  })),
  ...[
    'gpt-4-turbo',
    'gpt-4-turbo-2024-04-09',
    'gpt-4-turbo-preview',
    'gpt-4-0125-preview',
    'gpt-4-1106-preview',
    'gpt-4-1106-vision-preview',
    'gpt-4-vision-preview',
  ].map((model) => ({
    id: model,
    cost: {
      input: 10 / 1e6,
      output: 30 / 1e6,
    },
  })),
  {
    id: 'gpt-3.5-turbo',
    cost: {
      input: 0.5 / 1e6,
      output: 1.5 / 1e6,
    },
  },
  {
    id: 'gpt-3.5-turbo-0125',
    cost: {
      input: 0.5 / 1e6,
      output: 1.5 / 1e6,
    },
  },
  {
    id: 'gpt-3.5-turbo-1106',
    cost: {
      input: 1 / 1e6,
      output: 2 / 1e6,
    },
  },
  ...['gpt-3.5-turbo-0301', 'gpt-3.5-turbo-0613'].map((model) => ({
    id: model,
    cost: {
      input: 1.5 / 1e6,
      output: 2 / 1e6,
    },
  })),
  ...['gpt-3.5-turbo-16k', 'gpt-3.5-turbo-16k-0613'].map((model) => ({
    id: model,
    cost: {
      input: 3 / 1e6,
      output: 4 / 1e6,
    },
  })),
  ...['gpt-3.5-turbo-instruct'].map((model) => ({
    id: model,
    cost: {
      input: 1.5 / 1e6,
      output: 2 / 1e6,
    },
  })),
  ...['o4-mini', 'o4-mini-2025-04-16'].map((model) => ({
    id: model,
    cost: {
      input: 1.1 / 1e6,
      output: 4.4 / 1e6,
    },
  })),
  // GPT-5 models
  ...['gpt-5', 'gpt-5-2025-08-07', 'gpt-5-chat', 'gpt-5-chat-latest'].map((model) => ({
    id: model,
    cost: {
      input: 1.25 / 1e6,
      output: 10 / 1e6,
    },
  })),
  ...['gpt-5-nano', 'gpt-5-nano-2025-08-07'].map((model) => ({
    id: model,
    cost: {
      input: 0.05 / 1e6,
      output: 0.4 / 1e6,
    },
  })),
  ...['gpt-5-mini', 'gpt-5-mini-2025-08-07'].map((model) => ({
    id: model,
    cost: {
      input: 0.25 / 1e6,
      output: 2 / 1e6,
    },
  })),
  ...['codex-mini-latest'].map((model) => ({
    id: model,
    cost: {
      input: 1.5 / 1e6,
      output: 6.0 / 1e6,
    },
  })),
  ...['gpt-5-codex'].map((model) => ({
    id: model,
    cost: {
      input: 1.25 / 1e6,
      output: 10 / 1e6,
    },
  })),
  ...['gpt-5-codex-mini'].map((model) => ({
    id: model,
    cost: {
      input: 0.5 / 1e6,
      output: 2 / 1e6,
    },
  })),
  ...['gpt-5-pro', 'gpt-5-pro-2025-10-06'].map((model) => ({
    id: model,
    cost: {
      input: 15 / 1e6,
      output: 120 / 1e6,
    },
  })),
  // GPT-5.1 models
  ...['gpt-5.1', 'gpt-5.1-2025-11-13', 'gpt-5.1-chat-latest'].map((model) => ({
    id: model,
    cost: {
      input: 1.25 / 1e6,
      output: 10 / 1e6,
    },
  })),
  ...['gpt-5.1-nano'].map((model) => ({
    id: model,
    cost: {
      input: 0.05 / 1e6,
      output: 0.4 / 1e6,
    },
  })),
  ...['gpt-5.1-mini', 'gpt-5.1-codex-mini'].map((model) => ({
    id: model,
    cost: {
      input: 0.25 / 1e6,
      output: 2 / 1e6,
    },
  })),
  ...['gpt-5.1-codex', 'gpt-5.1-codex-max'].map((model) => ({
    id: model,
    cost: {
      input: 1.25 / 1e6,
      output: 10 / 1e6,
    },
  })),
  // GPT-5.2 models
  ...['gpt-5.2', 'gpt-5.2-2025-12-11', 'gpt-5.2-chat-latest', 'gpt-5.2-codex'].map((model) => ({
    id: model,
    cost: {
      input: 1.75 / 1e6,
      output: 14 / 1e6,
    },
  })),
  ...['gpt-5.2-pro', 'gpt-5.2-pro-2025-12-11'].map((model) => ({
    id: model,
    cost: {
      input: 21 / 1e6,
      output: 168 / 1e6,
    },
  })),
  // GPT-5.3 models
  ...['gpt-5.3-chat-latest', 'gpt-5.3-codex'].map((model) => ({
    id: model,
    cost: {
      input: 1.75 / 1e6,
      output: 14 / 1e6,
    },
  })),
  ...['gpt-5.3-codex-spark'].map((model) => ({
    id: model,
    cost: {
      input: 0.5 / 1e6,
      output: 4 / 1e6,
    },
  })),
  // GPT-5.5 models
  ...['gpt-5.5', 'gpt-5.5-2026-04-23'].map((model) => ({
    id: model,
    cost: {
      input: 5 / 1e6,
      output: 30 / 1e6,
      longContext: {
        threshold: GPT_5_LONG_CONTEXT_THRESHOLD,
        input: 10 / 1e6,
        output: 45 / 1e6,
      },
    },
  })),
  // GPT-5.4 models
  ...['gpt-5.4', 'gpt-5.4-2026-03-05'].map((model) => ({
    id: model,
    cost: {
      input: 2.5 / 1e6,
      output: 15 / 1e6,
      longContext: {
        threshold: GPT_5_LONG_CONTEXT_THRESHOLD,
        input: 5 / 1e6,
        output: 22.5 / 1e6,
      },
    },
  })),
  ...['gpt-5.4-mini', 'gpt-5.4-mini-2026-03-17'].map((model) => ({
    id: model,
    cost: {
      input: 0.75 / 1e6,
      output: 4.5 / 1e6,
    },
  })),
  ...['gpt-5.4-nano', 'gpt-5.4-nano-2026-03-17'].map((model) => ({
    id: model,
    cost: {
      input: 0.2 / 1e6,
      output: 1.25 / 1e6,
    },
  })),
  // gpt-audio models
  ...['gpt-audio', 'gpt-audio-2025-08-28'].map((model) => ({
    id: model,
    cost: {
      input: 2.5 / 1e6,
      output: 10 / 1e6,
      audioInput: 40 / 1e6,
      audioOutput: 80 / 1e6,
    },
  })),
  {
    id: 'gpt-audio-1.5',
    cost: {
      input: 2.5 / 1e6,
      output: 10 / 1e6,
      audioInput: 32 / 1e6,
      audioOutput: 64 / 1e6,
    },
  },
  ...['gpt-audio-mini', 'gpt-audio-mini-2025-12-15', 'gpt-audio-mini-2025-10-06'].map((model) => ({
    id: model,
    cost: {
      input: 0.6 / 1e6,
      output: 2.4 / 1e6,
      audioInput: 10 / 1e6,
      audioOutput: 20 / 1e6,
    },
  })),
];

export const OPENAI_RESPONSES_ONLY_MODELS: OpenAIModelInfo[] = [
  ...['gpt-5.4-pro', 'gpt-5.4-pro-2026-03-05'].map((model) => ({
    id: model,
    cost: {
      input: 30 / 1e6,
      output: 180 / 1e6,
      longContext: {
        threshold: GPT_5_LONG_CONTEXT_THRESHOLD,
        input: 60 / 1e6,
        output: 270 / 1e6,
      },
    },
  })),
  // GPT-5.5 Pro is Responses-only
  ...['gpt-5.5-pro', 'gpt-5.5-pro-2026-04-23'].map((model) => ({
    id: model,
    cost: {
      input: 30 / 1e6,
      output: 180 / 1e6,
      longContext: {
        threshold: GPT_5_LONG_CONTEXT_THRESHOLD,
        input: 60 / 1e6,
        output: 270 / 1e6,
      },
    },
  })),
];

const RETIRED_OPENAI_AUDIO_MODELS: OpenAIModelInfo[] = [
  ...[
    'gpt-4o-audio-preview',
    'gpt-4o-audio-preview-2024-12-17',
    'gpt-4o-audio-preview-2024-10-01',
    'gpt-4o-audio-preview-2025-06-03',
  ].map((model) => ({
    id: model,
    cost: {
      input: 2.5 / 1e6,
      output: 10 / 1e6,
      audioInput: 40 / 1e6,
      audioOutput: 80 / 1e6,
    },
  })),
  ...['gpt-4o-mini-audio-preview', 'gpt-4o-mini-audio-preview-2024-12-17'].map((model) => ({
    id: model,
    cost: {
      input: 0.15 / 1e6,
      output: 0.6 / 1e6,
      audioInput: 10 / 1e6,
      audioOutput: 20 / 1e6,
    },
  })),
];

// Deep research models for Responses API
export const OPENAI_DEEP_RESEARCH_MODELS: OpenAIModelInfo[] = [
  ...['o3-deep-research', 'o3-deep-research-2025-06-26'].map((model) => ({
    id: model,
    cost: {
      input: 10 / 1e6,
      output: 40 / 1e6,
    },
  })),
  ...['o4-mini-deep-research', 'o4-mini-deep-research-2025-06-26'].map((model) => ({
    id: model,
    cost: {
      input: 2 / 1e6,
      output: 8 / 1e6,
    },
  })),
];

// See https://platform.openai.com/docs/models/model-endpoint-compatibility
export const OPENAI_COMPLETION_MODELS: OpenAIModelInfo[] = [
  {
    id: 'gpt-3.5-turbo-instruct',
    cost: {
      input: 1.5 / 1000000,
      output: 2 / 1000000,
    },
  },
  {
    id: 'text-davinci-002',
  },
  {
    id: 'text-babbage-002',
  },
];

/**
 * Realtime model IDs that exist on a different endpoint family from the conversational
 * Realtime API and therefore must NOT be routed through `openai:realtime:<model>`.
 *
 * - `gpt-realtime-translate` uses a dedicated translation-session endpoint.
 * - `gpt-realtime-whisper` is a transcription-only model intended to be passed as
 *   `input_audio_transcription.model` inside a conversational session, not used as a
 *   standalone provider.
 *
 * Used by the provider routing layer to fail-fast with a clear error rather than
 * silently exchanging an empty response over the wrong wire shape.
 */
export const NON_CONVERSATIONAL_REALTIME_MODELS: ReadonlySet<string> = new Set([
  'gpt-realtime-translate',
  'gpt-realtime-whisper',
]);

// Realtime models for WebSocket API
export const OPENAI_REALTIME_MODELS: OpenAIModelInfo[] = [
  // GA gpt-realtime models
  ...['gpt-realtime', 'gpt-realtime-2025-08-28', 'gpt-realtime-1.5'].map((model) => ({
    id: model,
    type: 'chat',
    cost: {
      input: 4 / 1e6,
      output: 16 / 1e6,
      audioInput: 32 / 1e6,
      audioOutput: 64 / 1e6,
    },
  })),
  {
    id: 'gpt-realtime-2',
    type: 'chat',
    cost: {
      input: 4 / 1e6,
      output: 24 / 1e6,
      audioInput: 32 / 1e6,
      audioOutput: 64 / 1e6,
    },
  },
  // Deprecated preview snapshot that remains available until July 23, 2026.
  {
    id: 'gpt-4o-mini-realtime-preview-2024-12-17',
    type: 'chat',
    cost: {
      input: 0.6 / 1e6,
      output: 2.4 / 1e6,
      audioInput: 10 / 1e6,
      audioOutput: 20 / 1e6,
    },
  },
  // gpt-realtime-mini models
  ...['gpt-realtime-mini', 'gpt-realtime-mini-2025-12-15', 'gpt-realtime-mini-2025-10-06'].map(
    (model) => ({
      id: model,
      type: 'chat',
      cost: {
        input: 0.6 / 1e6,
        output: 2.4 / 1e6,
        audioInput: 10 / 1e6,
        audioOutput: 20 / 1e6,
      },
    }),
  ),
];

const RETIRED_OPENAI_REALTIME_MODELS: OpenAIModelInfo[] = [
  {
    id: 'gpt-4o-realtime-preview',
    type: 'chat',
    cost: {
      input: 5 / 1e6,
      output: 20 / 1e6,
      audioInput: 40 / 1e6,
      audioOutput: 80 / 1e6,
    },
  },
  {
    id: 'gpt-4o-realtime-preview-2024-12-17',
    type: 'chat',
    cost: {
      input: 5 / 1e6,
      output: 20 / 1e6,
      audioInput: 40 / 1e6,
      audioOutput: 80 / 1e6,
    },
  },
  {
    id: 'gpt-4o-realtime-preview-2024-10-01',
    type: 'chat',
    cost: {
      input: 5 / 1e6,
      output: 20 / 1e6,
      audioInput: 100 / 1e6,
      audioOutput: 200 / 1e6,
    },
  },
  {
    id: 'gpt-4o-mini-realtime-preview',
    type: 'chat',
    cost: {
      input: 0.6 / 1e6,
      output: 2.4 / 1e6,
      audioInput: 10 / 1e6,
      audioOutput: 20 / 1e6,
    },
  },
];

export const OPENAI_BILLING_MODELS: OpenAIModelInfo[] = [
  ...OPENAI_CHAT_MODELS,
  ...RETIRED_OPENAI_AUDIO_MODELS,
  ...OPENAI_COMPLETION_MODELS,
  ...OPENAI_REALTIME_MODELS,
  ...RETIRED_OPENAI_REALTIME_MODELS,
  ...OPENAI_RESPONSES_ONLY_MODELS,
  ...OPENAI_DEEP_RESEARCH_MODELS,
];

// Transcription models for /v1/audio/transcriptions endpoint
export const OPENAI_TRANSCRIPTION_MODELS = [
  {
    id: 'gpt-4o-transcribe',
    cost: {
      // Per minute costs - OpenAI charges for audio duration, not tokens
      perMinute: 0.006, // $0.006 per minute
    },
  },
  {
    id: 'gpt-4o-mini-transcribe',
    cost: {
      perMinute: 0.003, // $0.003 per minute
    },
  },
  {
    id: 'gpt-4o-mini-transcribe-2025-12-15',
    cost: {
      perMinute: 0.003,
    },
  },
  {
    id: 'gpt-4o-transcribe-diarize',
    cost: {
      perMinute: 0.006, // $0.006 per minute (same as base gpt-4o-transcribe)
    },
  },
  {
    id: 'gpt-4o-transcribe-diarize-2025-10-15',
    cost: {
      perMinute: 0.006,
    },
  },
  {
    id: 'whisper-1',
    cost: {
      perMinute: 0.006, // $0.006 per minute
    },
  },
];

export function calculateOpenAICost(
  modelName: string,
  config: ProviderConfig,
  promptTokens?: number,
  completionTokens?: number,
  audioPromptTokens?: number,
  audioCompletionTokens?: number,
): number | undefined {
  if (!audioPromptTokens && !audioCompletionTokens) {
    return calculateCost(modelName, config, promptTokens, completionTokens, OPENAI_BILLING_MODELS);
  }

  // Calculate with audio tokens
  if (
    !Number.isFinite(promptTokens) ||
    !Number.isFinite(completionTokens) ||
    !Number.isFinite(audioPromptTokens) ||
    !Number.isFinite(audioCompletionTokens) ||
    typeof promptTokens === 'undefined' ||
    typeof completionTokens === 'undefined' ||
    typeof audioPromptTokens === 'undefined' ||
    typeof audioCompletionTokens === 'undefined'
  ) {
    return undefined;
  }

  const model = OPENAI_BILLING_MODELS.find((m) => m.id === modelName);
  if (!model || !model.cost) {
    return undefined;
  }

  let totalCost = 0;

  const inputCost = config.inputCost ?? config.cost ?? model.cost.input;
  const outputCost = config.outputCost ?? config.cost ?? model.cost.output;
  totalCost += inputCost * promptTokens + outputCost * completionTokens;

  if ('audioInput' in model.cost || 'audioOutput' in model.cost) {
    const modelAudioInputCost: number =
      'audioInput' in model.cost && typeof model.cost.audioInput === 'number'
        ? model.cost.audioInput
        : 0;
    const modelAudioOutputCost: number =
      'audioOutput' in model.cost && typeof model.cost.audioOutput === 'number'
        ? model.cost.audioOutput
        : 0;
    const audioInputCost = config.audioInputCost ?? config.audioCost ?? modelAudioInputCost;
    const audioOutputCost = config.audioOutputCost ?? config.audioCost ?? modelAudioOutputCost;
    totalCost += audioInputCost * audioPromptTokens + audioOutputCost * audioCompletionTokens;
  }

  return totalCost;
}

export function failApiCall(err: any) {
  if (err instanceof OpenAI.APIError) {
    const errorType = err.error?.type || err.type || 'unknown';
    const errorMessage = err.error?.message || err.message || 'Unknown error';
    const statusCode = err.status ? ` ${err.status}` : '';
    return {
      error: `API error: ${errorType}${statusCode} ${errorMessage}`,
    };
  }
  return {
    error: `API error: ${String(err)}`,
  };
}

export function getTokenUsage(data: any, cached: boolean): Partial<TokenUsage> {
  if (data.usage) {
    if (cached) {
      // Cached responses don't count as a new request
      return { cached: data.usage.total_tokens, total: data.usage.total_tokens };
    } else {
      const cachedInputTokens =
        data.usage.prompt_tokens_details?.cached_tokens ??
        data.usage.input_tokens_details?.cached_tokens ??
        0;
      return {
        total: data.usage.total_tokens,
        prompt: data.usage.prompt_tokens || 0,
        completion: data.usage.completion_tokens || 0,
        numRequests: 1,
        ...(data.usage.completion_tokens_details
          ? {
              completionDetails: {
                reasoning: data.usage.completion_tokens_details.reasoning_tokens,
                acceptedPrediction: data.usage.completion_tokens_details.accepted_prediction_tokens,
                rejectedPrediction: data.usage.completion_tokens_details.rejected_prediction_tokens,
                ...(cachedInputTokens > 0 ? { cacheReadInputTokens: cachedInputTokens } : {}),
              },
            }
          : cachedInputTokens > 0
            ? {
                completionDetails: {
                  cacheReadInputTokens: cachedInputTokens,
                },
              }
            : {}),
      };
    }
  }
  return {};
}

export interface OpenAiFunction {
  name: string;
  description?: string;
  parameters?: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface OpenAiTool {
  type: 'function';
  function: OpenAiFunction;
}

interface OpenAiFunctionCall {
  arguments: string;
  name: string;
}

function parseFunctionCall(output: string | object): OpenAiFunctionCall {
  if (typeof output === 'object' && output !== null && 'function_call' in output) {
    output = (output as { function_call: any }).function_call;
  }
  const functionCall = output as OpenAiFunctionCall;
  if (
    typeof functionCall !== 'object' ||
    functionCall === null ||
    typeof functionCall.name !== 'string' ||
    functionCall.name.trim().length === 0 ||
    typeof functionCall.arguments !== 'string'
  ) {
    throw new Error(
      `OpenAI did not return a valid-looking function call: ${JSON.stringify(functionCall)}`,
    );
  }
  return functionCall;
}

export function createFunctionCallValidator(
  functions?: OpenAiFunction[],
  vars?: Record<string, VarValue>,
): (output: string | object) => void {
  let interpolatedFunctions: OpenAiFunction[];
  try {
    interpolatedFunctions = maybeLoadFromExternalFileWithVars(functions, vars) as OpenAiFunction[];
  } catch (error) {
    throw new FunctionToolCallValidationSetupError((error as Error).message);
  }
  if (!Array.isArray(interpolatedFunctions) || interpolatedFunctions.length === 0) {
    throw new FunctionToolCallValidationSetupError(
      'No function schemas configured in provider, but output contains a function call',
    );
  }
  const isUsableFunctionDefinition = (fn: unknown): fn is OpenAiFunction =>
    typeof fn === 'object' &&
    fn !== null &&
    'name' in fn &&
    typeof fn.name === 'string' &&
    fn.name.trim().length > 0;
  if (!interpolatedFunctions.every(isUsableFunctionDefinition)) {
    throw new FunctionToolCallValidationSetupError(
      'Invalid function schema configured in provider: every function definition must have a non-empty name',
    );
  }

  // Function schemas may contain $id values. Compile them in an isolated AJV
  // instance so repeated assertions cannot collide through the global schema registry.
  const validationAjv = createAjv();
  const validators = new Map<string, ReturnType<typeof validationAjv.compile>>();
  for (const functionDefinition of interpolatedFunctions) {
    if (validators.has(functionDefinition.name)) {
      throw new FunctionToolCallValidationSetupError(
        `Duplicate function schema configured for "${functionDefinition.name}"`,
      );
    }
    const functionSchema =
      functionDefinition.parameters === undefined
        ? {
            type: 'object',
            properties: {},
            additionalProperties: false,
          }
        : functionDefinition.parameters;
    if (
      typeof functionSchema !== 'object' ||
      functionSchema === null ||
      Array.isArray(functionSchema)
    ) {
      throw new FunctionToolCallValidationSetupError(
        `Function "${functionDefinition.name}" does not have a usable parameters schema`,
      );
    }
    try {
      const validate = validationAjv.compile(functionSchema);
      if ((validate as { $async?: boolean }).$async) {
        throw new Error('Async function schemas are not supported');
      }
      validators.set(functionDefinition.name, validate);
    } catch (error) {
      throw new FunctionToolCallValidationSetupError((error as Error).message);
    }
  }

  return (output: string | object) => {
    const functionCall = parseFunctionCall(output);
    const functionName = functionCall.name;
    const validate = validators.get(functionName);
    if (!validate) {
      throw new Error(`Called "${functionName}", but there is no function with that name`);
    }
    const functionArgs = JSON.parse(functionCall.arguments);
    if (!validate(functionArgs)) {
      throw new Error(
        `Call to "${functionName}" does not match schema: ${JSON.stringify(validate.errors)}`,
      );
    }
  };
}

export function validateFunctionCall(
  output: string | object,
  functions?: OpenAiFunction[],
  vars?: Record<string, VarValue>,
) {
  // Preserve ordinary invalid-output precedence for completely malformed calls,
  // while still preflighting all schemas before parsing model-controlled arguments.
  const functionCall = parseFunctionCall(output);
  createFunctionCallValidator(functions, vars)(functionCall);
}

export function formatOpenAiError(data: {
  error: { message: string; type?: string; code?: string };
}): string {
  let errorMessage = `API error: ${data.error.message}`;
  if (data.error.type) {
    errorMessage += `, Type: ${data.error.type}`;
  }
  if (data.error.code) {
    errorMessage += `, Code: ${data.error.code}`;
  }
  errorMessage += '\n\n' + safeJsonStringify(data, true /* prettyPrint */);
  return errorMessage;
}
