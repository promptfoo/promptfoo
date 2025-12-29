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

/**
 * Recursively compute differences between two JSON values
 * Returns an array of path-based differences
 */
export function computeJsonDiff(expected: unknown, actual: unknown, path: string = ''): JsonDiff[] {
  const diffs: JsonDiff[] = [];

  // Handle null/undefined
  if (expected === null || expected === undefined) {
    if (actual !== null && actual !== undefined) {
      diffs.push({ path: path || '(root)', expected, actual, type: 'added' });
    }
    return diffs;
  }

  if (actual === null || actual === undefined) {
    diffs.push({ path: path || '(root)', expected, actual, type: 'removed' });
    return diffs;
  }

  // Handle type mismatches
  if (typeof expected !== typeof actual) {
    diffs.push({ path: path || '(root)', expected, actual, type: 'changed' });
    return diffs;
  }

  // Handle arrays
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const maxLength = Math.max(expected.length, actual.length);
    for (let i = 0; i < maxLength; i++) {
      const itemPath = path ? `${path}[${i}]` : `[${i}]`;
      if (i >= expected.length) {
        diffs.push({ path: itemPath, expected: undefined, actual: actual[i], type: 'added' });
      } else if (i >= actual.length) {
        diffs.push({ path: itemPath, expected: expected[i], actual: undefined, type: 'removed' });
      } else {
        diffs.push(...computeJsonDiff(expected[i], actual[i], itemPath));
      }
    }
    return diffs;
  }

  // Handle objects
  if (typeof expected === 'object' && typeof actual === 'object') {
    const expectedObj = expected as Record<string, unknown>;
    const actualObj = actual as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(expectedObj), ...Object.keys(actualObj)]);

    for (const key of allKeys) {
      const keyPath = path ? `${path}.${key}` : key;
      if (!(key in expectedObj)) {
        diffs.push({ path: keyPath, expected: undefined, actual: actualObj[key], type: 'added' });
      } else if (key in actualObj) {
        diffs.push(...computeJsonDiff(expectedObj[key], actualObj[key], keyPath));
      } else {
        diffs.push({
          path: keyPath,
          expected: expectedObj[key],
          actual: undefined,
          type: 'removed',
        });
      }
    }
    return diffs;
  }

  // Handle primitives
  if (expected !== actual) {
    diffs.push({ path: path || '(root)', expected, actual, type: 'changed' });
  }

  return diffs;
}

/**
 * Check if a grading result is a JSON-related assertion that could benefit from diff view.
 *
 * Only `equals` assertions with object values are supported because:
 * - `is-json` and `contains-json` typically use JSON Schema validation
 * - JSON Schema validation already provides path-based error messages via AJV
 *   (e.g., "data/age must be equal to constant")
 * - Comparing a schema to actual output would produce nonsensical diffs
 */
export function isJsonAssertion(result: GradingResult): boolean {
  const type = result.assertion?.type;
  const value = result.assertion?.value;

  // Only equals with object value benefits from JSON diff view
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
