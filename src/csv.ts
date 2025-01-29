// Helpers for parsing CSV eval files, shared by frontend and backend. Cannot import native modules.
import logger from './logger';
import type { Assertion, AssertionType, CsvRow, TestCase, BaseAssertionTypes } from './types';
import { BaseAssertionTypesSchema } from './types';
import { isJavascriptFile } from './util/file';

const DEFAULT_SEMANTIC_SIMILARITY_THRESHOLD = 0.8;

let _assertionRegex: RegExp | null = null;
function getAssertionRegex(): RegExp {
  if (!_assertionRegex) {
    const assertionTypesRegex = BaseAssertionTypesSchema.options.join('|');
    _assertionRegex = new RegExp(
      `^(not-)?(${assertionTypesRegex})(?:\\((\\d+(?:\\.\\d+)?)\\))?(?::([\\s\\S]*))?$`,
    );
  }
  return _assertionRegex;
}

export function assertionFromString(expected: string): Assertion {
  // Legacy options
  if (
    expected.startsWith('javascript:') ||
    expected.startsWith('fn:') ||
    expected.startsWith('eval:') ||
    (expected.startsWith('file://') && isJavascriptFile(expected.slice('file://'.length)))
  ) {
    // TODO(1.0): delete eval: legacy option
    let sliceLength = 0;
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
  if (
    expected.startsWith('python:') ||
    (expected.startsWith('file://') && (expected.endsWith('.py') || expected.includes('.py:')))
  ) {
    const sliceLength = expected.startsWith('python:') ? 'python:'.length : 'file://'.length;
    const functionBody = expected.slice(sliceLength).trim();
    return {
      type: 'python',
      value: functionBody,
    };
  }

  const regexMatch = expected.match(getAssertionRegex());

  if (regexMatch) {
    const [_, notPrefix, type, thresholdStr, value] = regexMatch as [
      string,
      string,
      BaseAssertionTypes,
      string,
      string,
    ];
    const fullType: AssertionType = notPrefix ? `not-${type}` : type;
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

const uniqueErrorMessages = new Set<string>();

export function testCaseFromCsvRow(row: CsvRow): TestCase {
  const vars: Record<string, string> = {};
  const asserts: Assertion[] = [];
  const options: TestCase['options'] = {};
  let providerOutput: string | object | undefined;
  let description: string | undefined;
  let metric: string | undefined;
  let threshold: number | undefined;

  const specialKeys = [
    'expected',
    'prefix',
    'suffix',
    'description',
    'providerOutput',
    'metric',
    'threshold',
  ].map((k) => `_${k}`);

  for (const [key, value] of Object.entries(row)) {
    // Check for single underscore usage with reserved keys
    if (
      !key.startsWith('__') &&
      specialKeys.some((k) => key.startsWith(k)) &&
      !uniqueErrorMessages.has(key)
    ) {
      const error = `You used a single underscore for the key "${key}". Did you mean to use "${key.replace('_', '__')}" instead?`;
      uniqueErrorMessages.add(key);
      logger.warn(error);
    }
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
