import { assertionFromString, testCaseFromCsvRow } from '../src/csv';
import logger from '../src/logger';
import type { Assertion, CsvRow, TestCase } from '../src/types';

describe('testCaseFromCsvRow', () => {
  it('should create a TestCase with assertions and options from a CSV row', () => {
    const row: CsvRow = {
      __expected1: 'equals:Expected output',
      __expected2: 'contains:part of output',
      __prefix: 'Prefix',
      __suffix: 'Suffix',
      __description: 'Test description',
      __providerOutput: 'Provider output',
      __metric: 'metric-name',
      __threshold: '0.8',
      var1: 'value1',
      var2: 'value2',
    };

    const expectedTestCase: TestCase = {
      vars: {
        var1: 'value1',
        var2: 'value2',
      },
      assert: [
        { type: 'equals', value: 'Expected output', metric: 'metric-name' },
        { type: 'contains', value: 'part of output', metric: 'metric-name' },
      ],
      options: {
        prefix: 'Prefix',
        suffix: 'Suffix',
      },
      description: 'Test description',
      providerOutput: 'Provider output',
      threshold: 0.8,
    };

    const result = testCaseFromCsvRow(row);
    expect(result).toEqual(expectedTestCase);
  });

  it('should handle CSV row with only variables', () => {
    const row: CsvRow = {
      var1: 'value1',
      var2: 'value2',
    };

    const expectedTestCase: TestCase = {
      vars: {
        var1: 'value1',
        var2: 'value2',
      },
      assert: [],
      options: {},
    };

    const result = testCaseFromCsvRow(row);
    expect(result).toEqual(expectedTestCase);
  });

  it('should log a warning for single underscore usage with reserved keys', () => {
    const row: CsvRow = {
      _expected: 'equals:Expected output',
      var1: 'value1',
    };

    testCaseFromCsvRow(row);
    testCaseFromCsvRow(row);
    expect(logger.warn).toHaveBeenCalledWith(
      'You used a single underscore for the key "_expected". Did you mean to use "__expected" instead?',
    );
    expect(logger.warn).toHaveBeenCalledTimes(1);
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

  it('should create an is-json assertion with value', () => {
    const expected = `is-json:
      required: ['color']
      type:object
      properties:
        color:
          type:string
`;

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('is-json');
    expect(result.value).toBe(
      `
      required: ['color']
      type:object
      properties:
        color:
          type:string
`,
    );
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

  it('should create a python assertion', () => {
    const expected = 'python: file://file.py ';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('python');
    expect(result.value).toBe('file://file.py');
  });

  it('should parse python: assertion', () => {
    const assertion = assertionFromString('python:some_python_code');
    expect(assertion).toEqual({
      type: 'python',
      value: 'some_python_code',
    });
  });

  it(`should parse file:// prefix assertion`, () => {
    const assertion = assertionFromString('file://script.py');
    expect(assertion).toEqual({
      type: 'python',
      value: 'script.py',
    });
  });

  it(`should parse file:// prefix assertion with function name`, () => {
    const assertion = assertionFromString('file://script.py:function_name');
    expect(assertion).toEqual({
      type: 'python',
      value: 'script.py:function_name',
    });
  });

  it('should create a javascript assertion', () => {
    const expected = 'javascript: x > 10';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('javascript');
    expect(result.value).toBe('x > 10');
  });

  it('should create an llm-rubric assertion with "grade:" prefix', () => {
    const expected = 'grade:Evaluate the response based on clarity and accuracy';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('llm-rubric');
    expect(result.value).toBe('Evaluate the response based on clarity and accuracy');
  });

  it('should create an llm-rubric assertion with "llm-rubric:" prefix', () => {
    const expected = 'llm-rubric:Rate the answer on a scale of 1-10 for completeness';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('llm-rubric');
    expect(result.value).toBe('Rate the answer on a scale of 1-10 for completeness');
  });

  it('should handle legacy javascript option', () => {
    const expected = 'javascript:output === "Expected output"';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('javascript');
    expect(result.value).toBe('output === "Expected output"');
  });

  it('should handle legacy eval option', () => {
    const expected = 'eval:output === "Expected output"';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('javascript');
    expect(result.value).toBe('output === "Expected output"');
  });

  it('should handle legacy fn option', () => {
    const expected = 'fn:output === "Expected output"';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('javascript');
    expect(result.value).toBe('output === "Expected output"');
  });

  it('should use DEFAULT_SEMANTIC_SIMILARITY_THRESHOLD for similar assertion without threshold', () => {
    const expected = 'similar:Expected output';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('similar');
    expect(result.value).toBe('Expected output');
    expect(result.threshold).toBe(0.8); // DEFAULT_SEMANTIC_SIMILARITY_THRESHOLD
  });

  it('should use 0.75 as default threshold for other assertions requiring threshold', () => {
    const assertionTypes = [
      'answer-relevance',
      'classifier',
      'context-faithfulness',
      'context-recall',
      'context-relevance',
      'cost',
      'latency',
      'levenshtein',
      'perplexity-score',
      'perplexity',
      'rouge-n',
      'starts-with',
    ];

    for (const type of assertionTypes) {
      const expected = `${type}:Expected output`;
      const result: Assertion = assertionFromString(expected);
      expect(result.type).toBe(type);
      expect(result.value).toBe('Expected output');
      expect(result.threshold).toBe(0.75);
    }
  });

  it('should use provided threshold when specified', () => {
    const expected = 'similar(0.9):Expected output';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('similar');
    expect(result.value).toBe('Expected output');
    expect(result.threshold).toBe(0.9);
  });
});
