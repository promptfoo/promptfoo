import {
  CounterfactualEqualityGrader,
  extractCategoricalDecision,
  compareCategoricalOutcomes,
} from '../../../src/redteam/strategies/counterfactualGrader';

describe('CounterfactualEqualityGrader', () => {
  let grader: CounterfactualEqualityGrader;

  beforeEach(() => {
    grader = new CounterfactualEqualityGrader();
  });

  it('should have correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:counterfactual-equality');
  });

  it('should have a rubric', () => {
    expect(grader.rubric).toBeDefined();
    expect(typeof grader.rubric).toBe('string');
  });

  it('should return placeholder result for runAssertion', async () => {
    const result = await grader.runAssertion('test prompt', 'test output', {
      vars: {},
    });

    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Counterfactual equality should be evaluated across multiple test cases',
    });
  });
});

describe('extractCategoricalDecision', () => {
  it('should extract positive decisions', () => {
    expect(extractCategoricalDecision('Yes, approve the request')).toBe('positive');
    expect(extractCategoricalDecision('I would hire this candidate')).toBe('positive');
    expect(extractCategoricalDecision('Grant the loan application')).toBe('positive');
  });

  it('should extract negative decisions', () => {
    expect(extractCategoricalDecision('No, reject the application')).toBe('negative');
    expect(extractCategoricalDecision('I would deny this request')).toBe('negative');
    expect(extractCategoricalDecision('We must refuse this proposal')).toBe('negative');
  });

  it('should extract uncertain decisions', () => {
    expect(extractCategoricalDecision('Maybe we should consider this further')).toBe('uncertain');
    expect(extractCategoricalDecision('The outcome is unclear at this point')).toBe('uncertain');
    expect(extractCategoricalDecision('It depends on several factors')).toBe('uncertain');
  });

  it('should return null for ambiguous or missing decisions', () => {
    expect(extractCategoricalDecision('The weather is nice today')).toBeNull();
    expect(extractCategoricalDecision('')).toBeNull();
  });

  it('should be case insensitive', () => {
    expect(extractCategoricalDecision('YES')).toBe('positive');
    expect(extractCategoricalDecision('No')).toBe('negative');
    expect(extractCategoricalDecision('MAYBE')).toBe('uncertain');
  });
});

describe('compareCategoricalOutcomes', () => {
  it('should compare positive decisions', () => {
    expect(
      compareCategoricalOutcomes('Yes, approve the request', 'I would grant this application'),
    ).toBe(true);
  });

  it('should compare negative decisions', () => {
    expect(
      compareCategoricalOutcomes('No, reject the request', 'We must deny this application'),
    ).toBe(true);
  });

  it('should compare uncertain decisions', () => {
    expect(compareCategoricalOutcomes('Maybe we should wait', 'The situation is unclear')).toBe(
      true,
    );
  });

  it('should identify different decisions', () => {
    expect(compareCategoricalOutcomes('Yes, approve', 'No, reject')).toBe(false);
  });

  it('should fall back to exact matching for ambiguous cases', () => {
    const text = 'The weather is nice today';
    expect(compareCategoricalOutcomes(text, text)).toBe(true);
    expect(compareCategoricalOutcomes(text, 'A different response')).toBe(false);
  });

  it('should handle whitespace and case differences', () => {
    expect(compareCategoricalOutcomes('  YES  ', 'yes')).toBe(true);
  });
});
