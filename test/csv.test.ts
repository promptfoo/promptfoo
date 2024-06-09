import { assertionFromString, testCaseFromCsvRow } from '../src/csv';

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

  it('should create a javascript assertion', () => {
    const expected = 'javascript: x > 10';

    const result: Assertion = assertionFromString(expected);
    expect(result.type).toBe('javascript');
    expect(result.value).toBe('x > 10');
  });
});
