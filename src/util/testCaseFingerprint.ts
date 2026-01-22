import { sha256 } from './createHash';

import type { Assertion, AtomicTestCase, TestCase } from '../types';

/**
 * Input for test case fingerprinting.
 * Only includes fields that define the test case identity - excludes runtime options,
 * provider overrides, and execution metadata.
 */
export interface TestCaseFingerprintInput {
  vars?: Record<string, unknown>;
  assert?: Assertion[];
  description?: string;
}

/**
 * Recursively sorts object keys for deterministic JSON output.
 * Handles circular references by tracking visited objects.
 */
function sortObjectKeys(obj: unknown, visited = new WeakSet<object>()): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle primitive types
  if (typeof obj !== 'object') {
    return obj;
  }

  // Handle circular references
  if (visited.has(obj as object)) {
    return '[Circular]';
  }
  visited.add(obj as object);

  // Handle special object types
  if (obj instanceof Date) {
    return obj.toISOString();
  }
  if (obj instanceof RegExp) {
    return obj.toString();
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => sortObjectKeys(item, visited));
  }

  // Handle plain objects
  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  for (const key of keys) {
    sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key], visited);
  }
  return sorted;
}

/**
 * Computes a stable fingerprint for a test case based on its content.
 * The fingerprint is a SHA256 hash of the canonical JSON representation.
 *
 * Only vars, assert, and description are considered for identity.
 * This ensures that the same test case content produces the same fingerprint
 * regardless of provider settings, runtime options, or metadata.
 *
 * @param testCase - The test case to fingerprint
 * @returns A 64-character hex string (SHA256 hash)
 */
export function computeTestCaseFingerprint(testCase: TestCaseFingerprintInput): string {
  // Build canonical object with only identity-defining fields
  const canonical = {
    assert: sortObjectKeys(testCase.assert || []),
    description: testCase.description || '',
    vars: sortObjectKeys(testCase.vars || {}),
  };

  // Create deterministic JSON (keys already sorted)
  const json = JSON.stringify(canonical);

  return sha256(json);
}

/**
 * Computes a stable test case ID from the fingerprint.
 * Uses a prefix for easy identification and takes the first 16 chars
 * of the fingerprint for a shorter but still unique ID.
 *
 * @param fingerprint - The full SHA256 fingerprint
 * @returns A test case ID string like "tc-a1b2c3d4e5f6g7h8"
 */
export function computeTestCaseId(fingerprint: string): string {
  return `tc-${fingerprint.substring(0, 16)}`;
}

/**
 * Extracts fingerprint input from a full test case.
 * Filters out runtime-specific fields that shouldn't affect identity.
 */
export function extractFingerprintInput(
  testCase: TestCase | AtomicTestCase,
): TestCaseFingerprintInput {
  return {
    vars: testCase.vars as Record<string, unknown> | undefined,
    assert: testCase.assert as Assertion[] | undefined,
    description: testCase.description,
  };
}

/**
 * Convenience function to compute both fingerprint and ID for a test case.
 */
export function computeTestCaseIdentity(testCase: TestCaseFingerprintInput): {
  fingerprint: string;
  id: string;
} {
  const fingerprint = computeTestCaseFingerprint(testCase);
  const id = computeTestCaseId(fingerprint);
  return { fingerprint, id };
}
