import Ajv from 'ajv';
import OpenAI from 'openai';
import type { TokenUsage } from '../../types';
import { maybeLoadFromExternalFile, renderVarsInObject } from '../../util';
import { safeJsonStringify } from '../../util/json';
import type { ProviderConfig } from '../shared';
import { calculateCost } from '../shared';

const ajv = new Ajv();

// see https://platform.openai.com/docs/models
export const OPENAI_CHAT_MODELS = [
  ...['chatgpt-4o-latest'].map((model) => ({
    id: model,
    cost: {
      input: 5 / 1e6,
      output: 15 / 1e6,
    },
  })),
  ...['o1', 'o1-2024-12-17', 'o1-preview', 'o1-preview-2024-09-12'].map((model) => ({
    id: model,
    cost: {
      input: 15 / 1e6,
      output: 60 / 1e6,
    },
  })),
  ...['o1-mini', 'o1-mini-2024-09-12'].map((model) => ({
    id: model,
    cost: {
      input: 3 / 1e6,
      output: 12 / 1e6,
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
      input: 5 / 1000000,
      output: 15 / 1000000,
    },
  })),
  ...['gpt-4o-mini', 'gpt-4o-mini-2024-07-18'].map((model) => ({
    id: model,
    cost: {
      input: 0.15 / 1000000,
      output: 0.6 / 1000000,
    },
  })),
  ...['gpt-4', 'gpt-4-0613'].map((model) => ({
    id: model,
    cost: {
      input: 30 / 1000000,
      output: 60 / 1000000,
    },
  })),
  ...[
    'gpt-4-turbo',
    'gpt-4-turbo-2024-04-09',
    'gpt-4-turbo-preview',
    'gpt-4-0125-preview',
    'gpt-4-1106-preview',
  ].map((model) => ({
    id: model,
    cost: {
      input: 10 / 1000000,
      output: 30 / 1000000,
    },
  })),
  {
    id: 'gpt-3.5-turbo',
    cost: {
      input: 0.5 / 1000000,
      output: 1.5 / 1000000,
    },
  },
  {
    id: 'gpt-3.5-turbo-0125',
    cost: {
      input: 0.5 / 1000000,
      output: 1.5 / 1000000,
    },
  },
  {
    id: 'gpt-3.5-turbo-1106',
    cost: {
      input: 1 / 1000000,
      output: 2 / 1000000,
    },
  },
  ...['gpt-3.5-turbo-instruct'].map((model) => ({
    id: model,
    cost: {
      input: 1.5 / 1000000,
      output: 2 / 1000000,
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

export function calculateOpenAICost(
  modelName: string,
  config: ProviderConfig,
  promptTokens?: number,
  completionTokens?: number,
): number | undefined {
  return calculateCost(modelName, config, promptTokens, completionTokens, [
    ...OPENAI_CHAT_MODELS,
    ...OPENAI_COMPLETION_MODELS,
  ]);
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
      return { cached: data.usage.total_tokens, total: data.usage.total_tokens };
    } else {
      return {
        total: data.usage.total_tokens,
        prompt: data.usage.prompt_tokens || 0,
        completion: data.usage.completion_tokens || 0,
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
  functionCall: { arguments: string; name: string },
  functions?: OpenAiFunction[],
  vars?: Record<string, string | object>,
) {
  // Parse function call and validate it against schema
  const interpolatedFunctions = maybeLoadFromExternalFile(
    renderVarsInObject(functions, vars),
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
