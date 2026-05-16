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

const ARRAY_ASSERTION_TYPES = new Set<BaseAssertionTypes>([
  'contains-all',
  'contains-any',
  'icontains-all',
  'icontains-any',
]);

const RAW_VALUE_ASSERTION_TYPES = new Set<BaseAssertionTypes>(['contains-json', 'is-json']);

const THRESHOLD_ASSERTION_TYPES = new Set<BaseAssertionTypes>([
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

function getJavascriptAssertionSliceLength(expected: string): number | undefined {
  if (expected.startsWith('javascript:')) {
    return 'javascript:'.length;
  }
  if (expected.startsWith('fn:')) {
    return 'fn:'.length;
  }
  if (expected.startsWith('eval:')) {
    return 'eval:'.length;
  }
  if (expected.startsWith('file://') && isJavascriptFile(expected.slice('file://'.length))) {
    return 'file://'.length;
  }
  return undefined;
}

function parseJavascriptAssertion(expected: string): Assertion | undefined {
  const sliceLength = getJavascriptAssertionSliceLength(expected);
  return sliceLength === undefined
    ? undefined
    : {
        type: 'javascript',
        value: expected.slice(sliceLength).trim(),
      };
}

function parseRubricAssertion(expected: string): Assertion | undefined {
  if (expected.startsWith('grade:')) {
    return { type: 'llm-rubric', value: expected.slice('grade:'.length) };
  }
  if (expected.startsWith('llm-rubric:')) {
    return { type: 'llm-rubric', value: expected.slice('llm-rubric:'.length) };
  }
  return undefined;
}

function parsePythonAssertion(expected: string): Assertion | undefined {
  const isPythonFile =
    expected.startsWith('file://') && (expected.endsWith('.py') || expected.includes('.py:'));
  if (!expected.startsWith('python:') && !isPythonFile) {
    return undefined;
  }

  const sliceLength = expected.startsWith('python:') ? 'python:'.length : 'file://'.length;
  return {
    type: 'python',
    value: expected.slice(sliceLength).trim(),
  };
}

function parseThreshold(thresholdStr: string | undefined): number | undefined {
  const parsedThreshold = thresholdStr ? Number.parseFloat(thresholdStr) : Number.NaN;
  return Number.isFinite(parsedThreshold) ? parsedThreshold : undefined;
}

function parseRegexAssertion(expected: string): Assertion | undefined {
  const regexMatch = expected.match(getAssertionRegex());
  if (!regexMatch) {
    return undefined;
  }

  const [_, notPrefix, type, thresholdStr, value] = regexMatch as [
    string,
    string,
    BaseAssertionTypes,
    string,
    string?,
  ];
  const fullType: AssertionType = notPrefix ? `not-${type}` : type;

  if (ARRAY_ASSERTION_TYPES.has(type)) {
    return {
      type: fullType,
      value: value ? value.split(',').map((item) => item.trim()) : value,
    };
  }

  if (RAW_VALUE_ASSERTION_TYPES.has(type)) {
    return { type: fullType, value };
  }

  if (THRESHOLD_ASSERTION_TYPES.has(type)) {
    return {
      type: fullType,
      value: value?.trim?.(),
      threshold:
        parseThreshold(thresholdStr) ??
        (type === 'similar' ? DEFAULT_SEMANTIC_SIMILARITY_THRESHOLD : 0.75),
    };
  }

  return {
    type: fullType,
    value: value?.trim?.(),
  };
}

export function assertionFromString(expected: string): Assertion {
  return (
    parseJavascriptAssertion(expected) ||
    parseRubricAssertion(expected) ||
    parsePythonAssertion(expected) ||
    parseRegexAssertion(expected) || {
      type: 'equals',
      value: expected,
    }
  );
}

const uniqueErrorMessages = new Set<string>();

interface CsvTestCaseState {
  vars: Record<string, string>;
  asserts: Assertion[];
  options: NonNullable<TestCase['options']>;
  metadata: Record<string, unknown>;
  assertionConfigs: Record<string | number, Record<string, unknown>>;
  providerOutput?: string | Record<string, unknown>;
  description?: string;
  metric?: string;
  threshold?: number;
}

const SPECIAL_KEYS = [
  'expected',
  'prefix',
  'suffix',
  'description',
  'providerOutput',
  'metric',
  'threshold',
  'metadata',
  'config',
].map((key) => `_${key}`);

function createCsvTestCaseState(): CsvTestCaseState {
  return {
    vars: {},
    asserts: [],
    options: {},
    metadata: {},
    assertionConfigs: {},
  };
}

function warnSingleUnderscoreKey(key: string): void {
  if (
    key.startsWith('__') ||
    !SPECIAL_KEYS.some((specialKey) => key.startsWith(specialKey)) ||
    uniqueErrorMessages.has(key)
  ) {
    return;
  }

  uniqueErrorMessages.add(key);
  logger.warn(
    `You used a single underscore for the key "${key}". Did you mean to use "${key.replace('_', '__')}" instead?`,
  );
}

function parseMetadataColumn(
  key: string,
  value: string,
  metadata: Record<string, unknown>,
): boolean {
  if (!key.startsWith('__metadata:')) {
    return false;
  }

  const metadataKey = key.slice('__metadata:'.length);
  if (metadataKey.endsWith('[]')) {
    const arrayKey = metadataKey.slice(0, -2);
    if (value.trim() !== '') {
      metadata[arrayKey] = value
        .split(/(?<!\\),/)
        .map((item) => item.trim())
        .map((item) => item.replace('\\,', ','));
    }
    return true;
  }

  if (value.trim() !== '') {
    metadata[metadataKey] = value;
  }
  return true;
}

function parseAssertionTargetIndex(expectedKey: string, key: string): number {
  if (expectedKey === '__expected') {
    return 0;
  }

  const indexMatch = expectedKey.match(/^__expected(\d+)$/);
  if (indexMatch) {
    return Number.parseInt(indexMatch[1], 10) - 1;
  }

  logger.error(
    `Invalid expected key "${expectedKey}" in __config column "${key}". ` +
      `Must be __expected or __expected<N> where N is a positive integer.`,
  );
  throw new Error(`Invalid expected key "${expectedKey}" in __config column`);
}

function parseConfigValue(configKey: string, key: string, value: string): string | number {
  if (configKey !== 'threshold') {
    logger.error(
      `Invalid config key "${configKey}" in __config column "${key}". ` +
        `Valid config keys include: threshold`,
    );
    throw new Error(`Invalid config key "${configKey}" in __config column`);
  }

  const parsedValue = Number.parseFloat(value);
  if (!Number.isFinite(parsedValue)) {
    logger.error(
      `Invalid numeric value "${value}" for config key "${configKey}" in column "${key}"`,
    );
    throw new Error(`Invalid numeric value for ${configKey}`);
  }
  return parsedValue;
}

function parseConfigColumn(
  key: string,
  value: string,
  assertionConfigs: CsvTestCaseState['assertionConfigs'],
): boolean {
  if (!key.startsWith('__config:')) {
    return false;
  }

  const configParts = key.slice('__config:'.length).split(':');
  if (configParts.length !== 2) {
    logger.warn(
      `Invalid __config column format: "${key}". Expected format: __config:__expected:threshold or __config:__expected<N>:threshold`,
    );
    return true;
  }

  const [expectedKey, configKey] = configParts;
  const targetIndex = parseAssertionTargetIndex(expectedKey, key);
  assertionConfigs[targetIndex] ||= {};
  assertionConfigs[targetIndex][configKey] = parseConfigValue(configKey, key, value);
  return true;
}

function applyReservedColumn(state: CsvTestCaseState, key: string, value: string): boolean {
  if (key.startsWith('__expected')) {
    if (value.trim() !== '') {
      state.asserts.push(assertionFromString(value.trim()));
    }
    return true;
  }

  switch (key) {
    case '__prefix':
      state.options.prefix = value;
      return true;
    case '__suffix':
      state.options.suffix = value;
      return true;
    case '__description':
      state.description = value;
      return true;
    case '__providerOutput':
      state.providerOutput = value;
      return true;
    case '__metric':
      state.metric = value;
      return true;
    case '__threshold':
      state.threshold = Number.parseFloat(value);
      return true;
    case '__metadata':
      if (!uniqueErrorMessages.has(key)) {
        uniqueErrorMessages.add(key);
        logger.warn(
          'The "__metadata" column requires a key, e.g. "__metadata:category". This column will be ignored.',
        );
      }
      return true;
    default:
      return false;
  }
}

function applyAssertionConfigs(state: CsvTestCaseState): void {
  for (let index = 0; index < state.asserts.length; index++) {
    const assertion = state.asserts[index];
    assertion.metric = state.metric;

    const indexConfig = state.assertionConfigs[index];
    if (!indexConfig) {
      continue;
    }

    for (const [configKey, configValue] of Object.entries(indexConfig)) {
      (assertion as Record<string, unknown>)[configKey] = configValue;
      state.metadata[configKey] = configValue;
    }
  }
}

function buildTestCaseFromState(state: CsvTestCaseState): TestCase {
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

export function testCaseFromCsvRow(row: CsvRow): TestCase {
  const state = createCsvTestCaseState();
  const sanitizedRows = Object.entries(row).map(([key, value]) => [key.trim(), value] as const);

  for (const [key, value] of sanitizedRows) {
    warnSingleUnderscoreKey(key);
    if (applyReservedColumn(state, key, value)) {
      continue;
    }
    if (parseMetadataColumn(key, value, state.metadata)) {
      continue;
    }
    if (parseConfigColumn(key, value, state.assertionConfigs)) {
      continue;
    }
    state.vars[key] = value;
  }

  // Apply assertion configurations and metric to assertions
  applyAssertionConfigs(state);
  return buildTestCaseFromState(state);
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
