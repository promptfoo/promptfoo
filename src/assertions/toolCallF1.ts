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

type AnyRecord = Record<string, unknown>;

function extractFromOpenAiToolCalls(toolCalls: unknown[]): Set<string> {
  const names = new Set<string>();
  for (const tc of toolCalls) {
    if (!tc || typeof tc !== 'object') {
      continue;
    }
    const toolCall = tc as AnyRecord;
    if (toolCall.function && typeof toolCall.function === 'object') {
      const fn = toolCall.function as AnyRecord;
      if (typeof fn.name === 'string') {
        names.add(fn.name);
      }
    }
    if (typeof toolCall.name === 'string') {
      names.add(toolCall.name);
    }
  }
  return names;
}

function extractFromGoogleLiveToolCall(toolCall: AnyRecord): Set<string> {
  const names = new Set<string>();
  if ('functionCalls' in toolCall && Array.isArray(toolCall.functionCalls)) {
    for (const fc of toolCall.functionCalls) {
      if (fc && typeof fc === 'object' && typeof (fc as AnyRecord).name === 'string') {
        names.add((fc as AnyRecord).name as string);
      }
    }
  }
  return names;
}

function extractFromArrayItem(block: AnyRecord): string | null {
  if (block.type === 'tool_use' && typeof block.name === 'string') {
    return block.name;
  }
  if ('functionCall' in block && block.functionCall && typeof block.functionCall === 'object') {
    const fc = block.functionCall as AnyRecord;
    if (typeof fc.name === 'string') {
      return fc.name;
    }
  }
  if (block.function && typeof block.function === 'object') {
    const fn = block.function as AnyRecord;
    if (typeof fn.name === 'string') {
      return fn.name;
    }
  }
  if (typeof block.name === 'string') {
    return block.name;
  }
  return null;
}

function extractFromArray(output: unknown[]): Set<string> {
  const names = new Set<string>();
  for (const item of output) {
    if (item && typeof item === 'object') {
      const name = extractFromArrayItem(item as AnyRecord);
      if (name !== null) {
        names.add(name);
      }
    }
  }
  return names;
}

function extractFromObject(obj: AnyRecord): Set<string> {
  const names = new Set<string>();

  if ('tool_calls' in obj && Array.isArray(obj.tool_calls)) {
    return extractFromOpenAiToolCalls(obj.tool_calls);
  }

  if (obj.type === 'tool_use' && typeof obj.name === 'string') {
    names.add(obj.name);
    return names;
  }

  if ('functionCall' in obj && obj.functionCall && typeof obj.functionCall === 'object') {
    const fc = obj.functionCall as AnyRecord;
    if (typeof fc.name === 'string') {
      names.add(fc.name);
    }
    return names;
  }

  if ('toolCall' in obj && obj.toolCall && typeof obj.toolCall === 'object') {
    return extractFromGoogleLiveToolCall(obj.toolCall as AnyRecord);
  }

  return names;
}

function extractFromString(output: string): Set<string> {
  const names = new Set<string>();

  try {
    const parsed = JSON.parse(output);
    return extractToolNames(parsed);
  } catch {
    // Not valid JSON as a whole, try line-by-line
  }

  // Handle Anthropic-style output: text and JSON objects separated by newlines
  const lines = output.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed);
      for (const name of extractToolNames(parsed)) {
        names.add(name);
      }
    } catch {
      // Not valid JSON, ignore this line
    }
  }
  return names;
}

function extractToolNames(output: unknown): Set<string> {
  if (output === null || output === undefined) {
    return new Set<string>();
  }

  if (typeof output === 'string') {
    return extractFromString(output);
  }

  if (typeof output !== 'object') {
    return new Set<string>();
  }

  if (Array.isArray(output)) {
    return extractFromArray(output);
  }

  return extractFromObject(output as AnyRecord);
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
