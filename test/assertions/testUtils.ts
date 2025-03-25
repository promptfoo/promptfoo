/**
 * Shared test utilities and mocks for assertion tests
 */
import type { GradingResult } from '../../src/types';

/**
 * Sets up common mocks that all assertion tests might need
 */
export function setupCommonMocks(): void {
  // Mock console.error to prevent noisy test output
  jest.spyOn(console, 'error').mockImplementation(() => {});

  // Create type-safe mock implementations
  const matchesEqualsMock = jest
    .fn()
    .mockImplementation((expected: string, actual: string): Promise<GradingResult> => {
      return Promise.resolve({
        pass: expected === actual,
        score: expected === actual ? 1 : 0,
        reason:
          expected === actual
            ? `Output matches expected: ${expected}`
            : `Output does not match expected: ${expected}`,
      });
    });

  const matchesContainsMock = jest
    .fn()
    .mockImplementation((expected: string, actual: string): Promise<GradingResult> => {
      const pass = typeof actual === 'string' && actual.includes(expected);
      return Promise.resolve({
        pass,
        score: pass ? 1 : 0,
        reason: pass
          ? `Output contains expected string: ${expected}`
          : `Output does not contain expected string: ${expected}`,
      });
    });

  // We're not mocking modules here, as they should be mocked at the top level in each test file
}

/**
 * Helper function to create a test object with necessary properties
 */
export function createMockTest(assertionOptions: any = {}) {
  return {
    vars: {},
    assert: [assertionOptions],
  };
}

/**
 * Helper function to create a provider response object
 */
export function createMockResponse(output: string | object, metadata: any = {}) {
  return {
    output,
    metadata,
  };
}
