import type { AssertionParams, GradingResult } from '../types/index';
import invariant from '../util/invariant';

interface ToolCall {
  type?: string;
  function?: {
    name: string;
    arguments?: string;
  };
  name?: string;
}

/**
 * Extracts tool names from various output formats.
 *
 * Supports:
 * - OpenAI format: { tool_calls: [{ function: { name: "..." } }] }
 * - Direct array: [{ function: { name: "..." } }]
 * - Simple format: [{ name: "..." }]
 */
function extractToolNames(output: unknown): Set<string> {
  const names = new Set<string>();

  if (output === null || output === undefined) {
    return names;
  }

  // Handle object with tool_calls property (OpenAI chat completion format)
  if (typeof output === 'object' && 'tool_calls' in output) {
    const toolCalls = (output as { tool_calls: ToolCall[] }).tool_calls;
    if (Array.isArray(toolCalls)) {
      for (const tc of toolCalls) {
        const name = tc.function?.name ?? tc.name;
        if (name) {
          names.add(name);
        }
      }
    }
    return names;
  }

  // Handle direct array of tool calls
  if (Array.isArray(output)) {
    for (const tc of output as ToolCall[]) {
      const name = tc.function?.name ?? tc.name;
      if (name) {
        names.add(name);
      }
    }
  }

  return names;
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
