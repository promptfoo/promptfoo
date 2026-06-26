import { createFunctionCallValidator, type OpenAiFunction } from '../providers/openai/util';
import {
  type AssertionParams,
  type GradingResult,
  isFunctionToolCallValidationSetupError,
} from '../types/index';
import { maybeLoadToolsFromExternalFile } from '../util/index';
import { serializeAssertionOutput } from './utils';

interface OpenAiToolCall {
  type?: 'function';
  function: { arguments: string; name: string };
}

/** Allows Promptfoo's manual assertion tool to opt into its legacy rendered-MCP input contract. */
const PROMPTFOO_TRUSTED_MCP_RENDERED_OUTPUT = Symbol.for('promptfoo.trustedMcpRenderedOutput');

function isValidLookingToolCall(value: unknown): value is OpenAiToolCall {
  return (
    typeof value === 'object' &&
    value !== null &&
    (!('type' in value) || value.type === 'function') &&
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

export interface McpToolCallOutcome {
  error?: string;
  name: string;
}

export type StructuredMcpToolCalls =
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
    if (
      'error' in value &&
      value.error !== undefined &&
      value.error !== null &&
      typeof value.error !== 'string'
    ) {
      return { error: 'MCP tool call metadata is malformed' };
    }
    const error =
      'error' in value && typeof value.error === 'string' && value.error ? value.error : undefined;
    calls.push(
      value.status === 'error' || error
        ? { name: value.name, error: error ?? 'unknown error' }
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
  if (
    rawOutput.some(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        'type' in item &&
        item.type === 'mcp_approval_request',
    )
  ) {
    return { error: 'MCP tool call response is awaiting approval' };
  }
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
    if (
      'error' in value &&
      value.error !== undefined &&
      value.error !== null &&
      typeof value.error !== 'string'
    ) {
      return { error: 'MCP tool call response is malformed' };
    }
    if ('error' in value && typeof value.error === 'string' && value.error) {
      calls.push({ name: value.name, error: value.error });
      continue;
    }
    if ('status' in value && value.status === 'failed') {
      calls.push({ name: value.name, error: 'tool call status was failed' });
      continue;
    }
    const status = 'status' in value ? value.status : undefined;
    const hasOutput = 'output' in value;
    const output = hasOutput ? value.output : undefined;
    if (
      (status !== undefined && status !== 'completed') ||
      (hasOutput && output !== null && typeof output !== 'string') ||
      (!hasOutput && status !== 'completed')
    ) {
      return { error: `MCP tool call response for ${value.name} is incomplete or malformed` };
    }
    calls.push({ name: value.name });
  }
  return { calls };
}

export function getStructuredMcpToolCalls(
  providerResponse: AssertionParams['providerResponse'] | undefined,
): StructuredMcpToolCalls | undefined {
  const metadataResult = parseMetadataMcpToolCalls(providerResponse?.metadata?.mcpToolCalls);
  const rawResult = parseRawMcpToolCalls(providerResponse?.raw);
  if (metadataResult?.error) {
    return metadataResult;
  }
  if (rawResult?.error) {
    return rawResult;
  }
  const calls = [...(metadataResult?.calls ?? []), ...(rawResult?.calls ?? [])];
  return calls.length > 0 ? { calls } : undefined;
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

function wasMcpOutputTransformed({
  assertion,
  assertionTransformChanged,
  output,
  provider,
  providerResponse,
  test,
}: Pick<
  AssertionParams,
  'assertion' | 'assertionTransformChanged' | 'output' | 'provider' | 'providerResponse' | 'test'
>) {
  const isReferenceLike = (value: unknown) =>
    value !== null && (typeof value === 'object' || typeof value === 'function');
  const assertionChangedOutput =
    Boolean(assertion.transform) &&
    (assertionTransformChanged ??
      (isReferenceLike(providerResponse?.output) || !Object.is(output, providerResponse?.output)));
  const hasTestTransform = Boolean(test.options?.transform || test.options?.postprocess);
  const testChangedOutput =
    hasTestTransform &&
    (providerResponse?.testTransformChanged ??
      (providerResponse?.providerTransformedOutput === undefined ||
        isReferenceLike(providerResponse.providerTransformedOutput) ||
        !Object.is(providerResponse.output, providerResponse.providerTransformedOutput)));
  const providerChangedOutput =
    Boolean(provider?.transform) && providerResponse?.providerTransformChanged !== false;
  return assertionChangedOutput || testChangedOutput || providerChangedOutput;
}

function trustsRenderedMcpOutput(
  providerResponse: AssertionParams['providerResponse'] | undefined,
) {
  return (
    providerResponse === undefined ||
    (
      providerResponse as
        | (NonNullable<AssertionParams['providerResponse']> & {
            [PROMPTFOO_TRUSTED_MCP_RENDERED_OUTPUT]?: true;
          })
        | undefined
    )?.[PROMPTFOO_TRUSTED_MCP_RENDERED_OUTPUT] === true
  );
}

export const handleIsValidOpenAiToolsCall = async (
  {
    assertion,
    assertionTransformChanged,
    inverse,
    output,
    provider,
    providerResponse,
    test,
  }: AssertionParams,
  capturedMcpToolCalls?: StructuredMcpToolCalls | null,
): Promise<GradingResult> => {
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
  const outputWasTransformed = wasMcpOutputTransformed({
    assertion,
    assertionTransformChanged,
    output,
    provider,
    providerResponse,
    test,
  });
  const structuredMcpResult = outputWasTransformed
    ? undefined
    : capturedMcpToolCalls === undefined
      ? getStructuredMcpToolCalls(providerResponse)
      : (capturedMcpToolCalls ?? undefined);
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
  const hasStructuredMcpFailure =
    structuredMcpResult?.calls?.some((call) => call.error !== undefined) ?? false;
  const structuredMcpGrade = gradeMcpToolCalls(
    structuredMcpResult?.calls ?? [],
    assertion,
    inverse,
  );
  if (structuredMcpGrade && (!hasTraditionalToolCalls || hasStructuredMcpFailure)) {
    return structuredMcpGrade;
  }

  // Legacy direct callers may provide only the rendered string. Real dispatcher
  // calls always include providerResponse and therefore require structured MCP
  // provenance instead of trusting model-controlled marker text.
  const serializedMcpCalls =
    !hasTraditionalToolCalls && !outputWasTransformed && trustsRenderedMcpOutput(providerResponse)
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
    const serializedToolsOutput = serializeAssertionOutput(toolsOutput);
    return applyInverse(
      {
        pass: false,
        score: 0,
        reason: `OpenAI did not return a valid-looking tools response: ${serializedToolsOutput}`,
        assertion,
      },
      inverse,
    );
  }

  let tools = provider?.config?.tools;
  if (tools) {
    try {
      const loadedTools = await maybeLoadToolsFromExternalFile(tools, test.vars);
      if (loadedTools !== undefined) {
        tools = loadedTools;
      }
    } catch (error) {
      return {
        pass: false,
        score: 0,
        reason: (error as Error).message,
        assertion,
      };
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
    const validateToolCall = createFunctionCallValidator(functionDefinitions, test.vars);
    toolsOutput.forEach((toolOutput) => {
      validateToolCall(toolOutput.function);
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
