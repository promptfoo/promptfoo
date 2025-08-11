import type OpenAI from 'openai';
import logger from '../../logger';
import type { CallApiContextParams, ProviderResponse, TokenUsage } from '../../types';
import { safeJsonStringify } from '../../util/json';
import { getCurrentTimestamp } from '../../util/time';
import type { OpenAiCompletionOptions } from './types';
import { calculateOpenAICost, formatOpenAiError, getTokenUsage } from './util';

/**
 * Default maximum number of iterations for multi-turn tool conversations
 */
const DEFAULT_MAX_TOOL_ITERATIONS = 20;

/**
 * Details about a tool call made during multi-turn conversation
 */
export interface ToolCallDetails {
  iteration: number;
  toolCallId: string;
  functionName: string;
  arguments: any;
  result: any;
  error?: string;
  timestamp: string;
}

/**
 * Response from a multi-turn tool conversation
 */
export type MultiTurnToolResponse = ProviderResponse & {
  metadata: {
    multiTurn: {
      iterations: number;
      toolCalls: ToolCallDetails[];
      conversationLength: number;
      naturalTermination: boolean;
    };
    [key: string]: any;
  };
};

/**
 * Options for multi-turn tool conversation handling
 */
export interface MultiTurnToolOptions {
  config: OpenAiCompletionOptions;
  modelName: string;
  context?: CallApiContextParams;
  executeFunctionCallback: (
    functionName: string,
    args: string,
    config: OpenAiCompletionOptions,
  ) => Promise<any>;
  callOpenAI: (
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    config: OpenAiCompletionOptions,
  ) => Promise<OpenAI.Chat.ChatCompletion>;
}

/**
 * Handles multi-turn tool conversations following OpenAI's recommended agentic loop pattern.
 * 
 * This implementation follows the pattern shown in OpenAI's official cookbooks:
 * 1. Make API call
 * 2. Check for tool_calls
 * 3. Execute tools and add results as 'tool' messages
 * 4. Continue until model provides final response without tool calls
 * 
 * @param initialMessages - The conversation messages to start with
 * @param options - Configuration and callback functions
 * @returns Promise resolving to the final response with aggregated token usage
 */
