import { selectMaxScore } from '../../src/matchers';
import type { Assertion, EvalResult } from '../../src/types';

describe('selectMaxScore', () => {
  const createMockResult = (score: number, testIdx: number): EvalResult => ({
    id: `test-${testIdx}`,
    evalId: 'eval-test',
    promptIdx: 0,
    testIdx,
    testCase: {
      assert: [
        { type: 'contains', value: 'apple' },
        { type: 'contains', value: 'orange' },
        { type: 'max-score' },
      ],
    },
    prompt: { raw: 'test prompt', label: 'test' },
    promptId: 'prompt-test',
    error: null,
    score,
    success: true,
    response: { output: `Output ${testIdx}` },
    gradingResult: {
      pass: score > 0.5,
      score,
      reason: 'Test result',
      namedScores: {},
      tokensUsed: { total: 0, prompt: 0, completion: 0, cached: 0 },
      componentResults: [
        {
          pass: true,
          score: 1,
          reason: 'Contains apple',
          assertion: { type: 'contains', value: 'apple' } as Assertion,
        },
        {
          pass: score === 1,
          score: score === 1 ? 1 : 0,
          reason: score === 1 ? 'Contains orange' : 'Does not contain orange',
          assertion: { type: 'contains', value: 'orange' } as Assertion,
        },
      ],
      assertion: null,
    },
    namedScores: {},
    provider: { id: () => 'test-provider' },
    latencyMs: 100,
    cost: 0,
    metadata: {},
    failureReason: undefined,
    persisted: false,
    pluginId: undefined,
  });

  const mockAssertion: Assertion = {
    type: 'max-score',
  };

  it('should select the output with the highest score', async () => {
    const outputs = ['Output 0', 'Output 1', 'Output 2'];
    const results = [
      createMockResult(0.5, 0),
      createMockResult(1.0, 1),
      createMockResult(0.75, 2),
    ];

    const gradingResults = await selectMaxScore(outputs, results, mockAssertion);

    expect(gradingResults).toHaveLength(3);
    expect(gradingResults[0].pass).toBe(false);
    expect(gradingResults[0].score).toBe(0);
    expect(gradingResults[0].reason).toContain('Not selected');
    
    expect(gradingResults[1].pass).toBe(true);
    expect(gradingResults[1].score).toBe(1);
    expect(gradingResults[1].reason).toContain('Selected as highest scoring output');
    
    expect(gradingResults[2].pass).toBe(false);
    expect(gradingResults[2].score).toBe(0);
    expect(gradingResults[2].reason).toContain('Not selected');
  });

  it('should handle ties by selecting the first output', async () => {
    const outputs = ['Output 0', 'Output 1', 'Output 2'];
    const results = [
      createMockResult(1.0, 0),
      createMockResult(1.0, 1),
      createMockResult(0.5, 2),
    ];

    const gradingResults = await selectMaxScore(outputs, results, mockAssertion);

    expect(gradingResults[0].pass).toBe(true);
    expect(gradingResults[0].reason).toContain('Selected as highest scoring output');
    
    expect(gradingResults[1].pass).toBe(false);
    expect(gradingResults[1].reason).toContain('Not selected (score: 1.000, max: 1.000)');
    
    expect(gradingResults[2].pass).toBe(false);
  });

  it('should apply threshold when specified', async () => {
    const outputs = ['Output 0', 'Output 1'];
    const results = [
      createMockResult(0.6, 0),
      createMockResult(0.4, 1),
    ];

    const assertionWithThreshold: Assertion = {
      type: 'max-score',
      value: {
        threshold: 0.7,
      },
    };

    const gradingResults = await selectMaxScore(outputs, results, assertionWithThreshold);

    expect(gradingResults[0].pass).toBe(false);
    expect(gradingResults[0].reason).toContain('below threshold');
    
    expect(gradingResults[1].pass).toBe(false);
  });

  it('should throw error with fewer than 2 outputs', async () => {
    const outputs = ['Output 0'];
    const results = [createMockResult(1.0, 0)];

    await expect(selectMaxScore(outputs, results, mockAssertion)).rejects.toThrow(
      'max-score assertion must have at least two outputs to compare between'
    );
  });

  it('should throw error when no other assertions exist', async () => {
    const outputs = ['Output 0', 'Output 1'];
    const results = [
      {
        ...createMockResult(1.0, 0),
        testCase: {
          assert: [{ type: 'max-score' }],
        },
      },
      {
        ...createMockResult(0.5, 1),
        testCase: {
          assert: [{ type: 'max-score' }],
        },
      },
    ];

    await expect(selectMaxScore(outputs, results, mockAssertion)).rejects.toThrow(
      'max-score requires at least one other assertion to aggregate scores from'
    );
  });

  it('should exclude select-best assertions from validation', async () => {
    const outputs = ['Output 0', 'Output 1'];
    const results = [
      {
        ...createMockResult(1.0, 0),
        testCase: {
          assert: [
            { type: 'contains', value: 'test' },
            { type: 'select-best' },
            { type: 'max-score' },
          ],
        },
      },
      {
        ...createMockResult(0.5, 1),
        testCase: {
          assert: [
            { type: 'contains', value: 'test' },
            { type: 'select-best' },
            { type: 'max-score' },
          ],
        },
      },
    ];

    const gradingResults = await selectMaxScore(outputs, results, mockAssertion);
    
    expect(gradingResults).toHaveLength(2);
    expect(gradingResults[0].pass).toBe(true);
    expect(gradingResults[1].pass).toBe(false);
  });

  it('should handle results with zero scores', async () => {
    const outputs = ['Output 0', 'Output 1', 'Output 2'];
    const results = [
      createMockResult(0, 0),
      createMockResult(0, 1),
      createMockResult(0.1, 2),
    ];

    const gradingResults = await selectMaxScore(outputs, results, mockAssertion);

    expect(gradingResults[0].pass).toBe(false);
    expect(gradingResults[1].pass).toBe(false);
    expect(gradingResults[2].pass).toBe(true);
    expect(gradingResults[2].reason).toContain('Selected as highest scoring output (score: 0.100)');
  });

  it('should include score in namedScores', async () => {
    const outputs = ['Output 0', 'Output 1'];
    const results = [
      createMockResult(0.8, 0),
      createMockResult(0.6, 1),
    ];

    const gradingResults = await selectMaxScore(outputs, results, mockAssertion);

    expect(gradingResults[0].namedScores?.maxScore).toBe(0.8);
    expect(gradingResults[1].namedScores?.maxScore).toBe(0.6);
  });
});