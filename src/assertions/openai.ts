import { validateFunctionCall } from '../providers/openai/util';
import { maybeLoadToolsFromExternalFile } from '../util/index';
import { toolCallErrorVerdict, toolCallVerdict } from './functionToolCall';

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

  // Only top-level MCP records are text responses. Never inspect arguments
  // or unrelated metadata, and always validate structured calls below.
  const text =
    typeof output === 'string'
      ? output
      : output &&
          typeof output === 'object' &&
          !Array.isArray(output) &&
          !('tool_calls' in output) &&
          'content' in output &&
          typeof output.content === 'string'
        ? output.content
        : '';
  if (/^[ \t]*MCP Tool Error\b/m.test(text)) {
    const error = /^[ \t]*MCP Tool Error \(([^()\r\n]+)\): (.+)/m.exec(text);
    return verdict(
      false,
      'MCP tool call failed for ' +
        (error?.[1] ?? 'unknown') +
        ': ' +
        (error?.[2] ?? 'unknown error'),
    );
  }
  // Handle traditional OpenAI function/tool calls
  if (output && typeof output === 'object' && 'tool_calls' in output) {
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

  let tools: unknown = (provider as OpenAiChatCompletionProvider).config?.tools;
  try {
    if (tools) {
      const loadedTools = await maybeLoadToolsFromExternalFile(tools, test.vars);
      if (loadedTools !== undefined) {
        tools = loadedTools;
      }
    }
  } catch (err) {
    return toolCallErrorVerdict(assertion, inverse, err, 'OpenAI tools call');
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
  if (
    !Array.isArray(tools) ||
    tools.some(
      (tool) =>
        !tool ||
        typeof tool !== 'object' ||
        typeof tool.type !== 'string' ||
        (tool.type === 'function' && !('function' in tool)),
    )
  ) {
    return {
      pass: false,
      score: 0,
      reason: 'Expected tools to be an array of tool definitions',
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
    return toolCallErrorVerdict(assertion, inverse, err, 'OpenAI tools call');
  }
};
