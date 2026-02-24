import logger from '../../logger';

import type { TokenUsage } from '../../types/shared';
import type { FunctionCallbackConfig } from '../functionCallbackTypes';
import type { FunctionCallbackHandler } from '../functionCallbackUtils';

/**
 * A function_call item from the OpenAI Responses API output array.
 */
export interface ResponseFunctionCall {
  type: 'function_call';
  id?: string;
  call_id: string;
  name: string;
  arguments: string;
  status?: string;
}

/**
 * A function_call_output item to send back to the API.
 */
export interface FunctionCallOutput {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

export interface ToolCallLoopResult {
  finalData: any;
  aggregatedUsage: Partial<TokenUsage>;
  toolCallRounds: number;
  intermediateToolCalls: Array<{
    round: number;
    calls: ResponseFunctionCall[];
    outputs: FunctionCallOutput[];
  }>;
}

/**
 * Checks whether the response has function_call items with matching callbacks.
 */
export function hasPendingFunctionCalls(data: any, callbacks?: FunctionCallbackConfig): boolean {
  if (!callbacks || !data?.output || !Array.isArray(data.output)) {
    return false;
  }

  return data.output.some(
    (item: any) => item.type === 'function_call' && item.name && callbacks[item.name] !== undefined,
  );
}

/**
 * Extracts function_call items from the response output array.
 */
export function extractFunctionCalls(data: any): ResponseFunctionCall[] {
  if (!data?.output || !Array.isArray(data.output)) {
    return [];
  }

  return data.output.filter(
    (item: any): item is ResponseFunctionCall => item.type === 'function_call' && item.call_id,
  );
}

/**
 * Executes function callbacks for each function call, returning function_call_output items.
 */
export async function executeFunctionCallbacks(
  calls: ResponseFunctionCall[],
  callbacks: FunctionCallbackConfig,
  handler: FunctionCallbackHandler,
): Promise<FunctionCallOutput[]> {
  const outputs: FunctionCallOutput[] = [];

  for (const call of calls) {
    const result = await handler.processCall(call, callbacks);
    outputs.push({
      type: 'function_call_output',
      call_id: call.call_id,
      output: typeof result.output === 'string' ? result.output : JSON.stringify(result.output),
    });
  }

  return outputs;
}

/**
 * Aggregates token usage across multiple API rounds.
 */
export function aggregateTokenUsage(usages: Array<Partial<TokenUsage>>): Partial<TokenUsage> {
  const result: Partial<TokenUsage> = {};

  for (const usage of usages) {
    if (usage.prompt !== undefined) {
      result.prompt = (result.prompt ?? 0) + usage.prompt;
    }
    if (usage.completion !== undefined) {
      result.completion = (result.completion ?? 0) + usage.completion;
    }
    if (usage.cached !== undefined) {
      result.cached = (result.cached ?? 0) + usage.cached;
    }
    if (usage.total !== undefined) {
      result.total = (result.total ?? 0) + usage.total;
    }
    if (usage.numRequests !== undefined) {
      result.numRequests = (result.numRequests ?? 0) + usage.numRequests;
    }
  }

  return result;
}

/**
 * Parses token usage from a raw API response's usage field.
 */
function parseUsageFromResponse(data: any): Partial<TokenUsage> {
  if (!data?.usage) {
    return {};
  }
  const u = data.usage;
  const prompt = u.input_tokens ?? u.prompt_tokens ?? 0;
  const completion = u.output_tokens ?? u.completion_tokens ?? 0;
  const total = u.total_tokens ?? prompt + completion;
  return { prompt, completion, total, numRequests: 1 };
}

export interface ToolCallLoopOptions {
  initialData: any;
  callbacks: FunctionCallbackConfig;
  handler: FunctionCallbackHandler;
  sendRequest: (body: any) => Promise<{ data: any; cached: boolean }>;
  buildFollowUpBody: (previousResponseId: string, toolOutputs: FunctionCallOutput[]) => any;
  maxRounds: number;
}

/**
 * Orchestrates the multi-turn tool call loop.
 *
 * 1. Check if response has pending function calls
 * 2. Execute callbacks
 * 3. Build follow-up body with previous_response_id + function_call_output items
 * 4. Call sendRequest(body)
 * 5. Repeat until no function calls or max rounds reached
 */
export async function runToolCallLoop(options: ToolCallLoopOptions): Promise<ToolCallLoopResult> {
  const { initialData, callbacks, handler, sendRequest, buildFollowUpBody, maxRounds } = options;

  let currentData = initialData;
  const usages: Array<Partial<TokenUsage>> = [parseUsageFromResponse(initialData)];
  const intermediateToolCalls: ToolCallLoopResult['intermediateToolCalls'] = [];
  let round = 0;

  while (round < maxRounds) {
    const functionCalls = extractFunctionCalls(currentData);
    const pendingCalls = functionCalls.filter((c) => callbacks[c.name] !== undefined);

    if (pendingCalls.length === 0) {
      break;
    }

    round++;
    logger.debug(
      `Tool call loop round ${round}/${maxRounds}: executing ${pendingCalls.length} function call(s)`,
    );

    const outputs = await executeFunctionCallbacks(pendingCalls, callbacks, handler);
    intermediateToolCalls.push({ round, calls: pendingCalls, outputs });

    const previousResponseId = currentData.id;
    if (!previousResponseId) {
      logger.warn('No response ID found for tool call loop continuation; stopping loop.');
      break;
    }

    const followUpBody = buildFollowUpBody(previousResponseId, outputs);
    const { data: nextData } = await sendRequest(followUpBody);

    usages.push(parseUsageFromResponse(nextData));
    currentData = nextData;
  }

  if (round >= maxRounds) {
    logger.warn(`Tool call loop reached maximum rounds (${maxRounds}); returning last response.`);
  }

  return {
    finalData: currentData,
    aggregatedUsage: aggregateTokenUsage(usages),
    toolCallRounds: round,
    intermediateToolCalls,
  };
}
