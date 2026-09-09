import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

/**
 * Outermost balanced `{...}` / `[...]` fragments of a string, found in a single pass.
 * Fragments inside an opener that never closes are returned too, so a stray brace in
 * prose cannot hide a tool call that follows it.
 *
 * A quote only opens a JSON string once a delimiter is open, so prose quotes cannot
 * swallow the JSON that follows them. `respectStrings: false` drops string tracking
 * altogether, which the caller runs as a second pass for prose that opens a delimiter
 * inside quotes.
 */
function jsonFragments(text: string, respectStrings: boolean): string[] {
  // Each open delimiter collects the spans that completed directly inside it. They are
  // dropped when it closes, because the enclosing fragment already covers them.
  const open: { start: number; nested: [number, number][] }[] = [];
  const spans: [number, number][] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"' && respectStrings && open.length > 0) {
      inString = true;
    } else if (char === '{' || char === '[') {
      open.push({ start: i, nested: [] });
    } else if (char === '}' || char === ']') {
      const frame = open.pop();
      if (frame) {
        (open[open.length - 1]?.nested ?? spans).push([frame.start, i + 1]);
      }
    }
  }

  for (const frame of open) {
    for (const span of frame.nested) {
      spans.push(span);
    }
  }
  return spans.map(([start, end]) => text.slice(start, end));
}

/**
 * The name of a single tool call, for shapes that identify themselves as one:
 * - Anthropic content block: { type: 'tool_use', name: '...' }
 * - OpenAI Responses item: { type: 'function_call', name: '...' }
 * - Google/Vertex: { functionCall: { name: '...' } }
 *
 * `{ function: { name } }` is missing on purpose: it is also the shape of an OpenAI tool
 * *definition* (`{ type: 'function', function: { name, parameters } }`), so it only counts
 * inside a list already known to hold calls.
 */
function toolCallName(obj: Record<string, unknown>): string | undefined {
  if ((obj.type === 'tool_use' || obj.type === 'function_call') && typeof obj.name === 'string') {
    return obj.name;
  }
  const call = obj.functionCall;
  if (call && typeof call === 'object') {
    const { name } = call as Record<string, unknown>;
    if (typeof name === 'string') {
      return name;
    }
  }
  return undefined;
}

/**
 * Adds names from a list whose entries are known to be tool calls, where
 * `{ function: { name } }` and a bare `{ name }` count too.
 */
function addCallListNames(list: unknown, names: Set<string>): void {
  if (!Array.isArray(list)) {
    return;
  }
  for (const item of list) {
    if (item && typeof item === 'object') {
      const call = item as Record<string, unknown>;
      const fn = call.function;
      const fnName =
        fn && typeof fn === 'object' ? (fn as Record<string, unknown>).name : undefined;
      const name = toolCallName(call) ?? fnName ?? call.name;
      if (typeof name === 'string') {
        names.add(name);
      }
    }
  }
}

/** Wrappers nest a few levels; the cap keeps adversarial nesting off the call stack. */
const MAX_WRAPPER_DEPTH = 100;

/**
 * Walks a parsed value and collects names from recognised tool-call shapes only.
 * Wrappers are traversed, so `{ result: { tool_calls: [...] } }` is found, but an
 * arbitrary `{ name: '...' }` object is never mistaken for a tool call.
 */
function collectToolNames(value: unknown, names: Set<string>, depth = 0): void {
  if (depth > MAX_WRAPPER_DEPTH) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectToolNames(item, names, depth + 1);
    }
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }

  const obj = value as Record<string, unknown>;
  const name = toolCallName(obj);
  if (name !== undefined) {
    names.add(name);
    return;
  }

  // OpenAI envelope: { tool_calls: [...] }, Google Live: { toolCall: { functionCalls: [...] } }
  addCallListNames(obj.tool_calls, names);
  addCallListNames((obj.toolCall as Record<string, unknown> | undefined)?.functionCalls, names);

  for (const nested of Object.values(obj)) {
    collectToolNames(nested, names, depth + 1);
  }
}

/** Parses one balanced fragment and harvests its calls; false when it is not JSON. */
function addFragmentNames(fragment: string, names: Set<string>): boolean {
  try {
    collectToolNames(JSON.parse(fragment), names);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts tool names from provider output, which may be an object, an array of
 * content blocks, JSON text, or JSON embedded in a prose response.
 */
function extractToolNames(output: unknown): Set<string> {
  const names = new Set<string>();

  if (typeof output === 'string') {
    try {
      return extractToolNames(JSON.parse(output));
    } catch {
      // Not valid JSON as a whole; harvest embedded tool-call JSON instead.
    }
    // Both passes always run and their names are merged: an earlier call must not stop
    // the quote-insensitive pass from recovering a later one.
    for (const respectStrings of [true, false]) {
      for (const fragment of jsonFragments(output, respectStrings)) {
        if (!addFragmentNames(fragment, names)) {
          // Prose can bracket a call, e.g. `[see: {"type":"tool_use",...}]`. Unwrapping one
          // level recovers it; retrying every level would make the scan quadratic again.
          for (const inner of jsonFragments(fragment.slice(1, -1), respectStrings)) {
            addFragmentNames(inner, names);
          }
        }
      }
    }
    return names;
  }

  collectToolNames(output, names);

  // Simple format: the whole output is a list of calls, e.g. [{ name: '...' }].
  addCallListNames(output, names);

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
    expectedTools = renderedValue
      .map(String)
      .map((name) => name.trim())
      .filter(Boolean);
  } else if (typeof renderedValue === 'string') {
    expectedTools = renderedValue
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
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
