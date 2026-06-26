import { FunctionToolCallValidationSetupError } from '../providers/functionToolCallValidation';
import { validateFunctionCall } from '../providers/openai/util';
import { maybeLoadToolsFromExternalFile } from '../util/index';

import type { OpenAiChatCompletionProvider } from '../providers/openai/chat';
import type { AssertionParams, GradingResult } from '../types/index';

interface OpenAiToolCall {
  function: { arguments: string; name: string };
}

function isValidLookingToolCall(value: unknown): value is OpenAiToolCall {
  return (
    typeof value === 'object' &&
    value !== null &&
    'function' in value &&
    typeof value.function === 'object' &&
    value.function !== null &&
    'name' in value.function &&
    typeof value.function.name === 'string' &&
    'arguments' in value.function &&
    typeof value.function.arguments === 'string'
  );
}

function applyInverse(result: GradingResult, inverse: boolean): GradingResult {
  if (!inverse) {
    return result;
  }
  const pass = !result.pass;
  return {
    ...result,
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? result.reason
      : 'Expected output to not be a valid OpenAI tools call, but it was',
  };
}

export const handleIsValidOpenAiToolsCall = async ({
  assertion,
  inverse,
  output,
  provider,
  test,
}: AssertionParams): Promise<GradingResult> => {
  // Handle MCP tool outputs from Responses API
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

  // Check for MCP tool results in the output
  if (outputStr.includes('MCP Tool Result') || outputStr.includes('MCP Tool Error')) {
    // For MCP tools, we validate that the tool call was successful
    if (outputStr.includes('MCP Tool Error')) {
      const errorMatch = outputStr.match(/MCP Tool Error \(([^)]+)\): (.+)/);
      const toolName = errorMatch ? errorMatch[1] : 'unknown';
      const errorMsg = errorMatch ? errorMatch[2] : 'unknown error';
      return applyInverse(
        {
          pass: false,
          score: 0,
          reason: `MCP tool call failed for ${toolName}: ${errorMsg}`,
          assertion,
        },
        inverse,
      );
    }

    // MCP tool call succeeded
    const resultMatch = outputStr.match(/MCP Tool Result \(([^)]+)\):/);
    const toolName = resultMatch ? resultMatch[1] : 'unknown';
    return applyInverse(
      {
        pass: true,
        score: 1,
        reason: `MCP tool call succeeded for ${toolName}`,
        assertion,
      },
      inverse,
    );
  }

  // Handle traditional OpenAI function/tool calls
  let toolsOutput: unknown = output;
  if (output !== null && typeof output === 'object' && 'tool_calls' in output) {
    toolsOutput = output.tool_calls;
  }
  if (
    !Array.isArray(toolsOutput) ||
    toolsOutput.length === 0 ||
    !toolsOutput.every(isValidLookingToolCall)
  ) {
    return applyInverse(
      {
        pass: false,
        score: 0,
        reason: `OpenAI did not return a valid-looking tools response: ${JSON.stringify(
          toolsOutput,
        )}`,
        assertion,
      },
      inverse,
    );
  }

  let tools = (provider as OpenAiChatCompletionProvider).config.tools;
  if (tools) {
    const loadedTools = await maybeLoadToolsFromExternalFile(tools, test.vars);
    if (loadedTools !== undefined) {
      tools = loadedTools;
    }
  }

  // Tools must be defined when validating tool calls
  if (!tools) {
    return {
      pass: false,
      score: 0,
      reason: 'No tools configured in provider, but output contains tool calls',
      assertion,
    };
  }
  if (!Array.isArray(tools)) {
    return {
      pass: false,
      score: 0,
      reason: 'Provider tools configuration did not resolve to an array',
      assertion,
    };
  }
  try {
    toolsOutput.forEach((toolOutput) => {
      validateFunctionCall(
        toolOutput.function,
        tools
          .filter((tool) => tool.type === 'function' && 'function' in tool)
          .map((tool) => tool.function),
        test.vars,
      );
    });
    return applyInverse(
      {
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion,
      },
      inverse,
    );
  } catch (err) {
    const result: GradingResult = {
      pass: false,
      score: 0,
      reason: (err as Error).message,
      assertion,
    };
    return err instanceof FunctionToolCallValidationSetupError
      ? result
      : applyInverse(result, inverse);
  }
};
