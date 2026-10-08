import { validateFunctionCall } from '../providers/openai/util';
import { maybeLoadToolsFromExternalFile } from '../util/index';
import { toolCallVerdict } from './functionToolCall';

import type { OpenAiChatCompletionProvider } from '../providers/openai/chat';
import type { AssertionParams, GradingResult } from '../types/index';

export const handleIsValidOpenAiToolsCall = async ({
  assertion,
  inverse,
  output,
  provider,
  test,
}: AssertionParams): Promise<GradingResult> => {
  const verdict = (valid: boolean, reason: string) =>
    toolCallVerdict(assertion, inverse, valid, reason, 'OpenAI tools call');

  // Handle MCP tool outputs from Responses API
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

  // Check for MCP tool results in the output
  if (outputStr.includes('MCP Tool Result') || outputStr.includes('MCP Tool Error')) {
    // For MCP tools, we validate that the tool call was successful
    if (outputStr.includes('MCP Tool Error')) {
      const errorMatch = outputStr.match(/MCP Tool Error \(([^)]+)\): (.+)/);
      const toolName = errorMatch ? errorMatch[1] : 'unknown';
      const errorMsg = errorMatch ? errorMatch[2] : 'unknown error';
      return verdict(false, `MCP tool call failed for ${toolName}: ${errorMsg}`);
    }

    // MCP tool call succeeded
    const resultMatch = outputStr.match(/MCP Tool Result \(([^)]+)\):/);
    const toolName = resultMatch ? resultMatch[1] : 'unknown';
    return verdict(true, `MCP tool call succeeded for ${toolName}`);
  }

  // Handle traditional OpenAI function/tool calls
  if (typeof output === 'object' && 'tool_calls' in output) {
    output = output.tool_calls as string | object;
  }
  const toolsOutput = output as {
    type: 'function';
    function: { arguments: string; name: string };
  }[];
  if (
    !Array.isArray(toolsOutput) ||
    toolsOutput.length === 0 ||
    toolsOutput.some(
      (toolCall) =>
        typeof toolCall?.function?.name !== 'string' ||
        typeof toolCall?.function?.arguments !== 'string',
    )
  ) {
    return verdict(
      false,
      `OpenAI did not return a valid-looking tools response: ${JSON.stringify(toolsOutput)}`,
    );
  }

  let tools = (provider as OpenAiChatCompletionProvider).config.tools;
  if (tools) {
    const loadedTools = await maybeLoadToolsFromExternalFile(tools, test.vars);
    if (loadedTools !== undefined) {
      tools = loadedTools;
    }
  }

  // Tools must be defined when validating tool calls. Missing tools is a
  // configuration error, so it fails under `not-` too.
  if (!tools) {
    return {
      pass: false,
      score: 0,
      reason: 'No tools configured in provider, but output contains tool calls',
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
    return verdict(true, 'Assertion passed');
  } catch (err) {
    return verdict(false, (err as Error).message);
  }
};
