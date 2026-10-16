import { validateFunctionCall } from '../providers/openai/util';
import { maybeLoadToolsFromExternalFile } from '../util/index';
import { toolCallErrorVerdict, toolCallVerdict } from './functionToolCall';

import type { OpenAiChatCompletionProvider } from '../providers/openai/chat';
import type { AssertionParams, GradingResult } from '../types/index';

function collectRawToolCalls(responseItems: unknown[]) {
  return responseItems
    .flatMap((item) => {
      // Match the Responses processor's one-level assistant message traversal.
      // Text, annotations, and content from other roles are not tool-call evidence.
      if (
        item !== null &&
        typeof item === 'object' &&
        'type' in item &&
        item.type === 'message' &&
        'role' in item &&
        item.role === 'assistant' &&
        'content' in item &&
        Array.isArray(item.content)
      ) {
        return [item, ...item.content];
      }
      return [item];
    })
    .filter(
      (item): item is Record<string, unknown> =>
        item !== null &&
        typeof item === 'object' &&
        (('type' in item &&
          (item.type === 'function_call' ||
            item.type === 'tool_use' ||
            item.type === 'custom_tool_call')) ||
          'function' in item),
    )
    .map((item) => {
      if (item.type === 'function_call' || item.type === 'tool_use') {
        return {
          type: 'function',
          function: { name: item.name, arguments: item.arguments },
        };
      }
      // Retain other tool-shaped calls for discriminator validation without
      // including their payloads. Other Responses items are not function calls.
      return { type: item.type };
    });
}

export const handleIsValidOpenAiToolsCall = async ({
  assertion,
  inverse,
  output,
  provider,
  providerResponse,
  test,
}: AssertionParams): Promise<GradingResult> => {
  const verdict = (valid: boolean, reason: string) =>
    toolCallVerdict(assertion, inverse, valid, reason, 'OpenAI tools call');

  // Display text is model-controlled. Only provider-owned response items or
  // execution metadata establish whether an MCP tool actually succeeded.
  const responseItems: unknown[] = Array.isArray(providerResponse.raw?.output)
    ? providerResponse.raw.output
    : [];
  const rawToolCalls = collectRawToolCalls(responseItems);
  const retainedToolCalls: unknown[] | undefined = Array.isArray(
    providerResponse.metadata?.functionToolCalls,
  )
    ? providerResponse.metadata.functionToolCalls
    : undefined;
  // Chat callbacks can replace or omit ordinary calls from display output. The
  // provider retains those calls separately from calls routed to MCP execution.
  if (retainedToolCalls) {
    output = retainedToolCalls;
  }
  const hasOutputToolCalls =
    Array.isArray(output) || (output && typeof output === 'object' && 'tool_calls' in output);
  const mcpCalls = responseItems
    .filter(
      (item): item is Record<string, unknown> =>
        item !== null && typeof item === 'object' && 'type' in item && item.type === 'mcp_call',
    )
    .map((item) => ({
      name: item.name,
      success:
        item.error == null &&
        (item.status === 'completed' ||
          (item.status === undefined && typeof item.output === 'string')),
    }));
  const executedCalls: unknown[] = Array.isArray(providerResponse.metadata?.toolCalls)
    ? providerResponse.metadata.toolCalls
    : [];
  for (const call of executedCalls) {
    mcpCalls.push({
      name: call !== null && typeof call === 'object' && 'name' in call ? call.name : undefined,
      success:
        call !== null &&
        typeof call === 'object' &&
        'is_error' in call &&
        call.is_error === false &&
        Object.prototype.hasOwnProperty.call(call, 'output'),
    });
  }
  if (mcpCalls.length > 0) {
    const failedCall = mcpCalls.find(
      (call) => !call.success || typeof call.name !== 'string' || !call.name,
    );
    if (failedCall) {
      const toolName = typeof failedCall.name === 'string' ? failedCall.name : 'unknown';
      return verdict(false, `MCP tool call failed for ${toolName}`);
    }
    // Responses can render function calls or callback results as text. Successful
    // MCP execution must not bypass either raw or retained function-call checks.
    if (rawToolCalls.length === 0 && (!hasOutputToolCalls || retainedToolCalls?.length === 0)) {
      return verdict(true, `MCP tool call succeeded for ${mcpCalls[0].name}`);
    }
  }

  // Handle traditional OpenAI function/tool calls
  if (output && typeof output === 'object' && 'tool_calls' in output) {
    output = output.tool_calls as string | object;
  }
  if (Array.isArray(output)) {
    output = [...output, ...rawToolCalls];
  } else if (rawToolCalls.length > 0 && !hasOutputToolCalls) {
    output = rawToolCalls;
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
        toolCall?.type !== 'function' ||
        typeof toolCall?.function?.name !== 'string' ||
        typeof toolCall?.function?.arguments !== 'string',
    )
  ) {
    return verdict(false, 'OpenAI did not return a valid-looking tools response');
  }

  let tools = (provider as OpenAiChatCompletionProvider).config?.tools;
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
    tools.some((tool) => !tool || typeof tool !== 'object' || typeof tool.type !== 'string')
  ) {
    return {
      pass: false,
      score: 0,
      reason: 'Expected tools to be an array of tool definitions',
      assertion,
    };
  }
  try {
    // Responses uses flat definitions; Chat Completions wraps them in `function`.
    // Retain malformed wrapped definitions so the schema validator rejects them.
    const functions = tools
      .filter((tool) => tool.type === 'function')
      .map((tool) => ('function' in tool ? tool.function : tool));
    toolsOutput.forEach((toolOutput) => {
      validateFunctionCall(toolOutput.function, functions, test.vars);
    });
    return verdict(true, 'Assertion passed');
  } catch (err) {
    return toolCallErrorVerdict(assertion, inverse, err, 'OpenAI tools call');
  }
};
