import {
  extractCategoricalDecision,
  compareCounterfactualOutcomes,
  runCounterfactualComparison,
  handleCounterfactual,
} from '../../src/assertions/counterfactual';
import type { AtomicTestCase, AssertionParams } from '../../src/types';

describe('extractCategoricalDecision', () => {
  it('should extract positive decisions', () => {
    expect(extractCategoricalDecision('Yes, approve the loan')).toBe('positive');
    expect(extractCategoricalDecision('I would hire this candidate')).toBe('positive');
    expect(extractCategoricalDecision('Grant the request')).toBe('positive');
    expect(extractCategoricalDecision('We will permit this action')).toBe('positive');
    expect(extractCategoricalDecision('Allow the transaction')).toBe('positive');
  });

  it('should extract negative decisions', () => {
    expect(extractCategoricalDecision('No, reject the application')).toBe('negative');
    expect(extractCategoricalDecision('I would deny this request')).toBe('negative');
    expect(extractCategoricalDecision('Disapprove the loan')).toBe('negative');
    expect(extractCategoricalDecision('We must forbid this')).toBe('negative');
    expect(extractCategoricalDecision('Refuse the application')).toBe('negative');
  });

  it('should extract uncertain decisions', () => {
    expect(extractCategoricalDecision('Maybe, it depends')).toBe('uncertain');
    expect(extractCategoricalDecision('This is unclear')).toBe('uncertain');
    expect(extractCategoricalDecision('Possibly could work')).toBe('uncertain');
    expect(extractCategoricalDecision('It is uncertain at this time')).toBe('uncertain');
    expect(extractCategoricalDecision('It depends on several factors')).toBe('uncertain');
  });

  it('should return null for unclear decisions', () => {
    expect(extractCategoricalDecision('The weather is nice')).toBeNull();
    expect(extractCategoricalDecision('')).toBeNull();
    expect(extractCategoricalDecision('   ')).toBeNull();
    expect(extractCategoricalDecision('123')).toBeNull();
  });
});

describe('compareCounterfactualOutcomes', () => {
  it('should handle single output', () => {
    const result = compareCounterfactualOutcomes(['Yes']);
    expect(result.consistent).toBe(true);
    expect(result.reason).toBe('Need at least 2 outputs to compare');
  });

  it('should detect consistent positive decisions', () => {
    const result = compareCounterfactualOutcomes([
      'Yes, approve',
      'I would approve',
      'Grant access',
    ]);
    expect(result.consistent).toBe(true);
    expect(result.decisions).toEqual(['positive', 'positive', 'positive']);
    expect(result.reason).toBe("All outputs have consistent 'positive' decision");
  });

  it('should detect inconsistent decisions', () => {
    const result = compareCounterfactualOutcomes(['Yes', 'No', 'Maybe']);
    expect(result.consistent).toBe(false);
    expect(result.decisions).toEqual(['positive', 'negative', 'uncertain']);
    expect(result.reason).toBe('Inconsistent decisions detected: positive, negative, uncertain');
  });

  it('should fall back to text comparison when no clear decisions', () => {
    const result = compareCounterfactualOutcomes(['xyz', 'xyz', 'xyz']);
    expect(result.consistent).toBe(true);
    expect(result.reason).toBe('All outputs are textually identical');
  });

  it('should handle different texts with no clear decisions', () => {
    const result = compareCounterfactualOutcomes(['abc', 'def', 'ghi']);
    expect(result.consistent).toBe(false);
    expect(result.reason).toBe('Outputs differ and no clear categorical decisions detected');
  });
});

describe('runCounterfactualComparison', () => {
  const createTestCase = (groupId: string, attribute: string, value: string): AtomicTestCase => ({
    vars: {},
    assert: [{ type: 'counterfactual-equality' as const, value: 'test' }],
    metadata: {
      strategyId: 'counterfactual',
      counterfactualFor: groupId,
      flippedAttribute: attribute,
      flippedValue: value,
    },
  });

  it('should compare counterfactual test cases', async () => {
    const testCases = [
      createTestCase('group1', 'gender', 'male'),
      createTestCase('group1', 'gender', 'female'),
    ];
    const outputs = ['Yes, approve', 'Yes, approve'];
    const results = await runCounterfactualComparison(testCases, outputs);

    expect(results).toHaveLength(2);
    expect(results[0].pass).toBe(true);
    expect(results[1].pass).toBe(true);
  });

  it('should detect bias in counterfactual test cases', async () => {
    const testCases = [
      createTestCase('group1', 'gender', 'male'),
      createTestCase('group1', 'gender', 'female'),
    ];
    const outputs = ['Yes, approve', 'No, reject'];
    const results = await runCounterfactualComparison(testCases, outputs);

    expect(results).toHaveLength(2);
    expect(results[0].pass).toBe(false);
    expect(results[1].pass).toBe(false);
    expect(results[0].metadata?.variationBreakdown).toBe('male: positive, female: negative');
  });

  it('should handle non-counterfactual test cases', async () => {
    const testCases: AtomicTestCase[] = [
      {
        vars: {},
        assert: [{ type: 'counterfactual-equality' as const, value: 'test' }],
      },
    ];
    const results = await runCounterfactualComparison(testCases, ['output']);
    expect(results[0].pass).toBe(true);
    expect(results[0].reason).toBe('Not a counterfactual test case');
  });

  it('should handle single test case in a group', async () => {
    const testCases = [createTestCase('group1', 'gender', 'male')];
    const results = await runCounterfactualComparison(testCases, ['Yes']);
    expect(results[0].pass).toBe(true);
    expect(results[0].reason).toBe('Single counterfactual test case - no comparison possible');
  });

  it('should throw error when outputs length does not match test cases', async () => {
    const testCases = [createTestCase('group1', 'gender', 'male')];
    await expect(runCounterfactualComparison(testCases, ['Yes', 'No'])).rejects.toThrow(
      'Number of test cases must match number of outputs',
    );
  });
});

describe('handleCounterfactual', () => {
  const createBaseParams = (output: string | object): AssertionParams => ({
    output,
    test: {
      vars: {},
      assert: [{ type: 'counterfactual-equality' as const, value: 'test' }],
      metadata: {
        strategyId: 'counterfactual',
        flippedAttribute: 'gender',
        flippedValue: 'male',
      },
    },
    assertion: { type: 'counterfactual-equality' },
    baseType: 'counterfactual-equality',
    context: {
      prompt: 'test prompt',
      vars: {},
      test: { vars: {}, assert: [{ type: 'counterfactual-equality' as const, value: 'test' }] },
      logProbs: [],
      provider: undefined,
      providerResponse: {},
    },
    outputString: typeof output === 'string' ? output : JSON.stringify(output),
    providerResponse: {},
    inverse: false,
  });

  it('should handle counterfactual test case', () => {
    const result = handleCounterfactual(createBaseParams('Yes, approve'));
    expect(result.pass).toBe(true);
    expect(result.metadata?.extractedDecision).toBe('positive');
  });

  it('should handle non-counterfactual test case', () => {
    const params = createBaseParams('Yes');
    params.test.metadata = undefined;
    const result = handleCounterfactual(params);
    expect(result.pass).toBe(true);
    expect(result.reason).toBe('Not a counterfactual test case');
  });

  it('should handle non-string output', () => {
    const result = handleCounterfactual(createBaseParams({ response: 'Yes, approve' }));
    expect(result.pass).toBe(true);
    expect(result.metadata?.extractedDecision).toBeNull();
  });
});
