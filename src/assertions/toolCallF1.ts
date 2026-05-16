import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

/**
 * Extracts tool names from various output formats.
 *
 * Supports:
 * - OpenAI format: { tool_calls: [{ function: { name: "..." } }] }
 * - OpenAI direct array: [{ function: { name: "..." } }]
 * - Simple format: [{ name: "..." }]
 * - Anthropic format: { type: 'tool_use', name: '...' } or arrays of content blocks
 * - Google/Vertex format: { functionCall: { name: '...' } } or arrays
 * - Google Live format: { toolCall: { functionCalls: [...] } }
 * - String output: JSON-stringified versions of the above, including mixed text/JSON
 */
function extractToolNames(output: unknown): Set<string> {
  const names = new Set<string>();

  if (output === null || output === undefined) {
    return names;
  }
  if (typeof output === 'string') {
    addToolNamesFromString(output, names);
    return names;
  }
  if (Array.isArray(output)) {
    addToolNamesFromArray(output, names);
    return names;
  }
  if (typeof output === 'object') {
    addToolNamesFromObject(output as Record<string, unknown>, names);
  }
  return names;
}

function addExtractedNames(value: unknown, names: Set<string>): void {
  for (const name of extractToolNames(value)) {
    names.add(name);
  }
}

function addToolNamesFromString(output: string, names: Set<string>): void {
  try {
    addExtractedNames(JSON.parse(output), names);
    return;
  } catch {
    // Not valid JSON as a whole, continue to line-by-line parsing.
  }

  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      continue;
    }
    try {
      addExtractedNames(JSON.parse(trimmed), names);
    } catch {
      // Ignore non-JSON lines embedded in natural language output.
    }
  }
}

function addToolNamesFromObject(obj: Record<string, unknown>, names: Set<string>): void {
  if (Array.isArray(obj.tool_calls)) {
    addOpenAiToolCalls(obj.tool_calls, names);
    return;
  }
  if (obj.type === 'tool_use' && typeof obj.name === 'string') {
    names.add(obj.name);
    return;
  }
  if (isRecord(obj.functionCall)) {
    addNameFromRecord(obj.functionCall, names);
    return;
  }
  if (isRecord(obj.toolCall)) {
    addGoogleLiveToolCalls(obj.toolCall, names);
  }
}

function addToolNamesFromArray(output: unknown[], names: Set<string>): void {
  for (const item of output) {
    if (!isRecord(item)) {
      continue;
    }
    if (item.type === 'tool_use' && typeof item.name === 'string') {
      names.add(item.name);
      continue;
    }
    if (isRecord(item.functionCall)) {
      addNameFromRecord(item.functionCall, names);
      continue;
    }
    if (isRecord(item.function)) {
      addNameFromRecord(item.function, names);
      continue;
    }
    if (typeof item.name === 'string') {
      names.add(item.name);
    }
  }
}

function addOpenAiToolCalls(toolCalls: unknown[], names: Set<string>): void {
  for (const toolCall of toolCalls) {
    if (!isRecord(toolCall)) {
      continue;
    }
    if (isRecord(toolCall.function)) {
      addNameFromRecord(toolCall.function, names);
    }
    if (typeof toolCall.name === 'string') {
      names.add(toolCall.name);
    }
  }
}

function addGoogleLiveToolCalls(toolCall: Record<string, unknown>, names: Set<string>): void {
  if (!Array.isArray(toolCall.functionCalls)) {
    return;
  }
  for (const functionCall of toolCall.functionCalls) {
    if (isRecord(functionCall)) {
      addNameFromRecord(functionCall, names);
    }
  }
}

function addNameFromRecord(value: Record<string, unknown>, names: Set<string>): void {
  if (typeof value.name === 'string') {
    names.add(value.name);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Computes the F1 score for tool call evaluation.
 *
 * The F1 score is the harmonic mean of precision and recall, originally
 * introduced by van Rijsbergen (1979) for information retrieval evaluation.
 *
 * For tool calls:
 * - Precision = |actual ∩ expected| / |actual|
 *   "Of the tools called, how many were correct?"
 *
 * - Recall = |actual ∩ expected| / |expected|
 *   "Of the expected tools, how many were called?"
 *
 * - F1 = 2 × (precision × recall) / (precision + recall)
 *
 * This metric uses unordered set comparison - only the presence of tool names
 * matters, not the order or frequency of calls.
 *
 * @see http://www.dcs.gla.ac.uk/Keith/Preface.html - van Rijsbergen's "Information Retrieval"
 * @see https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/agents/#tool-call-f1
 */
export const handleToolCallF1 = ({
  assertion,
  output,
  renderedValue,
  inverse,
}: AssertionParams): GradingResult => {
  let expectedTools: string[];

  if (Array.isArray(renderedValue)) {
    expectedTools = renderedValue.map(String);
  } else if (typeof renderedValue === 'string') {
    expectedTools = renderedValue.split(',').map((s) => s.trim());
  } else {
    invariant(
      false,
      '"tool-call-f1" assertion requires a value: array of tool names or comma-separated string',
    );
  }

  if (expectedTools.length === 0) {
    invariant(false, '"tool-call-f1" assertion requires at least one expected tool name');
  }

  const expected = new Set(expectedTools);
  const actual = extractToolNames(output);

  // Compute F1 components using set intersection
  const intersection = [...expected].filter((t) => actual.has(t)).length;
  const precision = actual.size > 0 ? intersection / actual.size : 0;
  const recall = expected.size > 0 ? intersection / expected.size : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  const threshold = assertion.threshold ?? 1.0;
  const pass = f1 >= threshold !== inverse;

  const expectedList = [...expected].sort().join(', ');
  const actualList = [...actual].sort().join(', ') || '(none)';

  return {
    pass,
    score: f1,
    reason: pass
      ? `Tool Call F1: ${f1.toFixed(3)} (precision=${precision.toFixed(3)}, recall=${recall.toFixed(3)}). ` +
        `Expected: [${expectedList}], Called: [${actualList}]`
      : `Tool Call F1 score ${f1.toFixed(3)} is ${inverse ? 'above' : 'below'} threshold ${threshold}. ` +
        `Expected: [${expectedList}], Called: [${actualList}]. ` +
        `Precision=${precision.toFixed(3)}, Recall=${recall.toFixed(3)}`,
    assertion,
  };
};
