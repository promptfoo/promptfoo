import Ajv from 'ajv';
import OpenAI from 'openai';
import type { TokenUsage } from '../../types';
import { maybeLoadFromExternalFile, renderVarsInObject } from '../../util';

const ajv = new Ajv();

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
