import { diffLines } from 'diff';
import type { GradingResult } from '@promptfoo/types';

/**
 * Represents a single difference between expected and actual JSON values
 */
export interface JsonDiff {
  path: string;
  expected: unknown;
  actual: unknown;
  type: 'changed' | 'added' | 'removed';
}

export interface JsonDiffLine {
  type: 'same' | 'removed' | 'added';
  content: string;
}

function getDiffPath(path: string): string {
  return path || '(root)';
}

function createDiff(
  path: string,
  expected: unknown,
  actual: unknown,
  type: JsonDiff['type'],
): JsonDiff {
  return { path: getDiffPath(path), expected, actual, type };
}

function appendObjectPath(path: string, key: string): string {
  const segment = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : `[${JSON.stringify(key)}]`;

  if (!path) {
    return segment;
  }

  return segment.startsWith('[') ? `${path}${segment}` : `${path}.${segment}`;
}

function computeArrayDiff(expected: unknown[], actual: unknown[], path: string): JsonDiff[] {
  const diffs: JsonDiff[] = [];
  const maxLength = Math.max(expected.length, actual.length);

  for (let index = 0; index < maxLength; index++) {
    const itemPath = path ? `${path}[${index}]` : `[${index}]`;
    if (index >= expected.length) {
      diffs.push(createDiff(itemPath, undefined, actual[index], 'added'));
    } else if (index >= actual.length) {
      diffs.push(createDiff(itemPath, expected[index], undefined, 'removed'));
    } else {
      diffs.push(...computeJsonDiff(expected[index], actual[index], itemPath));
    }
  }

  return diffs;
}

function computeObjectDiff(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
  path: string,
): JsonDiff[] {
  const diffs: JsonDiff[] = [];
  const allKeys = new Set([...Object.keys(expected), ...Object.keys(actual)]);

  for (const key of allKeys) {
    const keyPath = appendObjectPath(path, key);
    if (!(key in expected)) {
      diffs.push(createDiff(keyPath, undefined, actual[key], 'added'));
    } else if (key in actual) {
      diffs.push(...computeJsonDiff(expected[key], actual[key], keyPath));
    } else {
      diffs.push(createDiff(keyPath, expected[key], undefined, 'removed'));
    }
  }

  return diffs;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Recursively compute differences between two JSON values
 * Returns an array of path-based differences
 */
export function computeJsonDiff(expected: unknown, actual: unknown, path: string = ''): JsonDiff[] {
  if (expected === undefined) {
    return actual === undefined ? [] : [createDiff(path, expected, actual, 'added')];
  }

  if (actual === undefined) {
    return [createDiff(path, expected, actual, 'removed')];
  }

  if (expected === null || actual === null) {
    return expected === actual ? [] : [createDiff(path, expected, actual, 'changed')];
  }

  if (typeof expected !== typeof actual) {
    return [createDiff(path, expected, actual, 'changed')];
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    return computeArrayDiff(expected, actual, path);
  }

  if (Array.isArray(expected) || Array.isArray(actual)) {
    return [createDiff(path, expected, actual, 'changed')];
  }

  if (isRecordValue(expected) && isRecordValue(actual)) {
    return computeObjectDiff(expected, actual, path);
  }

  return expected === actual ? [] : [createDiff(path, expected, actual, 'changed')];
}

/**
 * Check if a grading result is a JSON-related assertion that could benefit from diff view.
 *
 * Only `equals` assertions with object or array values are supported because:
 * - `is-json` and `contains-json` typically use JSON Schema validation
 * - JSON Schema validation already provides path-based error messages via AJV
 *   (e.g., "data/age must be equal to constant")
 * - Comparing a schema to actual output would produce nonsensical diffs
 */
export function isJsonAssertion(result: GradingResult): boolean {
  const type = result.assertion?.type;
  const value = result.assertion?.value;

  // Only equals with object or array values benefits from JSON diff view
  if (type === 'equals' && typeof value === 'object' && value !== null) {
    return true;
  }

  return false;
}

/**
 * Safely parse complete JSON output, returning undefined if invalid.
 */
export function tryParseJson(str: string | undefined | null): unknown | undefined {
  if (!str || typeof str !== 'string') {
    return undefined;
  }

  try {
    return JSON.parse(str);
  } catch {
    return undefined;
  }
}

/**
 * Format a value for display in the diff view
 */
export function formatDiffValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value) ?? '""';
  }
  if (typeof value === 'object') {
    try {
      const str = JSON.stringify(value);
      if (str === undefined) {
        return String(value);
      }
      // Truncate long objects
      if (str.length > 50) {
        return str.slice(0, 47) + '...';
      }
      return str;
    } catch {
      return '[unserializable value]';
    }
  }
  return String(value);
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? String(value);
}

function splitDiffLines(value: string): string[] {
  const withoutTrailingNewline = value.endsWith('\n') ? value.slice(0, -1) : value;
  return withoutTrailingNewline.split('\n');
}

export function buildUnifiedJsonTextDiff(expectedJson: string, actualJson: string): JsonDiffLine[] {
  return diffLines(expectedJson, actualJson).flatMap((change) => {
    const type = change.added ? 'added' : change.removed ? 'removed' : 'same';
    return splitDiffLines(change.value).map((content) => ({ type, content }));
  });
}

export function buildUnifiedJsonDiff(expected: unknown, actual: unknown): JsonDiffLine[] {
  return buildUnifiedJsonTextDiff(stringifyJson(expected), stringifyJson(actual));
}
