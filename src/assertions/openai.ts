import type { OpenAiChatCompletionProvider } from '../providers/openai/chat';
import { validateFunctionCall } from '../providers/openai/util';
import type { AssertionParams } from '../types';
import type { GradingResult } from '../types';
import { maybeLoadToolsFromExternalFile } from '../util';
import invariant from '../util/invariant';

export const handleIsValidOpenAiToolsCall = ({
  assertion,
  output,
  provider,
  test,
}: AssertionParams): GradingResult => {
  // Handle MCP tool outputs from Responses API
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

  // Check for MCP tool results in the output
  if (outputStr.includes('MCP Tool Result') || outputStr.includes('MCP Tool Error')) {
    // For MCP tools, we validate that the tool call was successful
    if (outputStr.includes('MCP Tool Error')) {
      const errorMatch = outputStr.match(/MCP Tool Error \(([^)]+)\): (.+)/);
      const toolName = errorMatch ? errorMatch[1] : 'unknown';
      const errorMsg = errorMatch ? errorMatch[2] : 'unknown error';
      return {
        pass: false,
        score: 0,
        reason: `MCP tool call failed for ${toolName}: ${errorMsg}`,
        assertion,
      };
    }

    // MCP tool call succeeded
    const resultMatch = outputStr.match(/MCP Tool Result \(([^)]+)\):/);
    const toolName = resultMatch ? resultMatch[1] : 'unknown';
    return {
      pass: true,
      score: 1,
      reason: `MCP tool call succeeded for ${toolName}`,
      assertion,
    };
  }

  // Handle traditional OpenAI function/tool calls
  if (typeof output === 'object' && 'tool_calls' in output) {
    output = (output as { tool_calls: any }).tool_calls;
  }
  const toolsOutput = output as {
    type: 'function';
    function: { arguments: string; name: string };
  }[];
  if (
    !Array.isArray(toolsOutput) ||
    toolsOutput.length === 0 ||
    typeof toolsOutput[0].function.name !== 'string' ||
    typeof toolsOutput[0].function.arguments !== 'string'
  ) {
    return {
      pass: false,
      score: 0,
      reason: `OpenAI did not return a valid-looking tools response: ${JSON.stringify(
        toolsOutput,
      )}`,
      assertion,
    };
  }

  let tools = (provider as OpenAiChatCompletionProvider).config.tools;
  if (tools) {
    tools = maybeLoadToolsFromExternalFile(tools, test.vars);
  }
  invariant(
    tools,
    `Tools are expected to be an array of objects with a function property. Got: ${JSON.stringify(
      tools,
    )}`,
  );
  try {
    toolsOutput.forEach((toolOutput) => {
      validateFunctionCall(
        toolOutput.function,
        tools.filter((tool) => tool.type === 'function').map((tool) => tool.function),
        test.vars,
      );
    });
    return {
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion,
    };
  } catch (err) {
    return {
      pass: false,
      score: 0,
      reason: (err as Error).message,
      assertion,
    };
  }
};
