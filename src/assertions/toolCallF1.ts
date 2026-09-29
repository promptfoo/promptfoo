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

function* jsonBlocks(
  text: string,
  skipRoot = false,
): Generator<{ text: string; startsLine: boolean }> {
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
        `Tool Call F1 exceeded its delimiter limit (${MAX_UNMATCHED_DELIMITERS})`,
      );
    }
  }

  // Yield disjoint blocks; nested recovery skips the enclosing root.
  let nextUnmatched = 0;
  let depth = 0;
  let start = -1;
  let startDepth = 0;
  let startsLine = false;
  for (const token of jsonDelimiters(text)) {
    if (!token) {
      continue;
    }
    if (token.index === unmatched[nextUnmatched]) {
      nextUnmatched++;
      continue;
    }
    if (token.char === '{' || token.char === '[') {
      if (start < 0 && depth === (skipRoot ? 1 : 0)) {
        start = token.index;
        startDepth = depth;
        startsLine = token.startsLine;
      }
      depth++;
      continue;
    }
    depth--;
    if (start >= 0 && depth === startDepth) {
      if (token.endsLine) {
        yield { text: text.slice(start, token.index + 1), startsLine };
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
    const { text: block, startsLine } = next.value;
    if (block.length > remaining) {
      throw new ToolCallParseError(
        'Tool Call F1 could not finish parsing malformed output within its work limit',
      );
    }
    remaining -= block.length;
    try {
      const parsed: unknown = JSON.parse(block);
      if (startsLine) {
        yield parsed;
      }
    } catch {
      // Each rescan is paid for by the failed parse, keeping total work linear.
      pending.push(jsonBlocks(block, true));
    }
  }
}

/** Traverse wrappers without entering call arguments or tool definitions. */
function collectToolNames(output: unknown, names: Set<string>): void {
  const pending = [{ value: output, callList: Array.isArray(output) }];
  const visited = new WeakMap<object, boolean>();

  while (pending.length) {
    const { value, callList } = pending.pop()!;
    if (!value || typeof value !== 'object') {
      continue;
    }
    // A shared value can appear as ordinary data before a known call list.
    if (visited.has(value) && (visited.get(value) || !callList)) {
      continue;
    }
    visited.set(value, callList);

    if (Array.isArray(value)) {
      for (const item of value) {
        pending.push({ value: item, callList });
      }
      continue;
    }

    const obj = value as Record<string, unknown>;
    if (
      (obj.type === 'function' && !callList) ||
      obj.type === 'function_call_output' ||
      obj.type === 'tool_result' ||
      obj.role === 'tool' ||
      'functionResponse' in obj
    ) {
      continue;
    }

    let name: unknown;
    if (obj.type === 'tool_use' || obj.type === 'function_call') {
      name = obj.name;
    } else if ('functionCall' in obj) {
      name = (obj.functionCall as Record<string, unknown> | null)?.name;
    } else if (callList && ('function' in obj || 'name' in obj)) {
      name = (obj.function as Record<string, unknown> | null)?.name ?? obj.name;
    } else {
      for (const [key, nested] of Object.entries(obj)) {
        if (
          key === 'tools' ||
          key === 'function' ||
          key === 'toolResponse' ||
          key === 'tool_response'
        ) {
          continue;
        }
        if (key === 'tool_calls') {
          if (Array.isArray(nested)) {
            pending.push({ value: nested, callList: true });
          }
        } else if (key === 'toolCall') {
          const calls = (nested as Record<string, unknown> | null)?.functionCalls;
          if (Array.isArray(calls)) {
            pending.push({ value: calls, callList: true });
          }
        } else {
          pending.push({ value: nested, callList: false });
        }
      }
      continue;
    }
    // Recognized calls are terminal even when their name is missing or invalid.
    if (typeof name === 'string') {
      names.add(name);
    }
  }
}

function extractToolNames(output: unknown): Set<string> {
  const names = new Set<string>();
  if (typeof output === 'string') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(output);
    } catch {
      // Providers join serialized calls at line boundaries.
      for (const block of extractJsonBlocks(output)) {
        collectToolNames(block, names);
      }
      return names;
    }
    // Preserve support for JSON-encoded text as well as structured outputs.
    return extractToolNames(parsed);
  }
  collectToolNames(output, names);
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
