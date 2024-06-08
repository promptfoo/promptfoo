// Helpers for parsing CSV eval files, shared by frontend and backend. Cannot import native modules.

import type { Assertion, AssertionType, CsvRow, TestCase } from './types';

const DEFAULT_SEMANTIC_SIMILARITY_THRESHOLD = 0.8;

export function testCaseFromCsvRow(row: CsvRow): TestCase {
  const vars: Record<string, string> = {};
  const asserts: Assertion[] = [];
  const options: TestCase['options'] = {};
  let providerOutput: string | object | undefined;
  let description: string | undefined;
  let metric: string | undefined;
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith('__expected')) {
      if (value.trim() !== '') {
        asserts.push(assertionFromString(value));
      }
    } else if (key === '__prefix') {
      options.prefix = value;
    } else if (key === '__suffix') {
      options.suffix = value;
    } else if (key === '__description') {
      description = value;
    } else if (key === '__providerOutput') {
      providerOutput = value;
    } else if (key === '__metric') {
      metric = value;
    } else {
      vars[key] = value;
    }
  }
  return {
    vars,
    ...(providerOutput ? { providerOutput } : {}),
    assert: asserts,
    options,
    ...(description ? { description } : {}),
    ...(metric ? { metric } : {}),
  };
}

export function assertionFromString(expected: string): Assertion {
  // Legacy options
  if (
    expected.startsWith('javascript:') ||
    expected.startsWith('fn:') ||
    expected.startsWith('eval:')
  ) {
    // TODO(1.0): delete eval: legacy option
    let sliceLength;
    if (expected.startsWith('javascript:')) {
      sliceLength = 'javascript:'.length;
    }
    if (expected.startsWith('fn:')) {
      sliceLength = 'fn:'.length;
    }
    if (expected.startsWith('eval:')) {
      sliceLength = 'eval:'.length;
    }

    const functionBody = expected.slice(sliceLength).trim();
    return {
      type: 'javascript',
      value: functionBody,
    };
  }
  if (expected.startsWith('grade:') || expected.startsWith('llm-rubric:')) {
    return {
      type: 'llm-rubric',
      value: expected.slice(6),
    };
  }
  if (expected.startsWith('python:')) {
    const sliceLength = 'python:'.length;
    const functionBody = expected.slice(sliceLength).trim();
    return {
      type: 'python',
      value: functionBody,
    };
  }

  // New options
  const assertionRegex =
    /^(not-)?(equals|contains-any|contains-all|icontains-any|icontains-all|contains-json|is-json|regex|icontains|contains|webhook|rouge-n|similar|starts-with|levenshtein|classifier|model-graded-factuality|factuality|model-graded-closedqa|answer-relevance|context-recall|context-relevance|context-faithfulness|is-valid-openai-function-call|is-valid-openai-tools-call|latency|perplexity|perplexity-score|cost)(?:\((\d+(?:\.\d+)?)\))?(?::([\s\S]*))?$/;
  const regexMatch = expected.match(assertionRegex);

  if (regexMatch) {
    const [_, notPrefix, type, thresholdStr, value] = regexMatch;
    const fullType = notPrefix ? `not-${type}` : type;
    const threshold = parseFloat(thresholdStr);

    if (
      type === 'contains-any' ||
      type === 'contains-all' ||
      type === 'icontains-any' ||
      type === 'icontains-all'
    ) {
      return {
        type: fullType as AssertionType,
        value: value.split(',').map((s) => s.trim()),
      };
    } else if (type === 'contains-json' || type === 'is-json') {
      return {
        type: fullType as AssertionType,
        value: value,
      };
    } else if (
      type === 'rouge-n' ||
      type === 'similar' ||
      type === 'starts-with' ||
      type === 'levenshtein' ||
      type === 'classifier' ||
      type === 'answer-relevance' ||
      type === 'context-recall' ||
      type === 'context-relevance' ||
      type === 'context-faithfulness' ||
      type === 'latency' ||
      type === 'perplexity' ||
      type === 'perplexity-score' ||
      type === 'cost'
    ) {
      return {
        type: fullType as AssertionType,
        value,
        threshold: threshold || (type === 'similar' ? DEFAULT_SEMANTIC_SIMILARITY_THRESHOLD : 0.75),
      };
    } else {
      return {
        type: fullType as AssertionType,
        value,
      };
    }
  }

  // Default to equality
  return {
    type: 'equals',
    value: expected,
  };
}
