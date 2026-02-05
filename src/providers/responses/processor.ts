import logger from '../../logger';
import { formatOpenAiError } from '../openai/util';

import type { ProviderResponse, TokenUsage } from '../../types/index';
import type {
  ProcessedOutput,
  ProcessorConfig,
  ProcessorContext,
  ResponseOutputItem,
} from './types';

/**
 * Extract user-facing metadata from response data.
 * Only includes fields that are useful for users viewing eval results.
 */
function extractMetadata(data: any, processedOutput: ProcessedOutput): Record<string, any> {
  const metadata: Record<string, any> = {};

  // Response ID - for linking to OpenAI dashboard
  if (typeof data.id === 'string' && data.id) {
    metadata.responseId = data.id;
  }

  // Actual model used - may differ from requested (e.g., gpt-5 -> gpt-5-2025-08-07)
  if (typeof data.model === 'string' && data.model) {
    metadata.model = data.model;
  }

  // Deep research annotations (citations)
  if (Array.isArray(processedOutput.annotations) && processedOutput.annotations.length > 0) {
    metadata.annotations = processedOutput.annotations;
  }

  return metadata;
}

/**
 * Extract token usage from response data, handling both OpenAI Chat Completions format
 * (prompt_tokens, completion_tokens) and Azure Responses format (input_tokens, output_tokens)
 */
