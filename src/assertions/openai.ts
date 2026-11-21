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

  // Text may explain a failed call, but cannot prove that a tool ran.
  let outputStr: string;
  if (typeof output === 'string') {
    outputStr = output;
  } else if (
    output &&
    typeof output === 'object' &&
    !Array.isArray(output) &&
    !('tool_calls' in output) &&
    'content' in output &&
    typeof output.content === 'string'
  ) {
    outputStr = output.content;
  } else {
    outputStr = '';
  }

  // Match one header before examining the body. Even malformed subsequent
  // MCP records delimit the error, so approval arguments never enter the reason.
  const failure = /^[ \t]*MCP Tool Error\b/m.exec(outputStr);
  if (failure) {
    const rest = outputStr.slice(failure.index + failure[0].length);
    const header = /^(?: \(([^()\r\n]+)\))?:/.exec(rest);
    const body = header ? rest.slice(header[0].length) : '';
    const next = body.search(/[\r\n][ \t]*MCP\b/);
    const detail = (next < 0 ? body : body.slice(0, next)).trim() || 'unknown error';
    return verdict(false, 'MCP tool call failed for ' + (header?.[1] ?? 'unknown') + ': ' + detail);
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
    return verdict(false, 'OpenAI did not return a valid-looking tools response');
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
