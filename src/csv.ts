// Helpers for parsing CSV eval files, shared by frontend and backend. Cannot import native modules.
import type { Assertion, AssertionType, CsvRow, TestCase } from './types';
import { BaseAssertionTypesSchema } from './types';

const DEFAULT_SEMANTIC_SIMILARITY_THRESHOLD = 0.8;

// Get all assertion types from the schema, join them with '|' for the regex
const assertionTypesRegex = BaseAssertionTypesSchema.options.join('|');
const assertionRegex = new RegExp(
  `^(not-)?(${assertionTypesRegex})(?:\\((\\d+(?:\\.\\d+)?)\\))?(?::([\\s\\S]*))?$`,
);

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
      value: expected.slice(expected.startsWith('grade:') ? 6 : 11),
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

  const regexMatch = expected.match(assertionRegex);

  if (regexMatch) {
    const [_, notPrefix, type, thresholdStr, value] = regexMatch;
    const fullType = notPrefix ? `not-${type}` : type;
    const threshold = Number.parseFloat(thresholdStr);

    if (
      type === 'contains-all' ||
      type === 'contains-any' ||
      type === 'icontains-all' ||
      type === 'icontains-any'
    ) {
      return {
        type: fullType as AssertionType,
        value: value.split(',').map((s) => s.trim()),
      };
    } else if (type === 'contains-json' || type === 'is-json') {
      return {
        type: fullType as AssertionType,
        value,
      };
    } else if (
      type === 'answer-relevance' ||
      type === 'classifier' ||
      type === 'context-faithfulness' ||
      type === 'context-recall' ||
      type === 'context-relevance' ||
      type === 'cost' ||
      type === 'latency' ||
      type === 'levenshtein' ||
      type === 'perplexity-score' ||
      type === 'perplexity' ||
      type === 'rouge-n' ||
      type === 'similar' ||
      type === 'starts-with'
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

export function testCaseFromCsvRow(row: CsvRow): TestCase {
  const vars: Record<string, string> = {};
  const asserts: Assertion[] = [];
  const options: TestCase['options'] = {};
  let providerOutput: string | object | undefined;
  let description: string | undefined;
  let metric: string | undefined;
  let threshold: number | undefined;
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
    } else if (key === '__threshold') {
      threshold = Number.parseFloat(value);
    } else {
      vars[key] = value;
    }
  }

  for (const assert of asserts) {
    assert.metric = metric;
  }

  return {
    vars,
    assert: asserts,
    options,
    ...(description ? { description } : {}),
    ...(providerOutput ? { providerOutput } : {}),
    ...(threshold ? { threshold } : {}),
  };
}