function getTokenUsage(data: any, cached: boolean): Partial<TokenUsage> {
  if (data.usage) {
    if (cached) {
      const totalTokens =
        data.usage.total_tokens || (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0);
      return { cached: totalTokens, total: totalTokens, numRequests: 1 };
    } else {
      const promptTokens = data.usage.prompt_tokens || data.usage.input_tokens || 0;
      const completionTokens = data.usage.completion_tokens || data.usage.output_tokens || 0;
      const totalTokens = data.usage.total_tokens || promptTokens + completionTokens;

      return {
        total: totalTokens,
        prompt: promptTokens,
        completion: completionTokens,
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

/**
 * Shared response processor for OpenAI and Azure Responses APIs.
 * Handles all response types with identical logic to ensure feature parity.
 */
export class ResponsesProcessor {
  constructor(private config: ProcessorConfig) {}

  async processResponseOutput(
    data: any,
    requestConfig: any,
    cached: boolean,
  ): Promise<ProviderResponse> {
    // Log response metadata for debugging
    logger.debug(`Processing ${this.config.providerType} responses output`, {
      responseId: data.id,
      model: data.model,
    });

    if (data.error) {
      return {
        error: formatOpenAiError(data),
      };
    }

    try {
      const context: ProcessorContext = {
        config: requestConfig,
        cached,
        data,
      };

      const processedOutput = await this.processOutput(data.output, context);

      if (processedOutput.isRefusal) {
        return {
          output: processedOutput.refusal,
          tokenUsage: getTokenUsage(data, cached),
          isRefusal: true,
          cached,
          cost: this.config.costCalculator(this.config.modelName, data.usage, requestConfig),
          raw: data,
          metadata: extractMetadata(data, processedOutput),
        };
      }

      let finalOutput: string | any = processedOutput.result;

      // Handle JSON schema parsing
      if (
        requestConfig.response_format?.type === 'json_schema' &&
        typeof finalOutput === 'string'
      ) {
        try {
          finalOutput = JSON.parse(finalOutput);
        } catch (error) {
          logger.error(`Failed to parse JSON output: ${error}`);
        }
      }

      const result: ProviderResponse = {
        output: finalOutput,
        tokenUsage: getTokenUsage(data, cached),
        cached,
        cost: this.config.costCalculator(this.config.modelName, data.usage, requestConfig),
        raw: data,
        metadata: extractMetadata(data, processedOutput),
      };

      // Add annotations if present (for deep research citations)
      // This maintains backwards compatibility for code reading result.raw.annotations
      if (processedOutput.annotations && processedOutput.annotations.length > 0) {
        result.raw = { ...data, annotations: processedOutput.annotations };
      }

      return result;
    } catch (err) {
      return {
        error: `Error parsing response: ${String(err)}\nResponse: ${JSON.stringify(data)}`,
      };
    }
  }

  private async processOutput(output: any, context: ProcessorContext): Promise<ProcessedOutput> {
    // Log the structure for debugging deep research responses
    if (this.config.modelName.includes('deep-research')) {
      logger.debug(`Deep research response structure: ${JSON.stringify(context.data, null, 2)}`);
    }

    if (!output || !Array.isArray(output) || output.length === 0) {
      throw new Error('Invalid response format: Missing output array');
    }

    let result = '';
    let refusal = '';
    let isRefusal = false;
    const annotations: any[] = [];

    // Process all output items
    for (const item of output) {
      if (!item || typeof item !== 'object') {
        logger.warn(`Skipping invalid output item: ${JSON.stringify(item)}`);
        continue;
      }

      const processed = await this.processOutputItem(item, context);

      if (processed.isRefusal) {
        refusal = processed.content || '';
        isRefusal = true;
      } else if (processed.content) {
        if (result) {
          result += '\n' + processed.content;
        } else {
          result = processed.content;
        }
      }

      // Collect annotations
      if (processed.annotations) {
        annotations.push(...processed.annotations);
      }
    }

    return {
      result,
      refusal,
      isRefusal,
      annotations: annotations.length > 0 ? annotations : undefined,
    };
  }

  private async processOutputItem(
    item: ResponseOutputItem,
    context: ProcessorContext,
  ): Promise<{
    content?: string;
    isRefusal?: boolean;
    annotations?: any[];
  }> {
    switch (item.type) {
      case 'function_call':
        return await this.processFunctionCall(item, context);

      case 'message':
        return await this.processMessage(item, context);

      case 'tool_result':
        return this.processToolResult(item);

      case 'reasoning':
        return this.processReasoning(item);

      case 'web_search_call':
        return this.processWebSearch(item);

      case 'code_interpreter_call':
        return this.processCodeInterpreter(item);

      case 'mcp_list_tools':
        return this.processMcpListTools(item);

      case 'mcp_call':
        return this.processMcpCall(item);

      case 'mcp_approval_request':
        return this.processMcpApprovalRequest(item);

      default:
        logger.debug(`Unknown output item type: ${item.type}`);
        return {};
    }
  }

  private async processFunctionCall(
    item: any,
    context: ProcessorContext,
  ): Promise<{
    content?: string;
  }> {
    let functionResult: string;

    // Check if this is a meaningful function call or just a status update
    if (item.arguments === '{}' && item.status === 'completed') {
      // This appears to be a status update with no meaningful arguments
      // This often happens when using Chat API tool format with Responses API
      // In this case, return the function call info instead of trying to execute with empty args
      functionResult = JSON.stringify({
        type: 'function_call',
        name: item.name,
        status: 'no_arguments_provided',
        note: 'Function called but no arguments were extracted. Consider using the correct Responses API tool format.',
      });
    } else {
      // Normal function call with arguments - execute the callback
      functionResult = await this.config.functionCallbackHandler.processCalls(
        item,
        context.config.functionToolCallbacks,
      );
    }

    return { content: functionResult };
  }

  private async processMessage(
    item: any,
    context: ProcessorContext,
  ): Promise<{
    content?: string;
    isRefusal?: boolean;
    annotations?: any[];
  }> {
    if (item.role !== 'assistant') {
      return {};
    }

    let content = '';
    let isRefusal = false;
    let refusal = '';
    const annotations: any[] = [];

    if (item.content) {
      for (const contentItem of item.content) {
        if (!contentItem || typeof contentItem !== 'object') {
          logger.warn(`Skipping invalid content item: ${JSON.stringify(contentItem)}`);
          continue;
        }

        if (contentItem.type === 'output_text') {
          content += contentItem.text;
          // Preserve annotations for deep research citations
          if (Array.isArray(contentItem.annotations) && contentItem.annotations.length > 0) {
            annotations.push(...contentItem.annotations);
          }
        } else if (contentItem.type === 'tool_use' || contentItem.type === 'function_call') {
          // Handle function calls within message content
          const functionResult = await this.config.functionCallbackHandler.processCalls(
            contentItem,
            context.config.functionToolCallbacks,
          );
          content = functionResult;
        } else if (contentItem.type === 'refusal') {
          refusal = contentItem.refusal;
          isRefusal = true;
        }
      }
    } else if (item.refusal) {
      refusal = item.refusal;
      isRefusal = true;
    }

    return {
      content: isRefusal ? refusal : content,
      isRefusal,
      annotations: annotations.length > 0 ? annotations : undefined,
    };
  }

  private processToolResult(item: any): Promise<{ content?: string }> {
    return Promise.resolve({
      content: JSON.stringify(item),
    });
  }

  private processReasoning(item: any): Promise<{ content?: string }> {
    if (!item.summary || !item.summary.length) {
      return Promise.resolve({});
    }

    const reasoningText = `Reasoning: ${item.summary.map((s: { text: string }) => s.text).join('\n')}`;
    return Promise.resolve({ content: reasoningText });
  }

  private processWebSearch(item: any): Promise<{ content?: string }> {
    let content = '';
    const action = item.action;

    if (action) {
      if (action.type === 'search') {
        content = `Web Search: "${action.query}"`;
      } else if (action.type === 'open_page') {
        content = `Opening page: ${action.url}`;
      } else if (action.type === 'find_in_page') {
        content = `Finding in page: "${action.query}"`;
      } else {
        content = `Web action: ${action.type}`;
      }
    } else {
      content = `Web Search Call (status: ${item.status || 'unknown'})`;
    }

    if (item.status === 'failed' && item.error) {
      content += ` (Error: ${item.error})`;
    }

    return Promise.resolve({ content });
  }

  private processCodeInterpreter(item: any): Promise<{ content?: string }> {
    let content = `Code Interpreter: ${item.code || 'Running code...'}`;

    if (item.status === 'failed' && item.error) {
      content += ` (Error: ${item.error})`;
    }

    return Promise.resolve({ content });
  }

  private processMcpListTools(item: any): Promise<{ content?: string }> {
    const content = `MCP Tools from ${item.server_label}: ${JSON.stringify(item.tools, null, 2)}`;
    return Promise.resolve({ content });
  }

  private processMcpCall(item: any): Promise<{ content?: string }> {
    let content: string;

    if (item.error) {
      content = `MCP Tool Error (${item.name}): ${item.error}`;
    } else {
      content = `MCP Tool Result (${item.name}): ${item.output}`;
    }

    return Promise.resolve({ content });
  }

  private processMcpApprovalRequest(item: any): Promise<{ content?: string }> {
    const content = `MCP Approval Required for ${item.server_label}.${item.name}: ${item.arguments}`;
    return Promise.resolve({ content });
  }
}