export async function handleMultiTurnToolConversation(
  initialMessages: OpenAI.Chat.ChatCompletionMessageParam[],
  options: MultiTurnToolOptions,
): Promise<MultiTurnToolResponse> {
  const { config, modelName, context, executeFunctionCallback, callOpenAI } = options;
  
  // Clone messages to avoid mutating the original array
  const messages = [...initialMessages];
  
  let aggregatedTokenUsage: Partial<TokenUsage> = {};
  let totalCost = 0;
  let iterations = 0;
  let finalResponse: OpenAI.Chat.ChatCompletion | null = null;
  let toolCallsHistory: ToolCallDetails[] = [];
  let naturalTermination = false;
  
  const maxIterations = config.maxToolIterations ?? DEFAULT_MAX_TOOL_ITERATIONS;
  
  logger.debug(`Starting multi-turn tool conversation with max ${maxIterations} iterations`);
  
  // Agentic loop - continue until model stops making tool calls
  while (iterations < maxIterations) {
    iterations++;
    logger.debug(`Multi-turn tool conversation iteration ${iterations}/${maxIterations}`);
    
    try {
      // Make API call with current conversation state
      const response = await callOpenAI(messages, config);
      finalResponse = response;
      
      // Aggregate token usage using existing utility
      const iterationTokenUsage = getTokenUsage(response, false);
      
      // Merge token usage
      aggregatedTokenUsage.prompt = (aggregatedTokenUsage.prompt || 0) + (iterationTokenUsage.prompt || 0);
      aggregatedTokenUsage.completion = (aggregatedTokenUsage.completion || 0) + (iterationTokenUsage.completion || 0);
      aggregatedTokenUsage.total = (aggregatedTokenUsage.total || 0) + (iterationTokenUsage.total || 0);
      
      // Calculate cost for this iteration
      if (response.usage) {
        const iterationCost = calculateOpenAICost(
          modelName,
          config,
          response.usage.prompt_tokens,
          response.usage.completion_tokens,
          undefined, // audio_prompt_tokens not available in chat completions
          undefined, // audio_completion_tokens not available in chat completions
        );
        if (iterationCost !== undefined) {
          totalCost += iterationCost;
        }
      }
      
      const message = response.choices[0]?.message;
      if (!message) {
        throw new Error('No message in response');
      }
      
      // Add assistant's response to conversation
      messages.push(message);
      
      // Check for natural termination conditions
      const hasToolCalls = message.tool_calls && message.tool_calls.length > 0;
      const finishReason = response.choices[0]?.finish_reason;
      
      if (!hasToolCalls || finishReason === 'stop') {
        // Model has provided final response without tool calls - we're done
        naturalTermination = true;
        logger.debug(`Multi-turn conversation completed naturally after ${iterations} iterations`);
        break;
      }
      
      // Execute tool calls and add results to conversation
      logger.debug(`Processing ${message.tool_calls!.length} tool calls in iteration ${iterations}`);
      
      for (const toolCall of message.tool_calls!) {
        // Skip non-function tool calls (e.g., custom tool calls)
        if (toolCall.type !== 'function') {
          logger.debug(`Skipping non-function tool call of type: ${toolCall.type}`);
          continue;
        }
        
        const functionName = toolCall.function.name;
        const functionArgs = toolCall.function.arguments;
        const timestamp = getCurrentTimestamp().toString();
        
        // Parse arguments safely - if parsing fails, use the raw string
        let parsedArgs: any;
        try {
          parsedArgs = JSON.parse(functionArgs);
        } catch {
          parsedArgs = functionArgs;
        }
        
        try {
          logger.debug(`Executing tool call: ${functionName}(${functionArgs})`);
          
          const result = await executeFunctionCallback(
            functionName,
            functionArgs,
            config,
          );
          
          // Record successful tool call  
          const serializedResult = typeof result === 'string' ? result : (safeJsonStringify(result) || String(result));
          toolCallsHistory.push({
            iteration: iterations,
            toolCallId: toolCall.id,
            functionName,
            arguments: parsedArgs,
            result: serializedResult,
            timestamp,
          });
          
          // Add tool result as a 'tool' message
          const toolResultMessage: OpenAI.Chat.ChatCompletionMessageParam = {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: serializedResult,
          };
          
          messages.push(toolResultMessage);
          
          logger.debug(`Tool call ${functionName} completed successfully`);
        } catch (error) {
          logger.error(`Error executing tool call ${functionName}: ${error}`);
          
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorDetails = { error: errorMessage };
          const serializedError = safeJsonStringify(errorDetails) || JSON.stringify(errorDetails);
          
          // Record failed tool call
          toolCallsHistory.push({
            iteration: iterations,
            toolCallId: toolCall.id,
            functionName,
            arguments: parsedArgs,
            result: null,
            error: errorMessage,
            timestamp,
          });
          
          // Add error result as tool message to continue conversation
          const errorToolMessage: OpenAI.Chat.ChatCompletionMessageParam = {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: serializedError,
          };
          
          messages.push(errorToolMessage);
        }
      }
      
      // Continue to next iteration to let model process tool results
      
    } catch (error) {
      logger.error(`Error in multi-turn tool conversation iteration ${iterations}: ${error}`);
      throw error;
    }
  }
  
  // Check if we hit the safety valve
  if (iterations >= maxIterations) {
    logger.warn(`Multi-turn tool conversation reached maximum iterations (${maxIterations}). Returning partial response.`);
  }
  
  if (!finalResponse) {
    throw new Error('No response received from multi-turn tool conversation');
  }
  
  // Extract final output - use finalResponse directly for efficiency
  const output = finalResponse.choices[0]?.message?.content || '';
  
  const result: MultiTurnToolResponse = {
    output,
    tokenUsage: aggregatedTokenUsage,
    cost: totalCost,
    finishReason: finalResponse.choices[0]?.finish_reason,
    cached: false, // Will be set by the calling function based on actual cache status
    ...(finalResponse.choices[0]?.logprobs && { 
      logProbs: finalResponse.choices[0].logprobs as any // OpenAI returns Logprobs object, not number[]
    }),
    metadata: {
      multiTurn: {
        iterations,
        toolCalls: toolCallsHistory,
        conversationLength: messages.length,
        naturalTermination,
      },
    },
  };
  
  logger.debug(`Multi-turn tool conversation completed. Total tokens: ${aggregatedTokenUsage.total || 0}, Total cost: ${totalCost}, Iterations: ${iterations}, Tool calls: ${toolCallsHistory.length}`);
  
  return result;
}

/**
 * Validates multi-turn tools configuration and warns about misconfigurations
 */
export function validateMultiTurnToolsConfig(config: OpenAiCompletionOptions): void {
  if (config.enableMultiTurnTools === true && 
      (!config.functionToolCallbacks || Object.keys(config.functionToolCallbacks).length === 0)) {
    logger.warn(
      'enableMultiTurnTools is enabled but no functionToolCallbacks are defined. ' +
      'Multi-turn tool conversations require functionToolCallbacks to execute tools.'
    );
  }
}

/**
 * Checks if multi-turn tool handling should be enabled for this request
 */
export function shouldEnableMultiTurnTools(
  config: OpenAiCompletionOptions,
  functionCalls: any[],
): boolean {
  return Boolean(
    config.enableMultiTurnTools === true &&
    functionCalls &&
    functionCalls.length > 0 &&
    config.functionToolCallbacks &&
    Object.keys(config.functionToolCallbacks).length > 0
  );
}