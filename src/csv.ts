// Helpers for parsing CSV eval files, shared by frontend and backend. Cannot import native modules.
import logger from './logger';
import { BaseAssertionTypesSchema } from './types/index';
import { isJavascriptFile } from './util/fileExtensions';
import invariant from './util/invariant';

import type { Assertion, AssertionType, BaseAssertionTypes, CsvRow, TestCase } from './types/index';

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

function getJavascriptSliceLength(expected: string): number {
  if (expected.startsWith('javascript:')) {
    return 'javascript:'.length;
  }
  if (expected.startsWith('fn:')) {
    return 'fn:'.length;
  }
  if (expected.startsWith('eval:')) {
    return 'eval:'.length;
  }
  return 0;
}

function isJavascriptAssertion(expected: string): boolean {
  return (
    expected.startsWith('javascript:') ||
    expected.startsWith('fn:') ||
    expected.startsWith('eval:') ||
    (expected.startsWith('file://') && isJavascriptFile(expected.slice('file://'.length)))
  );
}

function isPythonAssertion(expected: string): boolean {
  return (
    expected.startsWith('python:') ||
    (expected.startsWith('file://') && (expected.endsWith('.py') || expected.includes('.py:')))
  );
}

function isContainsListType(type: BaseAssertionTypes): boolean {
  return (
    type === 'contains-all' ||
    type === 'contains-any' ||
    type === 'icontains-all' ||
    type === 'icontains-any'
  );
}

const THRESHOLD_ASSERTION_TYPES: ReadonlySet<string> = new Set([
  'answer-relevance',
  'classifier',
  'context-faithfulness',
  'context-recall',
  'context-relevance',
  'cost',
  'latency',
  'levenshtein',
  'perplexity-score',
  'perplexity',
  'rouge-n',
  'similar',
  'starts-with',
]);

function buildAssertionFromRegexMatch(regexMatch: RegExpMatchArray): Assertion {
  const [_, notPrefix, type, thresholdStr, value] = regexMatch as [
    string,
    string,
    BaseAssertionTypes,
    string,
    // Note: whether value is defined depends on the type of assertion.
    string?,
  ];
  const fullType: AssertionType = notPrefix ? `not-${type}` : type;
  const parsedThreshold = thresholdStr ? Number.parseFloat(thresholdStr) : Number.NaN;
  const threshold = Number.isFinite(parsedThreshold) ? parsedThreshold : undefined;

  if (isContainsListType(type)) {
    return {
      type: fullType as AssertionType,
      value: value ? value.split(',').map((s) => s.trim()) : value,
    };
  }

  if (type === 'contains-json' || type === 'is-json') {
    return {
      type: fullType as AssertionType,
      value,
    };
  }

  if (THRESHOLD_ASSERTION_TYPES.has(type)) {
    const defaultThreshold = type === 'similar' ? DEFAULT_SEMANTIC_SIMILARITY_THRESHOLD : 0.75;
    return {
      type: fullType as AssertionType,
      value: value?.trim?.(),
      threshold: threshold ?? defaultThreshold,
    };
  }

  return {
    type: fullType as AssertionType,
    value: value?.trim?.(),
  };
}

