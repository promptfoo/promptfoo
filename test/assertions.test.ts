import { Response } from 'node-fetch';
import { runAssertions, runAssertion, assertionFromString } from '../src/assertions';
import * as util from '../src/util';

import type {
  Assertion,
  ApiProvider,
  AtomicTestCase,
  ProviderResponse,
  GradingResult,
} from '../src/types';

export class TestGrader implements ApiProvider {
  async callApi(): Promise<ProviderResponse> {
    return {
      output: JSON.stringify({ pass: true, reason: 'Test grading output' }),
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    };
  }

  id(): string {
    return 'TestGradingProvider';
  }
}
const Grader = new TestGrader();

describe('runAssertions', () => {
  const test: AtomicTestCase = {
    assert: [
      {
        type: 'equals',
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

  it('should fail when combined score is less than threshold', async () => {
    const output = 'Different output';

    const result: GradingResult = await runAssertions(
      {
        threshold: 0.5,
        assert: [
          {
            type: 'equals',
            value: 'Hello world',
            weight: 2,
          },
          {
            type: 'contains',
            value: 'world',
            weight: 1,
          },
        ],
      },
      'Hi there world',
    );
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Aggregate score 0.33 < 0.5 threshold');
  });

  it('should pass when combined score is greater than threshold', async () => {
    const output = 'Different output';

    const result: GradingResult = await runAssertions(
      {
        threshold: 0.25,
        assert: [
          {
            type: 'equals',
            value: 'Hello world',
            weight: 2,
          },
          {
            type: 'contains',
            value: 'world',
            weight: 1,
          },
        ],
      },
      'Hi there world',
    );
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Aggregate score 0.33 ≥ 0.25 threshold');
  });
});

describe('runAssertion', () => {
  const equalityAssertion: Assertion = {
    type: 'equals',
    value: 'Expected output',
  };

  const isJsonAssertion: Assertion = {
    type: 'is-json',
  };

  const isJsonAssertionWithSchema: Assertion = {
    type: 'is-json',
    value: {
      required: ['latitude', 'longitude'],
      type: 'object',
      properties: {
        latitude: {
          type: 'number',
          minimum: -90,
          maximum: 90,
        },
        longitude: {
          type: 'number',
          minimum: -180,
          maximum: 180,
        },
      },
    },
  };

  const containsJsonAssertion: Assertion = {
    type: 'contains-json',
  };

  const containsJsonAssertionWithSchema: Assertion = {
    type: 'contains-json',
    value: {
      required: ['latitude', 'longitude'],
      type: 'object',
      properties: {
        latitude: {
          type: 'number',
          minimum: -90,
          maximum: 90,
        },
        longitude: {
          type: 'number',
          minimum: -180,
          maximum: 180,
        },
      },
    },
  };

  const javascriptStringAssertion: Assertion = {
    type: 'javascript',
    value: 'output === "Expected output"',
  };

  const javascriptMultilineStringAssertion: Assertion = {
    type: 'javascript',
    value: `
      if (output === "Expected output") {
        return {
          pass: true,
          score: 0.5,
          reason: 'Assertion passed',
        };
      }
      return {
        pass: false,
        score: 0,
        reason: 'Assertion failed',
      };`,
  };

  const javascriptStringAssertionWithNumber: Assertion = {
    type: 'javascript',
    value: 'output.length * 10',
  };

  const javascriptStringAssertionWithNumberAndThreshold: Assertion = {
    type: 'javascript',
    value: 'output.length * 10',
    threshold: 0.5,
  };

  const javascriptFunctionAssertion: Assertion = {
    type: 'javascript',
    value: async (output: string) => ({
      pass: true,
      score: 0.5,
      reason: 'Assertion passed',
      assertion: null,
    }),
  };

  const javascriptFunctionFailAssertion: Assertion = {
    type: 'javascript',
    value: async (output: string) => ({
      pass: false,
      score: 0.5,
      reason: 'Assertion failed',
      assertion: null,
    }),
  };

  it('should pass when the equality assertion passes', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion(
      equalityAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the equality assertion fails', async () => {
    const output = 'Different output';

    const result: GradingResult = await runAssertion(
      equalityAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Expected output "Expected output"');
  });

  it('should pass when the is-json assertion passes', async () => {
    const output = '{"key": "value"}';

    const result: GradingResult = await runAssertion(isJsonAssertion, {} as AtomicTestCase, output);
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the is-json assertion fails', async () => {
    const output = 'Not valid JSON';

    const result: GradingResult = await runAssertion(isJsonAssertion, {} as AtomicTestCase, output);
    expect(result.pass).toBeFalsy();
    expect(result.reason).toContain('Expected output to be valid JSON');
  });

  it('should pass when the is-json assertion passes with schema', async () => {
    const output = '{"latitude": 80.123, "longitude": -1}';

    const result: GradingResult = await runAssertion(
      isJsonAssertionWithSchema,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the is-json assertion fails with schema', async () => {
    const output = '{"latitude": "high", "longitude": [-1]}';

    const result: GradingResult = await runAssertion(
      isJsonAssertionWithSchema,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe(
      'JSON does not conform to the provided schema. Errors: data/latitude must be number',
    );
  });

  it('should pass when the contains-json assertion passes', async () => {
    const output =
      'this is some other stuff \n\n {"key": "value", "key2": {"key3": "value2", "key4": ["value3", "value4"]}} \n\n blah blah';

    const result: GradingResult = await runAssertion(
      containsJsonAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the contains-json assertion fails', async () => {
    const output = 'Not valid JSON';

    const result: GradingResult = await runAssertion(
      containsJsonAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeFalsy();
    expect(result.reason).toContain('Expected output to contain valid JSON');
  });

  it('should pass when the contains-json assertion passes with schema', async () => {
    const output = 'here is the answer\n\n```{"latitude": 80.123, "longitude": -1}```';

    const result: GradingResult = await runAssertion(
      containsJsonAssertionWithSchema,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the contains-json assertion fails with schema', async () => {
    const output = 'here is the answer\n\n```{"latitude": "medium", "longitude": -1}```';

    const result: GradingResult = await runAssertion(
      containsJsonAssertionWithSchema,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe(
      'JSON does not conform to the provided schema. Errors: data/latitude must be number',
    );
  });

  it('should pass when the javascript assertion passes', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion(
      javascriptStringAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should pass a score through when the javascript returns a number', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion(
      javascriptStringAssertionWithNumber,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeTruthy();
    expect(result.score).toBe(output.length * 10);
    expect(result.reason).toBe('Assertion passed');
  });

  it('should pass when javascript returns a number above threshold', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion(
      javascriptStringAssertionWithNumberAndThreshold,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeTruthy();
    expect(result.score).toBe(output.length * 10);
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when javascript returns a number below threshold', async () => {
    const output = '';

    const result: GradingResult = await runAssertion(
      javascriptStringAssertionWithNumberAndThreshold,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeFalsy();
    expect(result.score).toBe(output.length * 10);
    expect(result.reason).toMatch('Custom function returned false');
  });

  it('should fail when the javascript assertion fails', async () => {
    const output = 'Different output';

    const result: GradingResult = await runAssertion(
      javascriptStringAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Custom function returned false\noutput === "Expected output"');
  });

  it('should pass when the function assertion passes - with vars', async () => {
    const output = 'Expected output';

    const javascriptStringAssertionWithVars: Assertion = {
      type: 'javascript',
      value: 'output === "Expected output" && context.vars.foo === "bar"',
    };
    const result: GradingResult = await runAssertion(
      javascriptStringAssertionWithVars,
      { vars: { foo: 'bar' } } as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the javascript does not match vars', async () => {
    const output = 'Expected output';

    const javascriptStringAssertionWithVars: Assertion = {
      type: 'javascript',
      value: 'output === "Expected output" && context.vars.foo === "something else"',
    };
    const result: GradingResult = await runAssertion(
      javascriptStringAssertionWithVars,
      { vars: { foo: 'bar' } } as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe(
      'Custom function returned false\noutput === "Expected output" && context.vars.foo === "something else"',
    );
  });

  it('should pass when the function returns pass', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion(
      javascriptFunctionAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeTruthy();
    expect(result.score).toBe(0.5);
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the function returns fail', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion(
      javascriptFunctionFailAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeFalsy();
    expect(result.score).toBe(0.5);
    expect(result.reason).toBe('Assertion failed');
  });

  it('should pass when the multiline javascript assertion passes', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion(
      javascriptMultilineStringAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should pass when the multiline javascript assertion fails', async () => {
    const output = 'Not the expected output';

    const result: GradingResult = await runAssertion(
      javascriptMultilineStringAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Assertion failed');
  });

  const notContainsAssertion: Assertion = {
    type: 'not-contains',
    value: 'Unexpected output',
  };

  it('should pass when the not-contains assertion passes', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion(
      notContainsAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the not-contains assertion fails', async () => {
    const output = 'Unexpected output';

    const result: GradingResult = await runAssertion(
      notContainsAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Expected output to not contain "Unexpected output"');
  });

  // Test for icontains assertion
  const containsLowerAssertion: Assertion = {
    type: 'icontains',
    value: 'expected output',
  };

  it('should pass when the icontains assertion passes', async () => {
    const output = 'EXPECTED OUTPUT';

    const result: GradingResult = await runAssertion(
      containsLowerAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the icontains assertion fails', async () => {
    const output = 'Different output';

    const result: GradingResult = await runAssertion(
      containsLowerAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Expected output to contain "expected output"');
  });

  // Test for not-icontains assertion
  const notContainsLowerAssertion: Assertion = {
    type: 'not-icontains',
    value: 'unexpected output',
  };

  it('should pass when the not-icontains assertion passes', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion(
      notContainsLowerAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the not-icontains assertion fails', async () => {
    const output = 'UNEXPECTED OUTPUT';

    const result: GradingResult = await runAssertion(
      notContainsLowerAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Expected output to not contain "unexpected output"');
  });

  // Test for contains-any assertion
  const containsAnyAssertion: Assertion = {
    type: 'contains-any',
    value: ['option1', 'option2', 'option3'],
  };

  it('should pass when the contains-any assertion passes', async () => {
    const output = 'This output contains option1';

    const result: GradingResult = await runAssertion(
      containsAnyAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the contains-any assertion fails', async () => {
    const output = 'This output does not contain any option';

    const result: GradingResult = await runAssertion(
      containsAnyAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Expected output to contain one of "option1, option2, option3"');
  });

  // Test for contains-all assertion
  const containsAllAssertion: Assertion = {
    type: 'contains-all',
    value: ['option1', 'option2', 'option3'],
  };

  it('should pass when the contains-all assertion passes', async () => {
    const output = 'This output contains option1, option2, and option3';

    const result: GradingResult = await runAssertion(
      containsAllAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the contains-all assertion fails', async () => {
    const output = 'This output contains only option1 and option2';

    const result: GradingResult = await runAssertion(
      containsAllAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Expected output to contain all of "option1, option2, option3"');
  });

  // Test for regex assertion
  const containsRegexAssertion: Assertion = {
    type: 'regex',
    value: '\\d{3}-\\d{2}-\\d{4}',
  };

  it('should pass when the regex assertion passes', async () => {
    const output = 'This output contains 123-45-6789';

    const result: GradingResult = await runAssertion(
      containsRegexAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the regex assertion fails', async () => {
    const output = 'This output does not contain the pattern';

    const result: GradingResult = await runAssertion(
      containsRegexAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Expected output to match regex "\\d{3}-\\d{2}-\\d{4}"');
  });

  // Test for not-regex assertion
  const notContainsRegexAssertion: Assertion = {
    type: 'not-regex',
    value: '\\d{3}-\\d{2}-\\d{4}',
  };

  it('should pass when the not-regex assertion passes', async () => {
    const output = 'This output does not contain the pattern';

    const result: GradingResult = await runAssertion(
      notContainsRegexAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the not-regex assertion fails', async () => {
    const output = 'This output contains 123-45-6789';

    const result: GradingResult = await runAssertion(
      notContainsRegexAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Expected output to not match regex "\\d{3}-\\d{2}-\\d{4}"');
  });

  // Tests for webhook assertion
  const webhookAssertion: Assertion = {
    type: 'webhook',
    value: 'https://example.com/webhook',
  };

  it('should pass when the webhook assertion passes', async () => {
    const output = 'Expected output';

    jest
      .spyOn(util, 'fetchWithRetries')
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ pass: true }), { status: 200 })),
      );

    const result: GradingResult = await runAssertion(
      webhookAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the webhook assertion fails', async () => {
    const output = 'Different output';

    jest
      .spyOn(util, 'fetchWithRetries')
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ pass: false }), { status: 200 })),
      );

    const result: GradingResult = await runAssertion(
      webhookAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Webhook returned false');
  });

  it('should fail when the webhook returns an error', async () => {
    const output = 'Expected output';

    jest
      .spyOn(util, 'fetchWithRetries')
      .mockImplementation(() => Promise.resolve(new Response('', { status: 500 })));

    const result: GradingResult = await runAssertion(
      webhookAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Webhook error: Webhook response status: 500');
  });

  // Test for rouge-n assertion
  const rougeNAssertion: Assertion = {
    type: 'rouge-n',
    value: 'This is the expected output.',
    threshold: 0.75,
  };

  it('should pass when the rouge-n assertion passes', async () => {
    const output = 'This is the expected output.';

    const result: GradingResult = await runAssertion(rougeNAssertion, {} as AtomicTestCase, output);
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('ROUGE-N score 1 is greater than or equal to threshold 0.75');
  });

  it('should fail when the rouge-n assertion fails', async () => {
    const output = 'some different output';

    const result: GradingResult = await runAssertion(rougeNAssertion, {} as AtomicTestCase, output);
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('ROUGE-N score 0.2 is less than threshold 0.75');
  });

  // Test for starts-with assertion
  const startsWithAssertion: Assertion = {
    type: 'starts-with',
    value: 'Expected',
  };

  it('should pass when the starts-with assertion passes', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion(
      startsWithAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the starts-with assertion fails', async () => {
    const output = 'Different output';

    const result: GradingResult = await runAssertion(
      startsWithAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Expected output to start with "Expected"');
  });

  it('should use the provider from the assertion if it exists', async () => {
    // Assertion grader passes
    const output = 'Expected output';
    const assertion: Assertion = {
      type: 'llm-rubric',
      value: 'Expected output',
      provider: Grader,
    };

    // Test grader fails
    const BogusGrader: ApiProvider = {
      id(): string {
        return 'BogusGrader';
      },
      async callApi(): Promise<ProviderResponse> {
        throw new Error('Should not be called');
      },
    };
    const test: AtomicTestCase = {
      assert: [assertion],
      options: {
        provider: BogusGrader,
      },
    };

    // Expect test to pass because assertion grader takes priority
    const result: GradingResult = await runAssertion(assertion, test, output);
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Test grading output');
  });

  // Test for levenshtein assertion
  const levenshteinAssertion: Assertion = {
    type: 'levenshtein',
    value: 'Expected output',
    threshold: 5,
  };

  it('should pass when the levenshtein assertion passes', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion(
      levenshteinAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the levenshtein assertion fails', async () => {
    const output = 'Different output';

    const result: GradingResult = await runAssertion(
      levenshteinAssertion,
      {} as AtomicTestCase,
      output,
    );
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Levenshtein distance 8 is greater than threshold 5');
  });
});

describe('assertionFromString', () => {
  it('should create an equality assertion', () => {
    const expected = 'Expected output';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('equals');
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
    expect(result.type).toBe('javascript');
    expect(result.value).toBe('output === "Expected output"');
  });

  it('should create a similarity assertion', () => {
    const expected = 'similar(0.9):Expected output';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('similar');
    expect(result.value).toBe('Expected output');
    expect(result.threshold).toBe(0.9);
  });

  it('should create a contains assertion', () => {
    const expected = 'contains:substring';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('contains');
    expect(result.value).toBe('substring');
  });

  it('should create a not-contains assertion', () => {
    const expected = 'not-contains:substring';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('not-contains');
    expect(result.value).toBe('substring');
  });

  it('should create a contains-any assertion', () => {
    const expected = 'contains-any:substring1,substring2';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('contains-any');
    expect(result.value).toEqual(['substring1', 'substring2']);
  });

  it('should create a contains-all assertion', () => {
    const expected = 'contains-all:substring1,substring2';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('contains-all');
    expect(result.value).toEqual(['substring1', 'substring2']);
  });

  it('should create a regex assertion', () => {
    const expected = 'regex:\\d+';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('regex');
    expect(result.value).toBe('\\d+');
  });

  it('should create a not-regex assertion', () => {
    const expected = 'not-regex:\\d+';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('not-regex');
    expect(result.value).toBe('\\d+');
  });

  it('should create an icontains assertion', () => {
    const expected = 'icontains:substring';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('icontains');
    expect(result.value).toBe('substring');
  });

  it('should create a not-icontains assertion', () => {
    const expected = 'not-icontains:substring';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('not-icontains');
    expect(result.value).toBe('substring');
  });

  it('should create a webhook assertion', () => {
    const expected = 'webhook:https://example.com';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('webhook');
    expect(result.value).toBe('https://example.com');
  });

  it('should create a not-webhook assertion', () => {
    const expected = 'not-webhook:https://example.com';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('not-webhook');
    expect(result.value).toBe('https://example.com');
  });

  it('should create a rouge-n assertion', () => {
    const expected = 'rouge-n(0.225):foo';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('rouge-n');
    expect(result.value).toBe('foo');
    expect(result.threshold).toBeCloseTo(0.225);
  });

  it('should create a not-rouge-n assertion', () => {
    const expected = 'not-rouge-n(0.225):foo';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('not-rouge-n');
    expect(result.value).toBe('foo');
    expect(result.threshold).toBeCloseTo(0.225);
  });

  it('should create a starts-with assertion', () => {
    const expected = 'starts-with:Expected';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('starts-with');
    expect(result.value).toBe('Expected');
  });

  it('should create a levenshtein assertion', () => {
    const expected = 'levenshtein(5):Expected output';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('levenshtein');
    expect(result.value).toBe('Expected output');
    expect(result.threshold).toBe(5);
  });
});
