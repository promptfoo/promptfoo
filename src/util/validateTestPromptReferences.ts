import { doesPromptRefMatch } from './promptMatching';

import type { Prompt, TestCase } from '../types/index';

export class PromptReferenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptReferenceValidationError';
  }
}

/**
 * Get available prompt identifiers for error messages.
 */
function getAvailablePromptIdentifiers(prompts: Prompt[]): string[] {
  const identifiers = new Set<string>();
  for (const p of prompts) {
    if (p.label) {
      identifiers.add(p.label);
    }
    if (p.id) {
      identifiers.add(p.id);
    }
  }
  return Array.from(identifiers).sort();
}

/**
 * Validate that all prompt references in test cases exist in the available prompts.
 * This is strict parse-time validation - any invalid reference is an error.
 *
 * @param tests - Array of test cases to validate
 * @param prompts - Array of available prompts
 * @param defaultTest - Optional default test case to validate
 * @throws PromptReferenceValidationError if any prompt reference is invalid
 */
export function validateTestPromptReferences(
  tests: TestCase[],
  prompts: Prompt[],
  defaultTest?: Partial<TestCase>,
): void {
  // Validate defaultTest.prompts first
  if (defaultTest?.prompts && Array.isArray(defaultTest.prompts)) {
    for (const ref of defaultTest.prompts) {
      const matchFound = prompts.some((prompt) => doesPromptRefMatch(ref, prompt));
      if (!matchFound) {
        const available = getAvailablePromptIdentifiers(prompts);
        throw new PromptReferenceValidationError(
          `defaultTest references prompt "${ref}" which does not exist.\n` +
            `Available prompts: [${available.join(', ')}]`,
        );
      }
    }
  }

  // Validate each test case's prompts
  for (let testIdx = 0; testIdx < tests.length; testIdx++) {
    const test = tests[testIdx];
    if (!test.prompts || !Array.isArray(test.prompts) || test.prompts.length === 0) {
      continue;
    }

    for (const ref of test.prompts) {
      const matchFound = prompts.some((prompt) => doesPromptRefMatch(ref, prompt));
      if (!matchFound) {
        const available = getAvailablePromptIdentifiers(prompts);
        const testDesc = test.description ? ` ("${test.description}")` : '';
        throw new PromptReferenceValidationError(
          `Test #${testIdx + 1}${testDesc} references prompt "${ref}" which does not exist.\n` +
            `Available prompts: [${available.join(', ')}]`,
        );
      }
    }
  }
}
