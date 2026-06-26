import { type OpenAiFunction, validateFunctionCall } from '../providers/openai/util';
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
    value.function.name.trim().length > 0 &&
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

type StructuredMcpToolCalls =
  | { calls: McpToolCallOutcome[]; error?: never }
  | { calls?: never; error: string };

function parseMetadataMcpToolCalls(metadataCalls: unknown): StructuredMcpToolCalls | undefined {
  if (metadataCalls === undefined) {
    return undefined;
  }
  if (!Array.isArray(metadataCalls)) {
    return { error: 'MCP tool call metadata is malformed' };
  }
  const calls: McpToolCallOutcome[] = [];
  for (const value of metadataCalls) {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('name' in value) ||
      typeof value.name !== 'string' ||
      value.name.trim().length === 0 ||
      !('status' in value) ||
      (value.status !== 'success' && value.status !== 'error')
    ) {
      return { error: 'MCP tool call metadata is malformed' };
    }
    calls.push(
      value.status === 'error'
        ? {
            name: value.name,
            error:
              'error' in value && typeof value.error === 'string' && value.error
                ? value.error
                : 'unknown error',
          }
        : { name: value.name },
    );
  }
  return calls.length > 0 ? { calls } : undefined;
}

function parseRawMcpToolCalls(raw: unknown): StructuredMcpToolCalls | undefined {
  const rawOutput: unknown[] =
    typeof raw === 'object' && raw !== null && 'output' in raw && Array.isArray(raw.output)
      ? raw.output
      : [];
  const rawCalls = rawOutput.filter(
    (item) =>
      typeof item === 'object' && item !== null && 'type' in item && item.type === 'mcp_call',
  );
  if (rawCalls.length === 0) {
    return undefined;
  }

  const calls: McpToolCallOutcome[] = [];
  for (const value of rawCalls) {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('name' in value) ||
      typeof value.name !== 'string' ||
      value.name.trim().length === 0
    ) {
      return { error: 'MCP tool call response is malformed' };
    }
    if ('error' in value && value.error) {
      calls.push({ name: value.name, error: String(value.error) });
      continue;
    }
    if ('status' in value && value.status === 'failed') {
      calls.push({ name: value.name, error: 'tool call status was failed' });
      continue;
    }
    if (
      ('status' in value && value.status !== undefined && value.status !== 'completed') ||
      !('output' in value) ||
      (value.output !== null && typeof value.output !== 'string')
    ) {
      return { error: `MCP tool call response for ${value.name} is incomplete or malformed` };
    }
    calls.push({ name: value.name });
  }
  return { calls };
}

function getStructuredMcpToolCalls(
  providerResponse: AssertionParams['providerResponse'] | undefined,
): StructuredMcpToolCalls | undefined {
  return (
    parseMetadataMcpToolCalls(providerResponse?.metadata?.mcpToolCalls) ??
    parseRawMcpToolCalls(providerResponse?.raw)
  );
}

function getSerializedMcpToolCalls(output: unknown): McpToolCallOutcome[] {
  const outputStr = getMcpOutputText(output);
  if (!outputStr) {
    return [];
  }
  return [
    ...outputStr.matchAll(/^[ \t]*MCP Tool (Result|Error)(?: \(([^)]+)\))?:[ \t]*(.*)/gm),
  ].map(([, status, matchedToolName, detail]) => {
    const name = matchedToolName || 'unknown';
    return status === 'Error'
      ? { name, error: matchedToolName && detail ? detail : 'unknown error' }
      : { name };
  });
}

function gradeMcpToolCalls(
  calls: McpToolCallOutcome[],
  assertion: AssertionParams['assertion'],
  inverse: boolean,
): GradingResult | undefined {
  if (calls.length === 0) {
    return undefined;
  }
  const failedCall = calls.find((call) => call.error !== undefined);
  return applyInverse(
    failedCall
      ? {
          pass: false,
          score: 0,
          reason: `MCP tool call failed for ${failedCall.name}: ${failedCall.error}`,
          assertion,
        }
      : {
          pass: true,
          score: 1,
          reason: `MCP tool call succeeded for ${calls[0].name}`,
          assertion,
        },
    inverse,
  );
}

function getFunctionToolDefinitions(
  tools: unknown[],
): { definitions: OpenAiFunction[]; ok: true } | { error: string; ok: false } {
  const definitions: OpenAiFunction[] = [];
  for (const tool of tools) {
    if (
      typeof tool !== 'object' ||
      tool === null ||
      !('type' in tool) ||
      typeof tool.type !== 'string'
    ) {
      return { ok: false, error: 'Invalid tool schema configured in provider' };
    }
    if (tool.type !== 'function') {
      continue;
    }
    if (
      !('function' in tool) ||
      typeof tool.function !== 'object' ||
      tool.function === null ||
      !('name' in tool.function) ||
      typeof tool.function.name !== 'string' ||
      tool.function.name.trim().length === 0
    ) {
      return { ok: false, error: 'Invalid function tool schema configured in provider' };
    }
    definitions.push(tool.function as OpenAiFunction);
  }
  return { ok: true, definitions };
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
  const outputWasTransformed = Boolean(
    assertion.transform ||
      test.options?.transform ||
      test.options?.postprocess ||
      provider?.transform,
  );
  const structuredMcpResult =
    hasTraditionalToolCalls || outputWasTransformed
      ? undefined
      : getStructuredMcpToolCalls(providerResponse);
  if (structuredMcpResult?.error) {
    return applyInverse(
      {
        pass: false,
        score: 0,
        reason: structuredMcpResult.error,
        assertion,
      },
      inverse,
    );
  }
  const structuredMcpGrade = gradeMcpToolCalls(
    structuredMcpResult?.calls ?? [],
    assertion,
    inverse,
  );
  if (structuredMcpGrade) {
    return structuredMcpGrade;
  }

  // Legacy direct callers may provide only the rendered string. Real dispatcher
  // calls always include providerResponse and therefore require structured MCP
  // provenance instead of trusting model-controlled marker text.
  const serializedMcpCalls =
    !hasTraditionalToolCalls && !outputWasTransformed && providerResponse === undefined
      ? getSerializedMcpToolCalls(output)
      : [];
  const serializedMcpGrade = gradeMcpToolCalls(serializedMcpCalls, assertion, inverse);
  if (serializedMcpGrade) {
    return serializedMcpGrade;
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

  const functionTools = getFunctionToolDefinitions(tools);
  if (!functionTools.ok) {
    return {
      pass: false,
      score: 0,
      reason: functionTools.error,
      assertion,
    };
  }
  const functionDefinitions = functionTools.definitions;
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
