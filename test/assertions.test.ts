// assertions.test.ts

import {
  runAssertions,
  runAssertion,
  matchesSimilarity,
  matchesLlmRubric,
  assertionFromString,
} from '../src/assertions';
import { DefaultEmbeddingProvider } from '../src/providers/openai';
import type {
  Assertion,
  ApiProvider,
  TestCase,
  GradingConfig,
  ProviderResponse,
  GradingResult,
} from '../src/types';

describe('runAssertions', () => {
  const test: TestCase = {
    assert: [
      {
        type: 'equality',
        value: 'Expected output',
      },
    ],
  };

  it('should pass when all assertions pass', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertions(test, output);
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('All assertions passed');
  });

  it('should fail when any assertion fails', async () => {
    const output = 'Different output';

    const result: GradingResult = await runAssertions(test, output);
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Expected output "Expected output"');
  });
});

describe('runAssertion', () => {
  const equalityAssertion: Assertion = {
    type: 'equality',
    value: 'Expected output',
  };

  const isJsonAssertion: Assertion = {
    type: 'is-json',
  };

  const containsJsonAssertion: Assertion = {
    type: 'contains-json',
  };

  const functionAssertion: Assertion = {
    type: 'function',
    value: 'output === "Expected output"',
  };

  it('should pass when the equality assertion passes', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion(equalityAssertion, {} as TestCase, output);
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the equality assertion fails', async () => {
    const output = 'Different output';

    const result: GradingResult = await runAssertion(equalityAssertion, {} as TestCase, output);
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Expected output "Expected output"');
  });

  it('should pass when the is-json assertion passes', async () => {
    const output = '{"key": "value"}';

    const result: GradingResult = await runAssertion(isJsonAssertion, {} as TestCase, output);
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the is-json assertion fails', async () => {
    const output = 'Not valid JSON';

    const result: GradingResult = await runAssertion(isJsonAssertion, {} as TestCase, output);
    expect(result.pass).toBeFalsy();
    expect(result.reason).toContain("Expected output to be valid JSON");
  });

  it('should pass when the contains-json assertion passes', async () => {
    const output = 'this is some other stuff \n\n {"key": "value", "key2": {"key3": "value2", "key4": ["value3", "value4"]}} \n\n blah blah';

    const result: GradingResult = await runAssertion(containsJsonAssertion, {} as TestCase, output);
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the contains-json assertion fails', async () => {
    const output = 'Not valid JSON';

    const result: GradingResult = await runAssertion(containsJsonAssertion, {} as TestCase, output);
    expect(result.pass).toBeFalsy();
    expect(result.reason).toContain("Expected output to contain valid JSON");
  });

  it('should pass when the function assertion passes', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion(functionAssertion, {} as TestCase, output);
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the function assertion fails', async () => {
    const output = 'Different output';

    const result: GradingResult = await runAssertion(functionAssertion, {} as TestCase, output);
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Custom function returned false');
  });
});

describe('assertionFromString', () => {
  it('should create an equality assertion', () => {
    const expected = 'Expected output';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('equality');
    expect(result.value).toBe(expected);
  });

  it('should create an is-json assertion', () => {
    const expected = 'is-json';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('is-json');
  });

  it('should create an contains-json assertion', () => {
    const expected = 'contains-json';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('contains-json');
  });

  it('should create a function assertion', () => {
    const expected = 'fn:output === "Expected output"';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('function');
    expect(result.value).toBe('output === "Expected output"');
  });

  it('should create a similarity assertion', () => {
    const expected = 'similar(0.9):Expected output';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('similarity');
    expect(result.value).toBe('Expected output');
    expect(result.threshold).toBe(0.9);
  });
});

describe('matchesSimilarity', () => {
  beforeEach(() => {
    jest.spyOn(DefaultEmbeddingProvider, 'callEmbeddingApi').mockImplementation((text) => {
      if (text === 'Expected output' || text === 'Sample output') {
        return Promise.resolve({
          embedding: [1, 0, 0],
          tokenUsage: { total: 5, prompt: 2, completion: 3 },
        });
      } else if (text === 'Different output') {
        return Promise.resolve({
          embedding: [0, 1, 0],
          tokenUsage: { total: 5, prompt: 2, completion: 3 },
        });
      }
      return Promise.reject(new Error('Unexpected input'));
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should pass when similarity is above the threshold', async () => {
    const expected = 'Expected output';
    const output = 'Sample output';
    const threshold = 0.5;

    const result = await matchesSimilarity(expected, output, threshold);
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Similarity 1 is greater than threshold 0.5');
  });

  it('should fail when similarity is below the threshold', async () => {
    const expected = 'Expected output';
    const output = 'Different output';
    const threshold = 0.9;

    const result = await matchesSimilarity(expected, output, threshold);
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Similarity 0 is less than threshold 0.9');
  });
});

describe('matchesLlmRubric', () => {
  class TestGrader implements ApiProvider {
    async callApi(): Promise<ProviderResponse> {
      return {
        output: JSON.stringify({ pass: true }),
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      };
    }

    id(): string {
      return 'TestGradingProvider';
    }
  }
  const Grader = new TestGrader();

  it('should pass when the grading provider returns a passing result', async () => {
    const expected = 'Expected output';
    const output = 'Sample output';
    const options: GradingConfig = {
      prompt: 'Grading prompt',
      provider: Grader,
    };

    const result = await matchesLlmRubric(expected, output, options);
    expect(result.pass).toBeTruthy();
  });

  it('should fail when the grading provider returns a failing result', async () => {
    const expected = 'Expected output';
    const output = 'Different output';
    const options: GradingConfig = {
      prompt: 'Grading prompt',
      provider: Grader,
    };

    jest.spyOn(Grader, 'callApi').mockResolvedValueOnce({
      output: JSON.stringify({ pass: false, reason: 'Grading failed' }),
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    const result = await matchesLlmRubric(expected, output, options);
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Grading failed');
  });
});
