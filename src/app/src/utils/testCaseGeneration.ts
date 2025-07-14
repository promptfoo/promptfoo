import { callApi } from '@app/utils/api';
import type { TestCase } from '@promptfoo/types';

interface GenerateTestCaseWithAssertionsOptions {
  prompts: string[];
  existingTests: TestCase[];
  provider?: string;
}

/**
 * Generates a single test case with assertions
 * Makes two API calls: first for the test case, then for assertions
 */
export async function generateTestCaseWithAssertions({
  prompts,
  existingTests,
  provider,
}: GenerateTestCaseWithAssertionsOptions): Promise<TestCase> {
  // First, generate the test case
  const testResponse = await callApi('/generate/dataset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompts: prompts.map((p) => ({ raw: p })),
      tests: existingTests,
      options: {
        numPersonas: 1,
        numTestCasesPerPersona: 1,
        provider,
      },
    }),
  });

  if (!testResponse.ok) {
    throw new Error('Test case generation failed');
  }

  const { results: testResults } = await testResponse.json();
  if (!testResults || testResults.length === 0) {
    throw new Error('No test case generated');
  }

  // Create the test case with variables
  const newTestCase: TestCase = {
    vars: testResults[0],
  };

  // Then generate assertions for this specific test case
  try {
    const assertionResponse = await callApi('/generate/assertions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompts: prompts.map((p) => ({ raw: p })),
        tests: [newTestCase],
        options: {
          type: 'llm-rubric',
          numQuestions: 2,
          provider,
        },
      }),
    });

    if (assertionResponse.ok) {
      const { results: assertionResults } = await assertionResponse.json();
      if (assertionResults && assertionResults.length > 0) {
        newTestCase.assert = assertionResults;
      }
    }
  } catch (_error) {
    // If assertions fail, return test case without assertions
  }

  return newTestCase;
}

/**
 * Generates assertions for a specific test case
 */
export async function generateAssertionsForTestCase({
  prompts,
  testCase,
  provider,
}: {
  prompts: string[];
  testCase: TestCase;
  provider?: string;
}): Promise<TestCase> {
  try {
    const assertionResponse = await callApi('/generate/assertions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompts: prompts.map((p) => ({ raw: p })),
        tests: [testCase],
        options: {
          type: 'llm-rubric',
          numQuestions: 2,
          provider,
        },
      }),
    });

    if (assertionResponse.ok) {
      const { results: assertions } = await assertionResponse.json();
      if (assertions && assertions.length > 0) {
        return { ...testCase, assert: assertions };
      }
    }
  } catch (_error) {
    // Return original test case if assertion generation fails
  }

  return testCase;
}
