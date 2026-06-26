import { validateFunctionCall } from '../providers/openai/util';
import {
  type AssertionParams,
  type GradingResult,
  isFunctionToolCallValidationSetupError,
} from '../types/index';
import { maybeLoadToolsFromExternalFile } from '../util/index';

import type { OpenAiChatCompletionProvider } from '../providers/openai/chat';

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

function getMcpOutputText(output: unknown): string | undefined {
  if (typeof output === 'string') {
    return output;
  }
  if (
    typeof output === 'object' &&
    output !== null &&
    'content' in output &&
    typeof output.content === 'string'
  ) {
    return output.content;
  }
  return undefined;
}

interface McpToolCallOutcome {
  error?: string;
  name: string;
}

function toMcpToolCallOutcome(value: unknown): McpToolCallOutcome | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const name = 'name' in value && typeof value.name === 'string' ? value.name : 'unknown';
  const error = 'error' in value && value.error ? String(value.error) : undefined;
  return error ? { name, error } : { name };
}

function getStructuredMcpToolCalls(
  providerResponse: AssertionParams['providerResponse'],
): McpToolCallOutcome[] {
  const metadataCalls = providerResponse.metadata?.mcpToolCalls;
  if (Array.isArray(metadataCalls)) {
    const outcomes = metadataCalls
      .map(toMcpToolCallOutcome)
      .filter((outcome): outcome is McpToolCallOutcome => outcome !== undefined);
    if (outcomes.length > 0) {
      return outcomes;
    }
  }

  const rawOutput: unknown[] =
    typeof providerResponse.raw === 'object' &&
    providerResponse.raw !== null &&
    'output' in providerResponse.raw &&
    Array.isArray(providerResponse.raw.output)
      ? providerResponse.raw.output
      : [];
  return rawOutput
    .filter(
      (item) =>
        typeof item === 'object' && item !== null && 'type' in item && item.type === 'mcp_call',
    )
    .map(toMcpToolCallOutcome)
    .filter((outcome): outcome is McpToolCallOutcome => outcome !== undefined);
}

export const handleIsValidOpenAiToolsCall = async ({
  assertion,
  inverse,
  output,
  provider,
  providerResponse,
  test,
}: AssertionParams): Promise<GradingResult> => {
  // Traditional tool calls take precedence so model-controlled arguments cannot
  // be misclassified merely by containing an MCP result/error marker.
  let toolsOutput: unknown = output;
  const hasTraditionalToolCalls =
    Array.isArray(output) ||
    (output !== null && typeof output === 'object' && 'tool_calls' in output);
  if (!Array.isArray(output) && hasTraditionalToolCalls) {
    toolsOutput = (output as { tool_calls: unknown }).tool_calls;
  }

  // Prefer machine-readable MCP outcomes. Rendered tool content is untrusted and
  // may itself contain strings that look like result or error markers.
  const structuredMcpCalls = hasTraditionalToolCalls
    ? []
    : getStructuredMcpToolCalls(providerResponse);
  if (structuredMcpCalls.length > 0) {
    const failedCall = structuredMcpCalls.find((call) => call.error !== undefined);
    if (failedCall) {
      return applyInverse(
        {
          pass: false,
          score: 0,
          reason: `MCP tool call failed for ${failedCall.name}: ${failedCall.error}`,
          assertion,
        },
        inverse,
      );
    }
    return applyInverse(
      {
        pass: true,
        score: 1,
        reason: `MCP tool call succeeded for ${structuredMcpCalls[0].name}`,
        assertion,
      },
      inverse,
    );
  }

  // Retain compatibility with serialized MCP output, but only trust a leading
  // status marker. A later marker can be part of attacker-controlled tool data.
  const outputStr = hasTraditionalToolCalls ? undefined : getMcpOutputText(output);
  const mcpMatch = outputStr?.match(/^\s*MCP Tool (Result|Error)(?: \(([^)]+)\))?:[ \t]*(.*)/);
  if (mcpMatch) {
    const [, status, matchedToolName, detail] = mcpMatch;
    const toolName = matchedToolName || 'unknown';
    if (status === 'Error') {
      const errorMsg = matchedToolName && detail ? detail : 'unknown error';
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

  const functionDefinitions = tools.flatMap((tool) => {
    if (
      typeof tool === 'object' &&
      tool !== null &&
      'type' in tool &&
      tool.type === 'function' &&
      'function' in tool &&
      typeof tool.function === 'object' &&
      tool.function !== null
    ) {
      return [tool.function];
    }
    return [];
  });
  if (functionDefinitions.length === 0) {
    return {
      pass: false,
      score: 0,
      reason: 'No function tool schemas configured in provider, but output contains tool calls',
      assertion,
    };
  }
  try {
    toolsOutput.forEach((toolOutput) => {
      validateFunctionCall(toolOutput.function, functionDefinitions, test.vars);
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
    return isFunctionToolCallValidationSetupError(err) ? result : applyInverse(result, inverse);
  }
};
