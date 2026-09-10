import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

type JsonDelimiter = {
  char: '{' | '[' | '}' | ']';
  index: number;
  startsLine: boolean;
  endsLine: boolean;
};

function columnWidth(text: string): number {
  let column = 0;
  for (const char of text) {
    column += char === '\t' ? 4 - (column % 4) : 1;
  }
  return column;
}

function* jsonDelimiters(text: string): Generator<JsonDelimiter | null> {
  let inString = false;
  let escaped = false;
  let fence = '';
  let fenceContainer = 0;
  const containers: number[] = [];
  let lineStart = 0;

  while (lineStart < text.length) {
    const offset = lineStart;
    const newline = text.indexOf('\n', lineStart);
    const lineEnd = newline < 0 ? text.length : newline;
    const content = text.slice(lineStart, lineEnd).trimEnd();
    lineStart = lineEnd + 1;
    const firstContent = content.search(/\S/);
    const indent = columnWidth(content.slice(0, Math.max(0, firstContent)));
    if (fence && content && indent < fenceContainer) {
      fence = '';
      yield null;
    }
    if (fence) {
      const marker = /^[ \t]*(`{3,}|~{3,})/.exec(content);
      if (
        marker &&
        indent <= fenceContainer + 3 &&
        marker[1][0] === fence[0] &&
        marker[1].length >= fence.length &&
        !content.slice(marker[0].length).trim()
      ) {
        fence = '';
      }
      continue;
    }

    while (content && containers.length && indent < containers[containers.length - 1]) {
      containers.pop();
    }
    const list = /^[ \t]*(?:[-+*]|\d+[.)])[ \t]+/.exec(content);
    if (list) {
      containers.push(columnWidth(list[0]));
    }
    const container = containers[containers.length - 1] ?? 0;
    const fenceText = list ? content.slice(list[0].length) : content;
    const marker = /^[ \t]*(`{3,}|~{3,})/.exec(fenceText);
    if (
      marker &&
      (list || indent <= container + 3) &&
      (marker[1][0] !== '`' || !fenceText.slice(marker[0].length).includes('`'))
    ) {
      fence = marker[1];
      fenceContainer = container;
      yield null;
      continue;
    }

    for (let column = 0; column < content.length; column++) {
      const char = content[column];
      const index = offset + column;
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
      } else if (char === '{' || char === '[' || char === '}' || char === ']') {
        yield {
          char,
          index,
          startsLine: column === firstContent,
          endsLine: column === content.length - 1,
        };
      }
    }

    // JSON strings cannot span literal newlines.
    if (inString) {
      inString = false;
      escaped = false;
      yield null;
    }
  }
}

class ToolCallParseError extends Error {}

const MAX_UNMATCHED_DELIMITERS = 65_536;

function* jsonBlocks(text: string, skipRoot = false): Generator<string> {
  // Pop complete pairs so independent blocks do not accumulate in memory.
  const unmatched: number[] = [];
  let stackStart = 0;
  for (const token of jsonDelimiters(text)) {
    if (!token) {
      stackStart = unmatched.length;
    } else if (token.char === '{' || token.char === '[') {
      unmatched.push(token.index);
    } else if (
      unmatched.length > stackStart &&
      text[unmatched[unmatched.length - 1]] === (token.char === '}' ? '{' : '[')
    ) {
      unmatched.pop();
    } else {
      unmatched.push(token.index);
      stackStart = unmatched.length;
    }
    if (unmatched.length > MAX_UNMATCHED_DELIMITERS) {
      throw new ToolCallParseError(
        'Tool Call F1 could not finish parsing malformed output within its delimiter limit',
      );
    }
  }

  // Yield disjoint blocks; nested recovery skips the enclosing root.
  let nextUnmatched = 0;
  let depth = 0;
  let start = -1;
  let startDepth = 0;
  for (const token of jsonDelimiters(text)) {
    if (!token) {
      continue;
    }
    if (token.index === unmatched[nextUnmatched]) {
      nextUnmatched++;
      continue;
    }
    if (token.char === '{' || token.char === '[') {
      if (start < 0 && token.startsLine && depth === (skipRoot ? 1 : 0)) {
        start = token.index;
        startDepth = depth;
      }
      depth++;
      continue;
    }
    depth--;
    if (start >= 0 && depth === startDepth) {
      if (token.endsLine) {
        yield text.slice(start, token.index + 1);
      }
      start = -1;
    }
  }
}

function* extractJsonBlocks(text: string): Generator<unknown> {
  const pending = [jsonBlocks(text)];
  let remaining = 4 * text.length;
  while (pending.length) {
    const next = pending[pending.length - 1].next();
    if (next.done) {
      pending.pop();
      continue;
    }
    const block = next.value;
    if (block.length > remaining) {
      throw new ToolCallParseError(
        'Tool Call F1 could not finish parsing malformed output within its work limit',
      );
    }
    remaining -= block.length;
    try {
      yield JSON.parse(block);
    } catch {
      // Each rescan is paid for by the failed parse, keeping total work linear.
      pending.push(jsonBlocks(block, true));
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

  if (typeof output === 'string') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(output);
    } catch {
      // Providers join serialized calls at line boundaries.
      for (const block of extractJsonBlocks(output)) {
        for (const name of extractToolNames(block)) {
          names.add(name);
        }
      }
      return names;
    }
    return extractToolNames(parsed);
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
  let actual: Set<string>;
  try {
    actual = extractToolNames(output);
  } catch (error) {
    if (!(error instanceof ToolCallParseError)) {
      throw error;
    }
    return { pass: false, score: 0, reason: error.message, assertion };
  }

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
