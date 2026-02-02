import OpenAI from 'openai';
import { maybeLoadFromExternalFileWithVars } from '../../util/index';
import { getAjv, safeJsonStringify } from '../../util/json';
import { calculateCost } from '../shared';

import type { TokenUsage, VarValue } from '../../types/index';
import type { ProviderConfig } from '../shared';

const ajv = getAjv();

// see https://platform.openai.com/docs/models
export const OPENAI_CHAT_MODELS = [
  // TTS model (text input + audio output costs)
  {
    id: 'gpt-4o-mini-tts',
    cost: {
      input: 0.6 / 1e6,
      output: 0 / 1e6,
      audioOutput: 12 / 1e6,
    },
  },
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
  ...['gpt-5', 'gpt-5-2025-08-07'].map((model) => ({
    id: model,
    cost: {
      input: 1.25 / 1e6,
      output: 10 / 1e6,
    },
  })),
  ...['gpt-5-chat-latest'].map((model) => ({
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
  ...['gpt-5-pro', 'gpt-5-pro-2025-10-06'].map((model) => ({
    id: model,
    cost: {
      input: 15 / 1e6,
      output: 120 / 1e6,
    },
  })),
  // GPT-5.1 models
  ...['gpt-5.1'].map((model) => ({
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
  ...['gpt-5.1-mini'].map((model) => ({
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
  ...['gpt-5.2', 'gpt-5.2-2025-12-11'].map((model) => ({
    id: model,
    cost: {
      input: 1.75 / 1e6,
      output: 14 / 1e6,
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
  ...['gpt-audio-mini', 'gpt-audio-mini-2025-10-06'].map((model) => ({
    id: model,
    cost: {
      input: 0.6 / 1e6,
      output: 2.4 / 1e6,
      audioInput: 10 / 1e6,
      audioOutput: 20 / 1e6,
    },
  })),
];

// Deep research models for Responses API
export const OPENAI_DEEP_RESEARCH_MODELS = [
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
export const OPENAI_COMPLETION_MODELS = [
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

// Realtime models for WebSocket API
export const OPENAI_REALTIME_MODELS = [
  // gpt-realtime models (latest)
  {
    id: 'gpt-realtime',
    type: 'chat',
    cost: {
      input: 32 / 1e6,
      output: 64 / 1e6,
      audioInput: 32 / 1e6,
      audioOutput: 64 / 1e6,
    },
  },
  // gpt-4o realtime models
  {
    id: 'gpt-realtime',
    type: 'chat',
    cost: {
      input: 4 / 1e6,
      output: 16 / 1e6,
      audioInput: 40 / 1e6,
      audioOutput: 80 / 1e6,
    },
  },
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
  // gpt-4o-mini realtime models
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
  {
    id: 'gpt-realtime-mini',
    type: 'chat',
    cost: {
      input: 0.6 / 1e6,
      output: 2.4 / 1e6,
      audioInput: 10 / 1e6,
      audioOutput: 20 / 1e6,
    },
  },
  {
    id: 'gpt-realtime-mini-2025-10-06',
    type: 'chat',
    cost: {
      input: 0.6 / 1e6,
      output: 2.4 / 1e6,
      audioInput: 10 / 1e6,
      audioOutput: 20 / 1e6,
    },
  },
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
    id: 'gpt-4o-transcribe-diarize',
    cost: {
      perMinute: 0.006, // $0.006 per minute (same as base gpt-4o-transcribe)
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
    return calculateCost(modelName, config, promptTokens, completionTokens, [
      ...OPENAI_CHAT_MODELS,
      ...OPENAI_COMPLETION_MODELS,
      ...OPENAI_REALTIME_MODELS,
      ...OPENAI_DEEP_RESEARCH_MODELS,
    ]);
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

  const model = [
    ...OPENAI_CHAT_MODELS,
    ...OPENAI_COMPLETION_MODELS,
    ...OPENAI_REALTIME_MODELS,
    ...OPENAI_DEEP_RESEARCH_MODELS,
  ].find((m) => m.id === modelName);
  if (!model || !model.cost) {
    return undefined;
  }

  let totalCost = 0;

  const inputCost = config.cost ?? model.cost.input;
  const outputCost = config.cost ?? model.cost.output;
  totalCost += inputCost * promptTokens + outputCost * completionTokens;

  if ('audioInput' in model.cost || 'audioOutput' in model.cost) {
    const audioInputCost = config.audioCost ?? (model.cost as any).audioInput ?? 0;
    const audioOutputCost = config.audioCost ?? (model.cost as any).audioOutput ?? 0;
    totalCost += audioInputCost * audioPromptTokens + audioOutputCost * audioCompletionTokens;
  }

  return totalCost || undefined;
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
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface OpenAiTool {
  type: 'function';
  function: OpenAiFunction;
}

export function validateFunctionCall(
  output: string | object,
  functions?: OpenAiFunction[],
  vars?: Record<string, VarValue>,
) {
  if (typeof output === 'object' && 'function_call' in output) {
    output = (output as { function_call: any }).function_call;
  }
  const functionCall = output as { arguments: string; name: string };
  if (
    typeof functionCall !== 'object' ||
    typeof functionCall.name !== 'string' ||
    typeof functionCall.arguments !== 'string'
  ) {
    throw new Error(
      `OpenAI did not return a valid-looking function call: ${JSON.stringify(functionCall)}`,
    );
  }

  // Parse function call and validate it against schema
  const interpolatedFunctions = maybeLoadFromExternalFileWithVars(
    functions,
    vars,
  ) as OpenAiFunction[];
  const functionArgs = JSON.parse(functionCall.arguments);
  const functionName = functionCall.name;
  const functionSchema = interpolatedFunctions?.find((f) => f.name === functionName)?.parameters;
  if (!functionSchema) {
    throw new Error(`Called "${functionName}", but there is no function with that name`);
  }
  const validate = ajv.compile(functionSchema);
  if (!validate(functionArgs)) {
    throw new Error(
      `Call to "${functionName}" does not match schema: ${JSON.stringify(validate.errors)}`,
    );
  }
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