export function assertionFromString(expected: string): Assertion {
  // Legacy options
  if (isJavascriptAssertion(expected)) {
    // TODO(1.0): delete eval: legacy option
    const sliceLength = getJavascriptSliceLength(expected);
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

  if (isPythonAssertion(expected)) {
    const sliceLength = expected.startsWith('python:') ? 'python:'.length : 'file://'.length;
    const functionBody = expected.slice(sliceLength).trim();
    return {
      type: 'python',
      value: functionBody,
    };
  }

  const regexMatch = expected.match(getAssertionRegex());
  if (regexMatch) {
    return buildAssertionFromRegexMatch(regexMatch);
  }

  // Default to equality
  return {
    type: 'equals',
    value: expected,
  };
}

const uniqueErrorMessages = new Set<string>();

interface CsvRowState {
  vars: Record<string, string>;
  asserts: Assertion[];
  options: TestCase['options'];
  metadata: Record<string, unknown>;
  assertionConfigs: Record<string | number, Record<string, unknown>>;
  providerOutput: string | Record<string, unknown> | undefined;
  description: string | undefined;
  metric: string | undefined;
  threshold: number | undefined;
}

function parseConfigTargetIndex(expectedKey: string, key: string): number {
  if (expectedKey === '__expected') {
    return 0;
  }
  if (expectedKey.startsWith('__expected')) {
    const indexMatch = expectedKey.match(/^__expected(\d+)$/);
    if (indexMatch) {
      return Number.parseInt(indexMatch[1], 10) - 1;
    }
  }
  logger.error(
    `Invalid expected key "${expectedKey}" in __config column "${key}". ` +
      `Must be __expected or __expected<N> where N is a positive integer.`,
  );
  throw new Error(`Invalid expected key "${expectedKey}" in __config column`);
}

function parseConfigNumericValue(value: string, configKey: string, key: string): number {
  const parsedValue = Number.parseFloat(value);
  if (!Number.isFinite(parsedValue)) {
    logger.error(
      `Invalid numeric value "${value}" for config key "${configKey}" in column "${key}"`,
    );
    throw new Error(`Invalid numeric value for ${configKey}`);
  }
  return parsedValue;
}

function processConfigKey(
  key: string,
  value: string,
  assertionConfigs: Record<string | number, Record<string, unknown>>,
): void {
  const configParts = key.slice('__config:'.length).split(':');
  if (configParts.length !== 2) {
    logger.warn(
      `Invalid __config column format: "${key}". Expected format: __config:__expected:threshold or __config:__expected<N>:threshold`,
    );
    return;
  }

  const [expectedKey, configKey] = configParts;
  const targetIndex = parseConfigTargetIndex(expectedKey, key);

  if (!['threshold'].includes(configKey)) {
    logger.error(
      `Invalid config key "${configKey}" in __config column "${key}". ` +
        `Valid config keys include: threshold`,
    );
    throw new Error(`Invalid config key "${configKey}" in __config column`);
  }

  if (!assertionConfigs[targetIndex]) {
    assertionConfigs[targetIndex] = {};
  }

  const parsedValue =
    configKey === 'threshold' ? parseConfigNumericValue(value, configKey, key) : value.trim();

  assertionConfigs[targetIndex][configKey] = parsedValue;
}

function processMetadataKey(key: string, value: string, metadata: Record<string, unknown>): void {
  const metadataKey = key.slice('__metadata:'.length);
  if (metadataKey.endsWith('[]')) {
    const arrayKey = metadataKey.slice(0, -2);
    if (value.trim() !== '') {
      // Split by commas, but respect escaped commas (\,)
      const values = value
        .split(/(?<!\\),/)
        .map((v) => v.trim())
        .map((v) => v.replace('\\,', ','));
      metadata[arrayKey] = values;
    }
  } else if (value.trim() !== '') {
    metadata[metadataKey] = value;
  }
}

function processCsvRowKey(key: string, value: string, state: CsvRowState): void {
  if (key.startsWith('__expected')) {
    if (value.trim() !== '') {
      state.asserts.push(assertionFromString(value.trim()));
    }
  } else if (key === '__prefix') {
    state.options.prefix = value;
  } else if (key === '__suffix') {
    state.options.suffix = value;
  } else if (key === '__description') {
    state.description = value;
  } else if (key === '__providerOutput') {
    state.providerOutput = value;
  } else if (key === '__metric') {
    state.metric = value;
  } else if (key === '__threshold') {
    state.threshold = Number.parseFloat(value);
  } else if (key.startsWith('__metadata:')) {
    processMetadataKey(key, value, state.metadata);
  } else if (key === '__metadata' && !uniqueErrorMessages.has(key)) {
    uniqueErrorMessages.add(key);
    logger.warn(
      'The "__metadata" column requires a key, e.g. "__metadata:category". This column will be ignored.',
    );
  } else if (key.startsWith('__config:')) {
    processConfigKey(key, value, state.assertionConfigs);
  } else {
    state.vars[key] = value;
  }
}

function applyAssertionConfigs(
  asserts: Assertion[],
  metric: string | undefined,
  assertionConfigs: Record<string | number, Record<string, unknown>>,
  metadata: Record<string, unknown>,
): void {
  for (let i = 0; i < asserts.length; i++) {
    const assert = asserts[i];
    assert.metric = metric;

    // Apply index-specific configuration (if exists) - overrides global
    const indexConfig = assertionConfigs[i];
    if (indexConfig) {
      for (const [configKey, configValue] of Object.entries(indexConfig)) {
        (assert as Record<string, unknown>)[configKey] = configValue;
        // Include each key/value on the metadata object
        metadata[configKey] = configValue;
      }
    }
  }
}

export function testCaseFromCsvRow(row: CsvRow): TestCase {
  const state: CsvRowState = {
    vars: {},
    asserts: [],
    options: {},
    metadata: {},
    assertionConfigs: {},
    providerOutput: undefined,
    description: undefined,
    metric: undefined,
    threshold: undefined,
  };

  const specialKeys = [
    'expected',
    'prefix',
    'suffix',
    'description',
    'providerOutput',
    'metric',
    'threshold',
    'metadata',
    'config',
  ].map((k) => `_${k}`);

  // Remove leading and trailing whitespace from keys, as leading/trailing whitespace interferes with
  // meta key parsing.
  const sanitizedRows = Object.entries(row).map(([key, value]) => [key.trim(), value]);

  for (const [key, value] of sanitizedRows) {
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
    processCsvRowKey(key, value, state);
  }

  applyAssertionConfigs(state.asserts, state.metric, state.assertionConfigs, state.metadata);

  return {
    vars: state.vars,
    assert: state.asserts,
    options: state.options,
    ...(state.description ? { description: state.description } : {}),
    ...(state.providerOutput ? { providerOutput: state.providerOutput } : {}),
    ...(state.threshold ? { threshold: state.threshold } : {}),
    ...(Object.keys(state.metadata).length > 0 ? { metadata: state.metadata } : {}),
  };
}

/**
 * Serialize a list of VarMapping objects as a CSV string.
 * @param vars - The list of VarMapping objects to serialize.
 * @returns A CSV string.
 */
export function serializeObjectArrayAsCSV(vars: object[]): string {
  invariant(vars.length > 0, 'No variables to serialize');
  const columnNames = Object.keys(vars[0]).join(',');
  const rows = vars
    .map(
      (result) =>
        `"${Object.values(result)
          .map((value) => value.toString().replace(/"/g, '""'))
          .join('","')}"`,
    )
    .join('\n');
  return [columnNames, rows].join('\n') + '\n';
}
