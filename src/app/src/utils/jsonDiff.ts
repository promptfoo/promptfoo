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
    const keyPath = path ? `${path}.${key}` : key;
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
  if (expected === null || expected === undefined) {
    return actual === null || actual === undefined
      ? []
      : [createDiff(path, expected, actual, 'added')];
  }

  if (actual === null || actual === undefined) {
    return [createDiff(path, expected, actual, 'removed')];
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
 * Safely parse JSON from a string, returning null if invalid
 */
export function tryParseJson(str: string | undefined | null): unknown | null {
  if (!str || typeof str !== 'string') {
    return null;
  }

  try {
    return JSON.parse(str);
  } catch {
    // Try to extract JSON from the string (for contains-json cases)
    const jsonMatch = str.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
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
    return `"${value}"`;
  }
  if (typeof value === 'object') {
    const str = JSON.stringify(value);
    // Truncate long objects
    if (str.length > 50) {
      return str.slice(0, 47) + '...';
    }
    return str;
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

export function buildUnifiedJsonDiff(expected: unknown, actual: unknown): JsonDiffLine[] {
  return diffLines(stringifyJson(expected), stringifyJson(actual)).flatMap((change) => {
    const type = change.added ? 'added' : change.removed ? 'removed' : 'same';
    return splitDiffLines(change.value).map((content) => ({ type, content }));
  });
}
