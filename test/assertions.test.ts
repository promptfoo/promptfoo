import * as fs from 'fs';
import * as path from 'path';
import child_process from 'child_process';
import Stream from 'stream';

import { Response } from 'node-fetch';
import { runAssertions, runAssertion, assertionFromString } from '../src/assertions';
import * as fetch from '../src/fetch';

import type {
  Assertion,
  ApiProvider,
  AtomicTestCase,
  ProviderResponse,
  GradingResult,
} from '../src/types';
import { OpenAiChatCompletionProvider } from '../src/providers/openai';

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  promises: {
    readFile: jest.fn(),
  },
}));

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

beforeEach(() => {
  jest.resetModules();
});

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

    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      test,
      output,
    });
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('All assertions passed');
  });

  it('should fail when any assertion fails', async () => {
    const output = 'Different output';

    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      test,
      output,
    });
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Expected output "Expected output" but got "Different output"');
  });

  it('should handle output as an object', async () => {
    const output = { key: 'value' };

    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      test,
      output,
    });
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Expected output "Expected output" but got "{"key":"value"}"');
  });

  it('should fail when combined score is less than threshold', async () => {
    const output = 'Different output';

    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      test: {
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
      output: 'Hi there world',
    });
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Aggregate score 0.33 < 0.5 threshold');
  });

  it('should pass when combined score is greater than threshold', async () => {
    const output = 'Different output';

    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      test: {
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
      output: 'Hi there world',
    });
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

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: equalityAssertion,
      test: {} as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the equality assertion fails', async () => {
    const output = 'Different output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: equalityAssertion,
      test: {} as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Expected output "Expected output" but got "Different output"');
  });

  it('should handle output as an object', async () => {
    const output = { key: 'value' };
    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: equalityAssertion,
      test: {} as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Expected output "Expected output" but got "{"key":"value"}"');
  });

  it('should pass when the is-json assertion passes', async () => {
    const output = '{"key": "value"}';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: isJsonAssertion,
      test: {} as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the is-json assertion fails', async () => {
    const output = 'Not valid JSON';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: isJsonAssertion,
      test: {} as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeFalsy();
    expect(result.reason).toContain('Expected output to be valid JSON');
  });

  it('should pass when the is-json assertion passes with schema', async () => {
    const output = '{"latitude": 80.123, "longitude": -1}';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: isJsonAssertionWithSchema,
      test: {} as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the is-json assertion fails with schema', async () => {
    const output = '{"latitude": "high", "longitude": [-1]}';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: isJsonAssertionWithSchema,
      test: {} as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe(
      'JSON does not conform to the provided schema. Errors: data/latitude must be number',
    );
  });

  it('should validate JSON with formats using ajv-formats', async () => {
    const output = '{"date": "2021-08-29"}';
    const schemaWithFormat = {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          format: 'date',
        },
      },
      required: ['date'],
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: { type: 'is-json', value: schemaWithFormat },
      test: {} as AtomicTestCase,
      output,
    });

    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should validate JSON with formats using ajv-formats - failure', async () => {
    const output = '{"date": "not a date"}';
    const schemaWithFormat = {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          format: 'date',
        },
      },
      required: ['date'],
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: { type: 'is-json', value: schemaWithFormat },
      test: {} as AtomicTestCase,
      output,
    });

    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe(
      'JSON does not conform to the provided schema. Errors: data/date must match format "date"',
    );
  });

  it('should pass when the is-json assertion passes with external schema', async () => {
    const assertion: Assertion = {
      type: 'is-json',
      value: 'file:///schema.json',
    };

    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({
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
      }),
    );

    const output = '{"latitude": 80.123, "longitude": -1}';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion,
      test: {} as AtomicTestCase,
      output,
    });
    expect(fs.readFileSync).toHaveBeenCalledWith('/schema.json', 'utf8');
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the is-json assertion fails with external schema', async () => {
    const assertion: Assertion = {
      type: 'is-json',
      value: 'file:///schema.json',
    };

    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({
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
      }),
    );

    const output = '{"latitude": "high", "longitude": [-1]}';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion,
      test: {} as AtomicTestCase,
      output,
    });
    expect(fs.readFileSync).toHaveBeenCalledWith('/schema.json', 'utf8');
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe(
      'JSON does not conform to the provided schema. Errors: data/latitude must be number',
    );
  });

  it('should pass when the contains-json assertion passes', async () => {
    const output =
      'this is some other stuff \n\n {"key": "value", "key2": {"key3": "value2", "key4": ["value3", "value4"]}} \n\n blah blah';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: containsJsonAssertion,
      test: {} as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should pass when the contains-json assertion passes with multiple json values', async () => {
    const output =
      'this is some other stuff \n\n {"key": "value", "key2": {"key3": "value2", "key4": ["value3", "value4"]}} another {"key": "value", "key2": {"key3": "value2", "key4": ["value3", "value4"]}}\n\n blah blah';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: containsJsonAssertion,
      test: {} as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should pass when the contains-json assertion passes with valid and invalid json', async () => {
    const output = 'There is an extra opening bracket \n\n { {"key": "value"} \n\n blah blah';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: containsJsonAssertion,
      test: {} as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the contains-json assertion fails', async () => {
    const output = 'Not valid JSON';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: containsJsonAssertion,
      test: {} as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeFalsy();
    expect(result.reason).toContain('Expected output to contain valid JSON');
  });

  it('should pass when the contains-json assertion passes with schema', async () => {
    const output = 'here is the answer\n\n```{"latitude": 80.123, "longitude": -1}```';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: containsJsonAssertionWithSchema,
      test: {} as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should pass when the contains-json assertion passes with external schema', async () => {
    const assertion: Assertion = {
      type: 'contains-json',
      value: 'file:///schema.json',
    };

    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({
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
      }),
    );

    const output = 'here is the answer\n\n```{"latitude": 80.123, "longitude": -1}```';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion,
      test: {} as AtomicTestCase,
      output,
    });
    expect(fs.readFileSync).toHaveBeenCalledWith('/schema.json', 'utf8');
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the contains-json assertion fails with external schema', async () => {
    const assertion: Assertion = {
      type: 'contains-json',
      value: 'file:///schema.json',
    };

    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({
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
      }),
    );

    const output = 'here is the answer\n\n```{"latitude": "medium", "longitude": -1}```';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion,
      test: {} as AtomicTestCase,
      output,
    });
    expect(fs.readFileSync).toHaveBeenCalledWith('/schema.json', 'utf8');
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe(
      'JSON does not conform to the provided schema. Errors: data/latitude must be number',
    );
  });

  it('should fail when the contains-json assertion fails with external schema', async () => {
    const output = 'here is the answer\n\n```{"latitude": "medium", "longitude": -1}```';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: containsJsonAssertionWithSchema,
      test: {} as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe(
      'JSON does not conform to the provided schema. Errors: data/latitude must be number',
    );
  });

  it('should pass when the javascript assertion passes', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: javascriptStringAssertion,
      test: {} as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should pass a score through when the javascript returns a number', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: javascriptStringAssertionWithNumber,
      test: {} as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeTruthy();
    expect(result.score).toBe(output.length * 10);
    expect(result.reason).toBe('Assertion passed');
  });

  it('should pass when javascript returns a number above threshold', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: javascriptStringAssertionWithNumberAndThreshold,
      test: {} as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeTruthy();
    expect(result.score).toBe(output.length * 10);
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when javascript returns a number below threshold', async () => {
    const output = '';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: javascriptStringAssertionWithNumberAndThreshold,
      test: {} as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeFalsy();
    expect(result.score).toBe(output.length * 10);
    expect(result.reason).toMatch('Custom function returned false');
  });

  it('should set score when javascript returns false', async () => {
    const output = 'Test output';

    const assertion: Assertion = {
      type: 'javascript',
      value: 'output.length < 1',
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion,
      test: {} as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeFalsy();
    expect(result.score).toBe(0);
    expect(result.reason).toMatch('Custom function returned false');
  });

  it('should fail when the javascript assertion fails', async () => {
    const output = 'Different output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: javascriptStringAssertion,
      test: {} as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Custom function returned false\noutput === "Expected output"');
  });

  it('should pass when assertion passes - with vars', async () => {
    const output = 'Expected output';

    const assertion: Assertion = {
      type: 'equals',
      value: '{{ foo }}',
    };
    const result: GradingResult = await runAssertion({
      prompt: 'variable value',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion,
      test: { vars: { foo: 'Expected output' } } as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should pass when javascript function assertion passes - with vars', async () => {
    const output = 'Expected output';

    const javascriptStringAssertionWithVars: Assertion = {
      type: 'javascript',
      value: 'output === "Expected output" && context.vars.foo === "bar"',
    };
    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: javascriptStringAssertionWithVars,
      test: { vars: { foo: 'bar' } } as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the javascript does not match vars', async () => {
    const output = 'Expected output';

    const javascriptStringAssertionWithVars: Assertion = {
      type: 'javascript',
      value: 'output === "Expected output" && context.vars.foo === "something else"',
    };
    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: javascriptStringAssertionWithVars,
      test: { vars: { foo: 'bar' } } as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe(
      'Custom function returned false\noutput === "Expected output" && context.vars.foo === "something else"',
    );
  });

  it('should pass when the function returns pass', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: javascriptFunctionAssertion,
      test: {} as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeTruthy();
    expect(result.score).toBe(0.5);
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the function returns fail', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: javascriptFunctionFailAssertion,
      test: {} as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeFalsy();
    expect(result.score).toBe(0.5);
    expect(result.reason).toBe('Assertion failed');
  });

  it('should pass when the multiline javascript assertion passes', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: javascriptMultilineStringAssertion,
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should pass when the multiline javascript assertion fails', async () => {
    const output = 'Not the expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: javascriptMultilineStringAssertion,
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Assertion failed');
  });

  const notContainsAssertion: Assertion = {
    type: 'not-contains',
    value: 'Unexpected output',
  };

  it('should pass when the not-contains assertion passes', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: notContainsAssertion,
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the not-contains assertion fails', async () => {
    const output = 'Unexpected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: notContainsAssertion,
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
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

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: containsLowerAssertion,
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the icontains assertion fails', async () => {
    const output = 'Different output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: containsLowerAssertion,
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
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

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: notContainsLowerAssertion,
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the not-icontains assertion fails', async () => {
    const output = 'UNEXPECTED OUTPUT';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: notContainsLowerAssertion,
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
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

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: containsAnyAssertion,
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the contains-any assertion fails', async () => {
    const output = 'This output does not contain any option';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: containsAnyAssertion,
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Expected output to contain one of "option1, option2, option3"');
  });

  it('should pass when the icontains-any assertion passes', async () => {
    const output = 'This output contains OPTION1';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: {
        type: 'icontains-any',
        value: ['option1', 'option2', 'option3'],
      },
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the icontains-any assertion fails', async () => {
    const output = 'This output does not contain any option';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: {
        type: 'icontains-any',
        value: ['option1', 'option2', 'option3'],
      },
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
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

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: containsAllAssertion,
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the contains-all assertion fails', async () => {
    const output = 'This output contains only option1 and option2';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: containsAllAssertion,
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Expected output to contain all of "option1, option2, option3"');
  });

  it('should pass when the icontains-all assertion passes', async () => {
    const output = 'This output contains OPTION1, option2, and opTiOn3';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: {
        type: 'icontains-all',
        value: ['option1', 'option2', 'option3'],
      },
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the icontains-all assertion fails', async () => {
    const output = 'This output contains OPTION1, option2, and opTiOn3';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: {
        type: 'icontains-all',
        value: ['option1', 'option2', 'option3', 'option4'],
      },
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe(
      'Expected output to contain all of "option1, option2, option3, option4"',
    );
  });

  // Test for regex assertion
  const containsRegexAssertion: Assertion = {
    type: 'regex',
    value: '\\d{3}-\\d{2}-\\d{4}',
  };

  it('should pass when the regex assertion passes', async () => {
    const output = 'This output contains 123-45-6789';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: containsRegexAssertion,
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the regex assertion fails', async () => {
    const output = 'This output does not contain the pattern';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: containsRegexAssertion,
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
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

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: notContainsRegexAssertion,
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the not-regex assertion fails', async () => {
    const output = 'This output contains 123-45-6789';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: notContainsRegexAssertion,
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
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
      .spyOn(fetch, 'fetchWithRetries')
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ pass: true }), { status: 200 })),
      );

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: webhookAssertion,
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the webhook assertion fails', async () => {
    const output = 'Different output';

    jest
      .spyOn(fetch, 'fetchWithRetries')
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ pass: false }), { status: 200 })),
      );

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: webhookAssertion,
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Webhook returned false');
  });

  it('should fail when the webhook returns an error', async () => {
    const output = 'Expected output';

    jest
      .spyOn(fetch, 'fetchWithRetries')
      .mockImplementation(() => Promise.resolve(new Response('', { status: 500 })));

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: webhookAssertion,
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
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

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: rougeNAssertion,
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('ROUGE-N score 1 is greater than or equal to threshold 0.75');
  });

  it('should fail when the rouge-n assertion fails', async () => {
    const output = 'some different output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: rougeNAssertion,
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
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

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: startsWithAssertion,
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the starts-with assertion fails', async () => {
    const output = 'Different output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: startsWithAssertion,
      test: {} as AtomicTestCase,
      output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
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
    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: assertion,
      test: test,
      output: output,
      provider: new OpenAiChatCompletionProvider('gpt-4'),
    });
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

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: levenshteinAssertion,
      test: {} as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the levenshtein assertion fails', async () => {
    const output = 'Different output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: levenshteinAssertion,
      test: {} as AtomicTestCase,
      output,
    });
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Levenshtein distance 8 is greater than threshold 5');
  });

  it.each([
    [
      'boolean',
      jest.fn((output: string) => output === 'Expected output'),
      true,
      'Assertion passed',
    ],
    ['number', jest.fn((output: string) => output.length), true, 'Assertion passed'],
    [
      'GradingResult',
      jest.fn((output: string) => ({ pass: true, score: 1, reason: 'Custom reason' })),
      true,
      'Custom reason',
    ],
    [
      'boolean',
      jest.fn((output: string) => output !== 'Expected output'),
      false,
      'Custom function returned false',
    ],
    ['number', jest.fn((output: string) => 0), false, 'Custom function returned false'],
    [
      'GradingResult',
      jest.fn((output: string) => ({ pass: false, score: 0.1, reason: 'Custom reason' })),
      false,
      'Custom reason',
    ],
    [
      'boolean Promise',
      jest.fn((output: string) => Promise.resolve(true)),
      true,
      'Assertion passed',
    ],
  ])(
    'should pass when the file:// assertion with .js file returns a %s',
    async (type, mockFn, expectedPass, expectedReason) => {
      const output = 'Expected output';

      jest.doMock(path.resolve('/path/to/assert.js'), () => mockFn, { virtual: true });

      const fileAssertion: Assertion = {
        type: 'javascript',
        value: 'file:///path/to/assert.js',
      };

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4'),
        assertion: fileAssertion,
        test: {} as AtomicTestCase,
        output,
      });

      expect(mockFn).toHaveBeenCalledWith('Expected output', { prompt: 'Some prompt', vars: {} });
      expect(result.pass).toBe(expectedPass);
      expect(result.reason).toContain(expectedReason);
    },
  );

  it('should handle output strings with both single and double quotes correctly in python assertion', async () => {
    const expectedPythonValue = '0.5';

    const mockStdout = new Stream.Readable();
    mockStdout.push(expectedPythonValue);
    mockStdout.push(null);

    const mockStderr = new Stream.Readable();
    mockStderr.push(null);

    const mockChildProcess: Partial<child_process.ChildProcess> = {
      stdout: mockStdout,
      stderr: mockStderr,
      stdin: new Stream.Writable({
        write: () => {},
      }),
      on: (event: string, callback: (code: any, signal?: any) => void) => {
        if (event === 'close') {
          setImmediate(() => callback(0, null)); // Simulate a successful exit with no signal
        }
        return mockChildProcess as child_process.ChildProcess;
      },
    };

    jest.spyOn(child_process, 'spawn').mockImplementation((command, args, options) => {
      expect(command).toBe('python');
      expect(args).toEqual(
        expect.arrayContaining([
          '-u',
          '-c',
          `import json
import sys
data = json.load(sys.stdin)
output = data['output']
context = data['context']
value = data['value']
print(json.dumps(eval(value)))`,
        ]),
      );
      return mockChildProcess as child_process.ChildProcess;
    });

    const output =
      'This is a string with "double quotes"\n and \'single quotes\' \n\n and some \n\t newlines.';

    const pythonAssertion: Assertion = {
      type: 'python',
      value: expectedPythonValue,
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: pythonAssertion,
      test: {} as AtomicTestCase,
      output,
    });

    expect(result.reason).toBe('Assertion passed');
    expect(result.score).toBe(Number(expectedPythonValue));
    expect(result.pass).toBeTruthy();
    expect(child_process.spawn).toHaveBeenCalledTimes(1);

    jest.restoreAllMocks();
  });

  it('should fail with stderr', async () => {
    const expectedPythonValue = '0.5';

    const mockStdout = new Stream.Readable();
    mockStdout.push(expectedPythonValue);
    mockStdout.push(null);

    const mockStderr = new Stream.Readable();
    mockStderr.push('Some error');
    mockStderr.push(null);

    const mockChildProcess: Partial<child_process.ChildProcess> = {
      stdout: mockStdout,
      stderr: mockStderr,
      stdin: new Stream.Writable({
        write: () => {},
      }),
      on: (event: string, callback: (code: any, signal?: any) => void) => {
        if (event === 'close') {
          setImmediate(() => callback(0, null)); // Simulate a successful exit with no signal
        }
        return mockChildProcess as child_process.ChildProcess;
      },
    };

    jest.spyOn(child_process, 'spawn').mockImplementation((command, args, options) => {
      expect(command).toBe('python');
      expect(args).toEqual(
        expect.arrayContaining([
          '-u',
          '-c',
          `import json
import sys
data = json.load(sys.stdin)
output = data['output']
context = data['context']
value = data['value']
print(json.dumps(eval(value)))`,
        ]),
      );
      return mockChildProcess as child_process.ChildProcess;
    });

    const output =
      'This is a string with "double quotes"\n and \'single quotes\' \n\n and some \n\t newlines.';

    const pythonAssertion: Assertion = {
      type: 'python',
      value: expectedPythonValue,
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4'),
      assertion: pythonAssertion,
      test: {} as AtomicTestCase,
      output,
    });

    expect(result.reason).toBe('Python code execution failed: Some error');
    expect(result.pass).toBeFalsy();
    expect(child_process.spawn).toHaveBeenCalledTimes(1);

    jest.restoreAllMocks();
  });

  it.each([
    ['boolean', 'True', true, 'Assertion passed'],
    ['number', '0.5', true, 'Assertion passed'],
    [
      'GradingResult',
      '{"pass": true, "score": 1, "reason": "Custom reason"}',
      true,
      'Custom reason',
    ],
    ['boolean', 'False', false, 'Python code returned false'],
    ['number', '0', false, 'Python code returned false'],
    [
      'GradingResult',
      '{"pass": false, "score": 0, "reason": "Custom reason"}',
      false,
      'Custom reason',
    ],
  ])(
    'should pass when the file:// assertion with .py file returns a %s',
    async (type, pythonOutput, expectedPass, expectedReason) => {
      const output = 'Expected output';

      const mockChildProcess = {
        stdout: new Stream.Readable(),
        stderr: new Stream.Readable(),
      } as child_process.ChildProcess;
      jest
        .spyOn(child_process, 'execFile')
        .mockImplementation(
          (
            file: string,
            args: readonly string[] | null | undefined,
            options: child_process.ExecFileOptions | null | undefined,
            callback?:
              | null
              | ((
                  error: child_process.ExecFileException | null,
                  stdout: string | Buffer,
                  stderr: string | Buffer,
                ) => void),
          ) => {
            expect(callback).toBeTruthy();
            if (callback) {
              expect(file).toBe('python');
              expect(args).toEqual(
                expect.arrayContaining([
                  '/path/to/assert.py',
                  'Expected output',
                  '{"prompt":"Some prompt that includes \\"double quotes\\" and \'single quotes\'","vars":{}}',
                ]),
              );
              process.nextTick(() => callback(null, Buffer.from(pythonOutput), Buffer.from('')));
            }
            return mockChildProcess;
          },
        );

      const fileAssertion: Assertion = {
        type: 'python',
        value: 'file:///path/to/assert.py',
      };

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt that includes "double quotes" and \'single quotes\'',
        provider: new OpenAiChatCompletionProvider('gpt-4'),
        assertion: fileAssertion,
        test: {} as AtomicTestCase,
        output,
      });

      expect(result.pass).toBe(expectedPass);
      expect(result.reason).toContain(expectedReason);
      expect(child_process.execFile).toHaveBeenCalledTimes(1);

      jest.resetAllMocks();
    },
  );

  describe('latency assertion', () => {
    it('should pass when the latency assertion passes', async () => {
      const output = 'Expected output';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4'),
        assertion: {
          type: 'latency',
          threshold: 100,
        },
        latencyMs: 50,
        test: {} as AtomicTestCase,
        output,
      });
      expect(result.pass).toBeTruthy();
      expect(result.reason).toBe('Assertion passed');
    });

    it('should fail when the latency assertion fails', async () => {
      const output = 'Expected output';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4'),
        assertion: {
          type: 'latency',
          threshold: 100,
        },
        latencyMs: 1000,
        test: {} as AtomicTestCase,
        output,
      });
      expect(result.pass).toBeFalsy();
      expect(result.reason).toBe('Latency 1000ms is greater than threshold 100ms');
    });

    it('should throw an error when grading result is missing latencyMs', async () => {
      const output = 'Expected output';

      await expect(
        runAssertion({
          prompt: 'Some prompt',
          provider: new OpenAiChatCompletionProvider('gpt-4'),
          assertion: {
            type: 'latency',
            threshold: 100,
          },
          test: {} as AtomicTestCase,
          output,
        }),
      ).rejects.toThrow(
        'Latency assertion does not support cached results. Rerun the eval with --no-cache',
      );
    });
  });

  describe('perplexity assertion', () => {
    it('should pass when the perplexity assertion passes', async () => {
      const logProbs = [-0.2, -0.4, -0.1, -0.3]; // Dummy logProbs for testing
      const provider = {
        callApi: jest.fn().mockResolvedValue({ logProbs }),
      } as unknown as ApiProvider;

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: {
          type: 'perplexity',
          threshold: 2,
        },
        test: {} as AtomicTestCase,
        output: 'Some output',
        logProbs,
      });
      expect(result.pass).toBeTruthy();
      expect(result.reason).toBe('Assertion passed');
    });

    it('should fail when the perplexity assertion fails', async () => {
      const logProbs = [-0.2, -0.4, -0.1, -0.3]; // Dummy logProbs for testing
      const provider = {
        callApi: jest.fn().mockResolvedValue({ logProbs }),
      } as unknown as ApiProvider;

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: {
          type: 'perplexity',
          threshold: 0.2,
        },
        test: {} as AtomicTestCase,
        output: 'Some output',
        logProbs,
      });
      expect(result.pass).toBeFalsy();
      expect(result.reason).toBe('Perplexity 1.28 is greater than threshold 0.2');
    });
  });

  describe('perplexity-score assertion', () => {
    it('should pass when the perplexity-score assertion passes', async () => {
      const logProbs = [-0.2, -0.4, -0.1, -0.3]; 
      const provider = {
        callApi: jest.fn().mockResolvedValue({ logProbs }),
      } as unknown as ApiProvider;

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: {
          type: 'perplexity-score',
          threshold: 0.25,
        },
        test: {} as AtomicTestCase,
        output: 'Some output',
        logProbs,
      });
      expect(result.pass).toBeTruthy();
      expect(result.reason).toBe('Assertion passed');
    });

    it('should fail when the perplexity-score assertion fails', async () => {
      const logProbs = [-0.2, -0.4, -0.1, -0.3];
      const provider = {
        callApi: jest.fn().mockResolvedValue({ logProbs }),
      } as unknown as ApiProvider;

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: {
          type: 'perplexity-score',
          threshold: 0.5,
        },
        test: {} as AtomicTestCase,
        output: 'Some output',
        logProbs,
      });
      console.log(result)
      expect(result.pass).toBeFalsy();
      expect(result.reason).toBe('Perplexity score 0.44 is less than threshold 0.5');
    });
  });

  describe('cost assertion', () => {
    it('should pass when the cost is below the threshold', async () => {
      const cost = 0.0005;
      const provider = {
        callApi: jest.fn().mockResolvedValue({ cost }),
      } as unknown as ApiProvider;

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: {
          type: 'cost',
          threshold: 0.001,
        },
        test: {} as AtomicTestCase,
        output: 'Some output',
        cost,
      });
      expect(result.pass).toBeTruthy();
      expect(result.reason).toBe('Assertion passed');
    });

    it('should fail when the cost exceeds the threshold', async () => {
      const cost = 0.002;
      const provider = {
        callApi: jest.fn().mockResolvedValue({ cost }),
      } as unknown as ApiProvider;

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: {
          type: 'cost',
          threshold: 0.001,
        },
        test: {} as AtomicTestCase,
        output: 'Some output',
        cost,
      });
      expect(result.pass).toBeFalsy();
      expect(result.reason).toBe('Cost 0.0020 is greater than threshold 0.001');
    });
  });

  describe('is-valid-openai-function-call assertion', () => {
    it('should pass for a valid function call with correct arguments', async () => {
      const output = { arguments: '{"x": 10, "y": 20}', name: 'add' };

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('foo', {
          config: {
            functions: [
              {
                name: 'add',
                parameters: {
                  type: 'object',
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                  },
                  required: ['x', 'y'],
                },
              },
            ],
          },
        }),
        assertion: {
          type: 'is-valid-openai-function-call',
        },
        test: {} as AtomicTestCase,
        output,
      });

      expect(result.pass).toBeTruthy();
      expect(result.reason).toBe('Assertion passed');
    });

    it('should fail for an invalid function call with incorrect arguments', async () => {
      const output = { arguments: '{"x": "10", "y": 20}', name: 'add' };

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('foo', {
          config: {
            functions: [
              {
                name: 'add',
                parameters: {
                  type: 'object',
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                  },
                  required: ['x', 'y'],
                },
              },
            ],
          },
        }),
        assertion: {
          type: 'is-valid-openai-function-call',
        },
        test: {} as AtomicTestCase,
        output,
      });

      expect(result.pass).toBeFalsy();
      expect(result.reason).toContain('Call to "add" does not match schema');
    });
  });

  describe('is-valid-openai-tools-call assertion', () => {
    it('should pass for a valid tools call with correct arguments', async () => {
      const output = [
        { type: 'function', function: { arguments: '{"x": 10, "y": 20}', name: 'add' } },
      ];

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('foo', {
          config: {
            tools: [
              {
                type: 'function',
                function: {
                  name: 'add',
                  parameters: {
                    type: 'object',
                    properties: {
                      x: { type: 'number' },
                      y: { type: 'number' },
                    },
                    required: ['x', 'y'],
                  },
                },
              },
            ],
          },
        }),
        assertion: {
          type: 'is-valid-openai-tools-call',
        },
        test: {} as AtomicTestCase,
        output,
      });

      expect(result.pass).toBeTruthy();
      expect(result.reason).toBe('Assertion passed');
    });

    it('should fail for an invalid tools call with incorrect arguments', async () => {
      const output = [
        { type: 'function', function: { arguments: '{"x": "foobar", "y": 20}', name: 'add' } },
      ];

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('foo', {
          config: {
            tools: [
              {
                type: 'function',
                function: {
                  name: 'add',
                  parameters: {
                    type: 'object',
                    properties: {
                      x: { type: 'number' },
                      y: { type: 'number' },
                    },
                    required: ['x', 'y'],
                  },
                },
              },
            ],
          },
        }),
        assertion: {
          type: 'is-valid-openai-tools-call',
        },
        test: {} as AtomicTestCase,
        output,
      });

      expect(result.pass).toBeFalsy();
      expect(result.reason).toContain('Call to "add" does not match schema');
    });
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

  it('should create a classifier assertion', () => {
    const expected = 'classifier(0.5):classA';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('classifier');
    expect(result.value).toBe('classA');
    expect(result.threshold).toBe(0.5);
  });

  it('should create a latency assertion', () => {
    const expected = 'latency(1000)';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('latency');
    expect(result.threshold).toBe(1000);
  });

  it('should create a perplexity assertion', () => {
    const expected = 'perplexity(1.5)';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('perplexity');
    expect(result.threshold).toBe(1.5);
  });

  it('should create a perplexity-score assertion', () => {
    const expected = 'perplexity-score(0.5)';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('perplexity-score');
    expect(result.threshold).toBe(0.5);
  });

  it('should create a cost assertion', () => {
    const expected = 'cost(0.001)';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('cost');
    expect(result.threshold).toBe(0.001);
  });

  it('should create an openai function call assertion', () => {
    const expected = 'is-valid-openai-function-call';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('is-valid-openai-function-call');
  });
});
