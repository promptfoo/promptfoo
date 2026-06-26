import { types as nodeUtilTypes } from 'node:util';

import { createFunctionCallValidator, type OpenAiFunction } from '../providers/openai/util';
import {
  type AssertionParams,
  type GradingResult,
  isFunctionToolCallValidationSetupError,
} from '../types/index';
import { maybeLoadToolsFromExternalFile } from '../util/index';
import { getValidationErrorMessage } from './functionToolCall';
import { serializeAssertionOutput } from './utils';

interface OpenAiToolCall {
  type?: 'function';
  function: { arguments: string; name: string };
}

/** Allows Promptfoo's manual assertion tool to opt into its legacy rendered-MCP input contract. */
const PROMPTFOO_TRUSTED_MCP_RENDERED_OUTPUT = Symbol.for('promptfoo.trustedMcpRenderedOutput');

function isProxyValue(value: unknown): boolean {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    nodeUtilTypes.isProxy(value)
  );
}

function isValidLookingToolCall(value: unknown): value is OpenAiToolCall {
  const type = readOwnDataProperty(value, 'type');
  const fn = readOwnDataProperty(value, 'function');
  if (
    !type.ok ||
    (type.value !== undefined && type.value !== 'function') ||
    !fn.ok ||
    typeof fn.value !== 'object' ||
    fn.value === null
  ) {
    return false;
  }
  const name = readOwnDataProperty(fn.value, 'name');
  const args = readOwnDataProperty(fn.value, 'arguments');
  return (
    name.ok &&
    typeof name.value === 'string' &&
    name.value.trim().length > 0 &&
    args.ok &&
    typeof args.value === 'string'
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
  | { calls: McpToolCallOutcome[]; error?: never; incomplete?: boolean }
  | { calls?: never; error: string; incomplete?: never };

function readOwnDataProperty(
  value: unknown,
  key: PropertyKey,
): { ok: true; value: unknown } | { ok: false } {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return { ok: false };
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) {
      return { ok: true, value: undefined };
    }
    return 'value' in descriptor ? { ok: true, value: descriptor.value } : { ok: false };
  } catch {
    return { ok: false };
  }
}

function materializeDenseArray(value: unknown[]): unknown[] | undefined {
  try {
    if (isProxyValue(value)) {
      return undefined;
    }
    const indexCount = Object.keys(value).filter((key) => {
      const index = Number(key);
      return Number.isInteger(index) && index >= 0 && index < value.length && String(index) === key;
    }).length;
    if (indexCount !== value.length) {
      return undefined;
    }

    const copy: unknown[] = [];
    for (let index = 0; index < value.length; index++) {
      const item = readOwnDataProperty(value, String(index));
      if (!item.ok) {
        return undefined;
      }
      copy.push(item.value);
    }
    return copy;
  } catch {
    return undefined;
  }
}

function parseMetadataMcpToolCalls(
  metadataCalls: unknown,
  complete: unknown,
): StructuredMcpToolCalls | undefined {
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
  if (complete !== undefined && typeof complete !== 'boolean') {
    return { error: 'MCP tool call metadata is malformed' };
  }
  return calls.length > 0
    ? { calls, ...(complete === false ? { incomplete: true } : {}) }
    : undefined;
}

function parseRawMcpToolCalls(rawOutputValue: unknown): StructuredMcpToolCalls | undefined {
  const rawOutput: unknown[] = Array.isArray(rawOutputValue) ? rawOutputValue : [];
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
  const incomplete = rawOutput.some(
    (item) =>
      typeof item === 'object' && item !== null && 'type' in item && item.type === 'function_call',
  );

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
  return { calls, ...(incomplete ? { incomplete: true } : {}) };
}

