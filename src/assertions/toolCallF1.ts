import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

function* extractJsonBlocks(text: string): Generator<unknown> {
  const MAX_JSON_CANDIDATES = 10_000;
  const MAX_NESTED_RECOVERY_LENGTH = 1_024;
  const candidates = new Map<number, { end: number; endsLine: boolean } | undefined>();
  const openings: number[] = [];
  let inString = false;
  let escaped = false;
  let fence = '';
  let fenceIndent = '';
  let offset = 0;

  // Record balanced ranges once, including blocks inside unfinished candidates.
  for (const line of text.split('\n')) {
    const lineStart = offset;
    offset += line.length + 1;
    const content = line.trimEnd();
    const marker = /^([ \t]*)(`{3,}|~{3,})/.exec(content);
    if (marker) {
      if (!fence) {
        fenceIndent = marker[1];
        fence = marker[2];
        openings.length = 0;
      } else if (
        marker[1] === fenceIndent &&
        marker[2][0] === fence[0] &&
        marker[2].length >= fence.length &&
        !content.slice(marker[0].length).trim()
      ) {
        fence = '';
      }
      continue;
    }
    if (fence) {
      continue;
    }

    const firstContent = content.search(/\S/);
    for (let column = 0; column < content.length; column++) {
      const char = content[column];
      const index = lineStart + column;
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === '{' || char === '[') {
        openings.push(index);
        if (column === firstContent) {
          if (candidates.size >= MAX_JSON_CANDIDATES) {
            candidates.delete(candidates.keys().next().value!);
          }
          candidates.set(index, undefined);
        }
      } else if (char === '}' || char === ']') {
        const start = openings.pop();
        if (start === undefined || text[start] !== (char === '}' ? '{' : '[')) {
          openings.length = 0;
        } else if (candidates.has(start)) {
          candidates.set(start, { end: index + 1, endsLine: column === content.length - 1 });
        }
      }
    }

    // JSON strings cannot span literal newlines.
    if (inString) {
      openings.length = 0;
      inString = false;
      escaped = false;
    }
  }

  // Parse non-overlapping ranges, even when a balanced candidate is invalid JSON.
  let end = 0;
  for (const [start, candidate] of candidates) {
    if (start < end || !candidate) {
      continue;
    }
    if (!candidate.endsLine) {
      end = candidate.end;
      continue;
    }
    try {
      const parsed = JSON.parse(text.slice(start, candidate.end));
      end = candidate.end;
      yield parsed;
    } catch {
      // Delimiter balancing does not validate JSON syntax.
      if (candidate.end - start > MAX_NESTED_RECOVERY_LENGTH) {
        end = candidate.end;
      }
    }
  }
}

/**
 * Extracts tool names from various output formats.
 *
 * Supports:
 * - OpenAI format: { tool_calls: [{ function: { name: "..." } }] }
 * - OpenAI Responses format: { type: 'function_call', name: '...' }
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

  // Handle string output - try to parse as JSON and recursively extract
  if (typeof output === 'string') {
    // First, try parsing the entire string as JSON
    try {
      const parsed = JSON.parse(output);
      const parsedNames = extractToolNames(parsed);
      for (const name of parsedNames) {
        names.add(name);
      }
      return names;
    } catch {
      // Not valid JSON as a whole; look for embedded JSON values.
    }

    // Providers join serialized calls at line boundaries.
    for (const block of extractJsonBlocks(output)) {
      for (const name of extractToolNames(block)) {
        names.add(name);
      }
    }
    return names;
  }

  if (typeof output !== 'object') {
    return names;
  }

  const obj = output as Record<string, unknown>;

  // Handle OpenAI format: { tool_calls: [{ function: { name: "..." } }] }
  if ('tool_calls' in obj && Array.isArray(obj.tool_calls)) {
    for (const tc of obj.tool_calls) {
      if (tc && typeof tc === 'object') {
        const toolCall = tc as Record<string, unknown>;
        // OpenAI: { function: { name: "..." } }
        if (toolCall.function && typeof toolCall.function === 'object') {
          const fn = toolCall.function as Record<string, unknown>;
          if (typeof fn.name === 'string') {
            names.add(fn.name);
          }
        }
        // Simple: { name: "..." }
        if (typeof toolCall.name === 'string') {
          names.add(toolCall.name);
        }
      }
    }
    return names;
  }

  // Handle Anthropic single tool_use block: { type: 'tool_use', name: '...' }
  if (obj.type === 'tool_use' && typeof obj.name === 'string') {
    names.add(obj.name);
    return names;
  }

  // OpenAI Responses API single item: { type: 'function_call', name: '...' }
  if (obj.type === 'function_call' && typeof obj.name === 'string') {
    names.add(obj.name);
    return names;
  }

  // Handle Google/Vertex single functionCall: { functionCall: { name: '...' } }
  if ('functionCall' in obj && obj.functionCall && typeof obj.functionCall === 'object') {
    const fc = obj.functionCall as Record<string, unknown>;
    if (typeof fc.name === 'string') {
      names.add(fc.name);
    }
    return names;
  }

  // Handle Google Live format: { toolCall: { functionCalls: [...] } }
  if ('toolCall' in obj && obj.toolCall && typeof obj.toolCall === 'object') {
    const toolCall = obj.toolCall as Record<string, unknown>;
    if ('functionCalls' in toolCall && Array.isArray(toolCall.functionCalls)) {
      for (const fc of toolCall.functionCalls) {
        if (
          fc &&
          typeof fc === 'object' &&
          typeof (fc as Record<string, unknown>).name === 'string'
        ) {
          names.add((fc as Record<string, unknown>).name as string);
        }
      }
    }
    return names;
  }

  // Handle arrays (Anthropic content blocks, Google arrays, OpenAI arrays)
  if (Array.isArray(output)) {
    for (const item of output) {
      if (item && typeof item === 'object') {
        const block = item as Record<string, unknown>;

        // Anthropic content block: { type: 'tool_use', name: '...' }
        if (block.type === 'tool_use' && typeof block.name === 'string') {
          names.add(block.name);
          continue;
        }

        // Google/Vertex array item: { functionCall: { name: '...' } }
        if (
          'functionCall' in block &&
          block.functionCall &&
          typeof block.functionCall === 'object'
        ) {
          const fc = block.functionCall as Record<string, unknown>;
          if (typeof fc.name === 'string') {
            names.add(fc.name);
          }
          continue;
        }

        // OpenAI format: { function: { name: "..." } }
        if (block.function && typeof block.function === 'object') {
          const fn = block.function as Record<string, unknown>;
          if (typeof fn.name === 'string') {
            names.add(fn.name);
          }
          continue;
        }

        // Simple format: { name: "..." }
        if (typeof block.name === 'string') {
          names.add(block.name);
        }
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