export function parseStructuredMcpToolCalls(
  metadataCalls: unknown,
  metadataComplete: unknown,
  rawOutput: unknown,
): StructuredMcpToolCalls | undefined {
  const metadataResult = parseMetadataMcpToolCalls(metadataCalls, metadataComplete);
  if (metadataResult?.error) {
    return metadataResult;
  }
  const rawResult = parseRawMcpToolCalls(rawOutput);
  if (rawResult?.error) {
    return rawResult;
  }
  const calls = [...(metadataResult?.calls ?? []), ...(rawResult?.calls ?? [])];
  const incomplete = Boolean(
    metadataComplete === false || metadataResult?.incomplete || rawResult?.incomplete,
  );
  return calls.length > 0 || incomplete
    ? { calls, ...(incomplete ? { incomplete: true } : {}) }
    : undefined;
}

export function getStructuredMcpToolCalls(
  providerResponse: AssertionParams['providerResponse'] | undefined,
): StructuredMcpToolCalls | undefined {
  if (!providerResponse) {
    return undefined;
  }
  try {
    const metadataProperty = readOwnDataProperty(providerResponse, 'metadata');
    if (!metadataProperty.ok) {
      return { error: 'MCP tool call metadata is malformed' };
    }
    let metadataCalls: unknown;
    let metadataComplete: unknown;
    if (metadataProperty.value !== undefined) {
      const callsProperty = readOwnDataProperty(metadataProperty.value, 'mcpToolCalls');
      const completeProperty = readOwnDataProperty(metadataProperty.value, 'mcpToolCallsComplete');
      if (!callsProperty.ok || !completeProperty.ok) {
        return { error: 'MCP tool call metadata is malformed' };
      }
      metadataCalls = callsProperty.value;
      metadataComplete = completeProperty.value;
    }

    const rawProperty = readOwnDataProperty(providerResponse, 'raw');
    if (!rawProperty.ok) {
      return { error: 'MCP tool call response is malformed' };
    }
    let rawOutput: unknown;
    if (
      rawProperty.value !== undefined &&
      typeof rawProperty.value === 'object' &&
      rawProperty.value !== null
    ) {
      const outputProperty = readOwnDataProperty(rawProperty.value, 'output');
      if (!outputProperty.ok) {
        return { error: 'MCP tool call response is malformed' };
      }
      rawOutput = outputProperty.value;
    }
    return parseStructuredMcpToolCalls(metadataCalls, metadataComplete, rawOutput);
  } catch {
    return { error: 'MCP tool call provenance is malformed' };
  }
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

function getTraditionalToolCalls(
  output: unknown,
): { hasCalls: boolean; ok: true; output: unknown } | { error: string; ok: false } {
  try {
    if (isProxyValue(output)) {
      return { error: 'OpenAI tools response is malformed', ok: false };
    }
    if (Array.isArray(output)) {
      const calls = materializeDenseArray(output);
      return calls
        ? { hasCalls: true, ok: true, output: calls }
        : { error: 'OpenAI tools response is malformed', ok: false };
    }
    if (typeof output !== 'object' || output === null) {
      return { hasCalls: false, ok: true, output };
    }
    const toolCalls = readOwnDataProperty(output, 'tool_calls');
    if (!toolCalls.ok) {
      return { error: 'OpenAI tools response is malformed', ok: false };
    }
    if (toolCalls.value === undefined) {
      return { hasCalls: false, ok: true, output };
    }
    if (isProxyValue(toolCalls.value)) {
      return { error: 'OpenAI tools response is malformed', ok: false };
    }
    if (Array.isArray(toolCalls.value)) {
      const calls = materializeDenseArray(toolCalls.value);
      return calls
        ? { hasCalls: true, ok: true, output: calls }
        : { error: 'OpenAI tools response is malformed', ok: false };
    }
    return { hasCalls: true, ok: true, output: toolCalls.value };
  } catch {
    return { error: 'OpenAI tools response is malformed', ok: false };
  }
}

function getFunctionToolDefinitions(
  tools: unknown[],
): { definitions: OpenAiFunction[]; ok: true } | { error: string; ok: false } {
  try {
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
  } catch (error) {
    return { ok: false, error: getValidationErrorMessage(error) };
  }
}

export function wasMcpProviderOrTestOutputTransformed({
  provider,
  providerResponse,
  test,
}: Pick<AssertionParams, 'provider' | 'providerResponse' | 'test'>): boolean {
  try {
    const isReferenceLike = (value: unknown) =>
      value !== null && (typeof value === 'object' || typeof value === 'function');
    const hasTestTransform = Boolean(test.options?.transform || test.options?.postprocess);
    const testChangedOutput =
      providerResponse?.testTransformChanged === true ||
      (hasTestTransform &&
        providerResponse?.testTransformChanged !== false &&
        (providerResponse?.providerTransformedOutput === undefined ||
          isReferenceLike(providerResponse.providerTransformedOutput) ||
          !Object.is(providerResponse.output, providerResponse.providerTransformedOutput)));
    const providerChangedOutput =
      providerResponse?.providerTransformChanged === true ||
      (Boolean(provider?.transform) && providerResponse?.providerTransformChanged !== false);
    return testChangedOutput || providerChangedOutput;
  } catch {
    return true;
  }
}

export function trustsRenderedMcpOutput(
  providerResponse: AssertionParams['providerResponse'] | undefined,
): boolean {
  if (providerResponse === undefined) {
    return true;
  }
  if (providerResponse === null) {
    return false;
  }
  try {
    return (
      Object.getOwnPropertyDescriptor(providerResponse, PROMPTFOO_TRUSTED_MCP_RENDERED_OUTPUT)
        ?.value === true
    );
  } catch {
    return false;
  }
}

interface CapturedMcpAssertionState {
  outputWasTransformed: boolean;
  trustedRenderedOutput?: string;
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
  capturedState?: CapturedMcpAssertionState,
): Promise<GradingResult> => {
  // Prefer machine-readable MCP outcomes. Rendered tool content is untrusted and
  // may itself contain strings that look like result or error markers.
  const assertionOutputWasTransformed =
    Boolean(assertion.transform) &&
    (assertionTransformChanged ??
      ((output !== null && (typeof output === 'object' || typeof output === 'function')) ||
        !Object.is(output, providerResponse?.output)));
  const outputWasTransformed =
    capturedState?.outputWasTransformed ??
    (wasMcpProviderOrTestOutputTransformed({ provider, providerResponse, test }) ||
      assertionOutputWasTransformed);
  const effectiveOutput =
    !outputWasTransformed && capturedState?.trustedRenderedOutput !== undefined
      ? capturedState.trustedRenderedOutput
      : output;
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
  if (structuredMcpGrade && hasStructuredMcpFailure) {
    return structuredMcpGrade;
  }
  if (structuredMcpResult?.incomplete) {
    return {
      pass: false,
      score: 0,
      reason: 'MCP tool call provenance does not cover every tool call in the response',
      assertion,
    };
  }
  // Traditional tool calls take precedence so model-controlled arguments cannot
  // be misclassified merely by containing an MCP result/error marker.
  const traditionalToolCalls = getTraditionalToolCalls(effectiveOutput);
  if (!traditionalToolCalls.ok) {
    return applyInverse(
      {
        pass: false,
        score: 0,
        reason: traditionalToolCalls.error,
        assertion,
      },
      inverse,
    );
  }
  const { hasCalls: hasTraditionalToolCalls, output: toolsOutput } = traditionalToolCalls;
  if (structuredMcpGrade && !hasTraditionalToolCalls) {
    return structuredMcpGrade;
  }

  // Legacy direct callers may provide only the rendered string. Real dispatcher
  // calls always include providerResponse and therefore require structured MCP
  // provenance instead of trusting model-controlled marker text.
  const serializedMcpCalls =
    !hasTraditionalToolCalls &&
    !outputWasTransformed &&
    (capturedState
      ? capturedState.trustedRenderedOutput !== undefined
      : trustsRenderedMcpOutput(providerResponse))
      ? getSerializedMcpToolCalls(effectiveOutput)
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
        reason: getValidationErrorMessage(error),
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
      reason: getValidationErrorMessage(err),
      assertion,
    };
    return isFunctionToolCallValidationSetupError(err) ? result : applyInverse(result, inverse);
  }
};
