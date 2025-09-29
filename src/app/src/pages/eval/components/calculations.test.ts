/**
 * Tests for real-time metrics calculation functionality.
 */

import {
  applyClientSideFiltering,
  calculateFilteredMetrics,
  calculateFilteredPassRates,
  calculateFilteredTestCounts,
  calculateFilteredPassingTestCounts,
} from './calculations';
import type { EvaluateTableRow } from '@promptfoo/types';
import type { ResultsFilter } from './store';

// Mock data for testing
const mockTableRows: EvaluateTableRow[] = [
  {
    description: 'Test case 1',
    outputs: [
      {
        id: '1-0',
        pass: true,
        cost: 0.01,
        latencyMs: 100,
        text: 'Success output',
        score: 0.8,
        namedScores: { accuracy: 0.9 },
        gradingResult: {
          pass: true,
          score: 0.8,
          reason: 'Good result',
          componentResults: [
            { pass: true, score: 1.0, reason: 'Assertion 1 passed' },
            { pass: true, score: 0.6, reason: 'Assertion 2 passed' },
          ],
        },
        provider: 'gpt-4',
        prompt: 'Test prompt',
        failureReason: undefined,
        tokenUsage: { total: 50, prompt: 20, completion: 30 },
        testCase: { assert: [{ type: 'equals', value: 'expected' }] },
        metadata: { category: 'positive' },
      },
      {
        id: '1-1',
        pass: false,
        cost: 0.02,
        latencyMs: 150,
        text: 'Failed output',
        score: 0.3,
        namedScores: { accuracy: 0.4 },
        gradingResult: {
          pass: false,
          score: 0.3,
          reason: 'Poor result',
          componentResults: [
            { pass: false, score: 0.0, reason: 'Assertion 1 failed' },
          ],
        },
        provider: 'gpt-3.5-turbo',
        prompt: 'Test prompt',
        failureReason: 'Model error',
        tokenUsage: { total: 40, prompt: 15, completion: 25 },
        testCase: { assert: [{ type: 'equals', value: 'expected' }] },
        metadata: { category: 'negative' },
      },
    ],
    vars: ['variable1'],
    test: { assert: [{ type: 'equals', value: 'expected' }] },
    testIdx: 0,
  },
  {
    description: 'Test case 2',
    outputs: [
      {
        id: '2-0',
        pass: true,
        cost: 0.015,
        latencyMs: 120,
        text: 'Another success',
        score: 0.9,
        namedScores: { accuracy: 0.95 },
        gradingResult: {
          pass: true,
          score: 0.9,
          reason: 'Excellent result',
          componentResults: [
            { pass: true, score: 1.0, reason: 'Assertion 1 passed' },
            { pass: true, score: 0.8, reason: 'Assertion 2 passed' },
          ],
        },
        provider: 'gpt-4',
        prompt: 'Test prompt',
        failureReason: undefined,
        tokenUsage: { total: 60, prompt: 25, completion: 35 },
        testCase: { assert: [{ type: 'equals', value: 'expected' }] },
        metadata: { category: 'positive' },
      },
      {
        id: '2-1',
        pass: true,
        cost: 0.018,
        latencyMs: 140,
        text: 'Success output',
        score: 0.7,
        namedScores: { accuracy: 0.8 },
        gradingResult: {
          pass: true,
          score: 0.7,
          reason: 'Good result',
          componentResults: [
            { pass: true, score: 0.7, reason: 'Assertion 1 passed' },
          ],
        },
        provider: 'gpt-3.5-turbo',
        prompt: 'Test prompt',
        failureReason: undefined,
        tokenUsage: { total: 45, prompt: 18, completion: 27 },
        testCase: { assert: [{ type: 'equals', value: 'expected' }] },
        metadata: { category: 'positive' },
      },
    ],
    vars: ['variable2'],
    test: { assert: [{ type: 'equals', value: 'expected' }] },
    testIdx: 1,
  },
];

describe('calculateFilteredMetrics', () => {
  it('should calculate metrics correctly for a prompt', () => {
    const metrics = calculateFilteredMetrics(mockTableRows, 0);

    expect(metrics.testPassCount).toBe(2); // Both rows pass for prompt 0
    expect(metrics.testFailCount).toBe(0);
    expect(metrics.passRate).toBe(100);
    expect(metrics.avgLatencyMs).toBe(110); // (100 + 120) / 2
    expect(metrics.totalCost).toBe(0.025); // 0.01 + 0.015
    expect(metrics.numRequests).toBe(2);
    expect(metrics.assertPassCount).toBe(4); // 2 from row 1 + 2 from row 2
  });

  it('should calculate metrics correctly for a prompt with failures', () => {
    const metrics = calculateFilteredMetrics(mockTableRows, 1);

    expect(metrics.testPassCount).toBe(1); // Only second row passes for prompt 1
    expect(metrics.testFailCount).toBe(1);
    expect(metrics.passRate).toBe(50);
    expect(metrics.avgLatencyMs).toBe(145); // (150 + 140) / 2
    expect(metrics.totalCost).toBe(0.038); // 0.02 + 0.018
    expect(metrics.assertPassCount).toBe(1); // Second row has 1 component pass
    expect(metrics.assertFailCount).toBe(1); // 1 component fails
  });

  it('should handle empty filtered rows', () => {
    const metrics = calculateFilteredMetrics([], 0);

    expect(metrics.testPassCount).toBe(0);
    expect(metrics.testFailCount).toBe(0);
    expect(metrics.passRate).toBe(0);
    expect(metrics.avgLatencyMs).toBe(0);
    expect(metrics.totalCost).toBe(0);
    expect(metrics.numRequests).toBe(0);
  });
});

describe('applyClientSideFiltering', () => {
  it('should filter by failure mode correctly', () => {
    const filtered = applyClientSideFiltering(mockTableRows, 'failures', '', []);
    expect(filtered).toHaveLength(1); // Only row with failures should remain
    expect(filtered[0].testIdx).toBe(0); // First row has a failure in prompt 1
  });

  it('should filter by search text correctly', () => {
    const filtered = applyClientSideFiltering(mockTableRows, 'all', 'Another success', []);
    expect(filtered).toHaveLength(1); // Only row with "Another success" text
    expect(filtered[0].testIdx).toBe(1);
  });

  it('should filter by metadata correctly', () => {
    const filters: ResultsFilter[] = [
      {
        id: 'test-filter',
        type: 'metadata',
        operator: 'equals',
        value: 'positive',
        field: 'category',
        logicOperator: 'and',
        sortIndex: 0,
      },
    ];

    const filtered = applyClientSideFiltering(mockTableRows, 'all', '', filters);
    expect(filtered).toHaveLength(2); // Both rows have at least one positive output
    // Note: First row has mixed (positive + negative), second row has all positive
  });

  it('should combine multiple filters correctly', () => {
    const filtered = applyClientSideFiltering(mockTableRows, 'failures', 'Failed output', []);
    expect(filtered).toHaveLength(1); // Row with failures AND "Failed output" text
    expect(filtered[0].testIdx).toBe(0);
  });

  it('should handle different mode correctly', () => {
    // Create mock data with different outputs between prompts
    const diffRows: EvaluateTableRow[] = [
      {
        ...mockTableRows[0],
        outputs: [
          { ...mockTableRows[0].outputs[0], text: 'Output A' },
          { ...mockTableRows[0].outputs[1], text: 'Output B' },
        ],
      },
      {
        ...mockTableRows[1],
        outputs: [
          { ...mockTableRows[1].outputs[0], text: 'Same output' },
          { ...mockTableRows[1].outputs[1], text: 'Same output' },
        ],
      },
    ];

    const filtered = applyClientSideFiltering(diffRows, 'different', '', []);
    expect(filtered).toHaveLength(1); // Only row with different outputs
    expect(filtered[0].testIdx).toBe(0);
  });
});

describe('aggregate calculation functions', () => {
  it('should calculate pass rates for all prompts', () => {
    const passRates = calculateFilteredPassRates(mockTableRows, 2);
    expect(passRates).toHaveLength(2);
    expect(passRates[0]).toBe(100); // Prompt 0: 2/2 pass
    expect(passRates[1]).toBe(50); // Prompt 1: 1/2 pass
  });

  it('should calculate test counts for all prompts', () => {
    const testCounts = calculateFilteredTestCounts(mockTableRows, 2);
    expect(testCounts).toHaveLength(2);
    expect(testCounts[0]).toBe(2); // Prompt 0: 2 tests
    expect(testCounts[1]).toBe(2); // Prompt 1: 2 tests
  });

  it('should calculate passing test counts for all prompts', () => {
    const passingCounts = calculateFilteredPassingTestCounts(mockTableRows, 2);
    expect(passingCounts).toHaveLength(2);
    expect(passingCounts[0]).toBe(2); // Prompt 0: 2 passing
    expect(passingCounts[1]).toBe(1); // Prompt 1: 1 passing
  });
});

describe('edge case tests', () => {
  it('should handle invalid regex gracefully', () => {
    // Test with invalid regex characters
    const filtered1 = applyClientSideFiltering(mockTableRows, 'all', '[invalid(regex', []);
    expect(filtered1).toHaveLength(0); // Should fall back to string search and find nothing

    const filtered2 = applyClientSideFiltering(mockTableRows, 'all', 'Success', []);
    expect(filtered2).toHaveLength(2); // Should find rows with "Success" in text
  });

  it('should handle missing latency data correctly', () => {
    const rowsWithMissingLatency: EvaluateTableRow[] = [
      {
        ...mockTableRows[0],
        outputs: [
          { ...mockTableRows[0].outputs[0], latencyMs: undefined },
          { ...mockTableRows[0].outputs[1], latencyMs: 200 },
        ],
      },
    ];

    const metrics = calculateFilteredMetrics(rowsWithMissingLatency, 0);
    expect(metrics.avgLatencyMs).toBe(0); // Only first output, no latency
    expect(metrics.numRequests).toBe(1);

    const metrics1 = calculateFilteredMetrics(rowsWithMissingLatency, 1);
    expect(metrics1.avgLatencyMs).toBe(200); // Only second output has latency
    expect(metrics1.numRequests).toBe(1);
  });

  it('should handle null/undefined metadata values', () => {
    const rowsWithNullMetadata: EvaluateTableRow[] = [
      {
        ...mockTableRows[0],
        outputs: [
          {
            ...mockTableRows[0].outputs[0],
            metadata: { category: null, type: undefined, complex: { nested: 'value' } },
          },
        ],
      },
    ];

    const filters: ResultsFilter[] = [
      {
        id: 'null-filter',
        type: 'metadata',
        operator: 'equals',
        value: 'null',
        field: 'category',
        logicOperator: 'and',
        sortIndex: 0,
      },
    ];

    const filtered = applyClientSideFiltering(rowsWithNullMetadata, 'all', '', filters);
    expect(filtered).toHaveLength(0); // Should filter out null values

    // Test complex object metadata
    const complexFilters: ResultsFilter[] = [
      {
        id: 'complex-filter',
        type: 'metadata',
        operator: 'contains',
        value: 'nested',
        field: 'complex',
        logicOperator: 'and',
        sortIndex: 0,
      },
    ];

    const complexFiltered = applyClientSideFiltering(rowsWithNullMetadata, 'all', '', complexFilters);
    expect(complexFiltered).toHaveLength(1); // Should handle JSON stringification
  });

  it('should handle rows with missing outputs', () => {
    const rowsWithMissingOutputs: EvaluateTableRow[] = [
      {
        ...mockTableRows[0],
        outputs: [mockTableRows[0].outputs[0]], // Only one output instead of two
      },
    ];

    const metrics = calculateFilteredMetrics(rowsWithMissingOutputs, 1);
    expect(metrics.numRequests).toBe(0); // No output at index 1
    expect(metrics.passRate).toBe(0);
    expect(metrics.avgLatencyMs).toBe(0);
  });

  it('should handle rows with no component results', () => {
    const rowsWithNoComponents: EvaluateTableRow[] = [
      {
        ...mockTableRows[0],
        outputs: [
          {
            ...mockTableRows[0].outputs[0],
            gradingResult: {
              pass: true,
              score: 1.0,
              reason: 'Good',
              // No componentResults
            },
          },
        ],
      },
    ];

    const metrics = calculateFilteredMetrics(rowsWithNoComponents, 0);
    expect(metrics.assertPassCount).toBe(0); // No component results to count
    expect(metrics.assertFailCount).toBe(0);
  });

  it('should handle token usage edge cases', () => {
    const rowsWithPartialTokens: EvaluateTableRow[] = [
      {
        ...mockTableRows[0],
        outputs: [
          {
            ...mockTableRows[0].outputs[0],
            tokenUsage: { total: 100, prompt: 50 }, // Missing completion and cached
          },
        ],
      },
    ];

    const metrics = calculateFilteredMetrics(rowsWithPartialTokens, 0);
    expect(metrics.tokenUsage.total).toBe(100);
    expect(metrics.tokenUsage.prompt).toBe(50);
    expect(metrics.tokenUsage.completion).toBe(0); // Should default to 0
    expect(metrics.tokenUsage.cached).toBe(0);
  });

  it('should handle NaN named scores', () => {
    const rowsWithNaNScores: EvaluateTableRow[] = [
      {
        ...mockTableRows[0],
        outputs: [
          {
            ...mockTableRows[0].outputs[0],
            namedScores: {
              validScore: 0.8,
              invalidScore: NaN,
              stringScore: 'not-a-number' as any
            },
          },
        ],
      },
    ];

    const metrics = calculateFilteredMetrics(rowsWithNaNScores, 0);
    expect(metrics.namedScores.validScore).toBe(0.8);
    expect(metrics.namedScores.invalidScore).toBeUndefined(); // Should be filtered out
    expect(metrics.namedScores.stringScore).toBeUndefined(); // Should be filtered out
  });
});

describe('integration tests', () => {
  it('should maintain consistent calculations after filtering', () => {
    // Filter to only failures
    const filtered = applyClientSideFiltering(mockTableRows, 'failures', '', []);

    // Calculate metrics on filtered data
    const passRatesFiltered = calculateFilteredPassRates(filtered, 2);
    const testCountsFiltered = calculateFilteredTestCounts(filtered, 2);

    // Should only have data for the failure row
    expect(testCountsFiltered[0]).toBe(1); // Only 1 test in filtered data for prompt 0
    expect(testCountsFiltered[1]).toBe(1); // Only 1 test in filtered data for prompt 1
    expect(passRatesFiltered[0]).toBe(100); // The filtered test passes for prompt 0
    expect(passRatesFiltered[1]).toBe(0); // The filtered test fails for prompt 1
  });

  it('should handle edge cases gracefully', () => {
    // Test with no prompts
    const emptyPassRates = calculateFilteredPassRates(mockTableRows, 0);
    expect(emptyPassRates).toHaveLength(0);

    // Test with more prompts than available
    const extraPassRates = calculateFilteredPassRates(mockTableRows, 5);
    expect(extraPassRates).toHaveLength(5);
    expect(extraPassRates[2]).toBe(0); // Non-existent prompt should have 0% pass rate
  });

  it('should use DRY pattern for aggregate calculations', () => {
    // Test that all aggregate functions use the same underlying logic
    // This ensures our DRY refactoring maintains consistent behavior

    const passRates = calculateFilteredPassRates(mockTableRows, 2);
    const testCounts = calculateFilteredTestCounts(mockTableRows, 2);
    const passingCounts = calculateFilteredPassingTestCounts(mockTableRows, 2);

    // Verify pass rates are calculated correctly from the other metrics
    expect(passRates[0]).toBe((passingCounts[0] / testCounts[0]) * 100);
    expect(passRates[1]).toBe((passingCounts[1] / testCounts[1]) * 100);

    // Verify test counts equal passing + failing
    for (let i = 0; i < 2; i++) {
      const metrics = calculateFilteredMetrics(mockTableRows, i);
      expect(testCounts[i]).toBe(metrics.testPassCount + metrics.testFailCount);
      expect(passingCounts[i]).toBe(metrics.testPassCount);
      expect(passRates[i]).toBe(metrics.passRate);
    }
  });

  it('should handle redteam plugin filters correctly', () => {
    const redteamRows: EvaluateTableRow[] = [
      {
        ...mockTableRows[0],
        outputs: [
          {
            ...mockTableRows[0].outputs[0],
            metadata: { pluginId: 'harmful-content' }, // Primary location for pluginId
          },
        ],
        test: {
          ...mockTableRows[0].test,
          metadata: { pluginConfig: { id: 'harmful-content' } },
        },
      },
      {
        ...mockTableRows[1],
        outputs: [
          {
            ...mockTableRows[1].outputs[0],
            metadata: { harmCategory: 'safety' }, // Fallback via harmCategory
          },
        ],
        test: {
          ...mockTableRows[1].test,
          metadata: { harmCategory: 'safety' },
        },
      },
    ];

    const pluginFilters: ResultsFilter[] = [
      {
        id: 'plugin-filter',
        type: 'plugin',
        operator: 'equals',
        value: 'harmful-content',
        logicOperator: 'and',
        sortIndex: 0,
      },
    ];

    const filtered = applyClientSideFiltering(redteamRows, 'all', '', pluginFilters);
    expect(filtered).toHaveLength(1); // Only row with harmful-content plugin
    expect(filtered[0].testIdx).toBe(0);

    // Test contains operator
    const containsFilters: ResultsFilter[] = [
      {
        id: 'plugin-contains-filter',
        type: 'plugin',
        operator: 'contains',
        value: 'harmful',
        logicOperator: 'and',
        sortIndex: 0,
      },
    ];

    const containsFiltered = applyClientSideFiltering(redteamRows, 'all', '', containsFilters);
    expect(containsFiltered).toHaveLength(1); // harmful-content contains 'harmful'
  });

  it('should handle redteam strategy filters correctly', () => {
    const redteamRows: EvaluateTableRow[] = [
      {
        ...mockTableRows[0],
        outputs: [
          {
            ...mockTableRows[0].outputs[0],
            metadata: { strategyId: 'jailbreak' }, // Primary location for strategyId
          },
        ],
        test: {
          ...mockTableRows[0].test,
          metadata: { strategyConfig: { id: 'jailbreak' } },
        },
      },
      {
        ...mockTableRows[1],
        outputs: [
          {
            ...mockTableRows[1].outputs[0],
          },
        ],
        test: {
          ...mockTableRows[1].test,
          metadata: { strategyId: 'prompt-injection' }, // Test metadata location
        },
      },
    ];

    const strategyFilters: ResultsFilter[] = [
      {
        id: 'strategy-filter',
        type: 'strategy',
        operator: 'equals',
        value: 'jailbreak',
        logicOperator: 'and',
        sortIndex: 0,
      },
    ];

    const filtered = applyClientSideFiltering(redteamRows, 'all', '', strategyFilters);
    expect(filtered).toHaveLength(1); // Only row with jailbreak strategy
    expect(filtered[0].testIdx).toBe(0);

    // Test default 'basic' strategy fallback
    const basicFilters: ResultsFilter[] = [
      {
        id: 'basic-strategy-filter',
        type: 'strategy',
        operator: 'equals',
        value: 'basic',
        logicOperator: 'and',
        sortIndex: 0,
      },
    ];

    // Create row with no strategy metadata (should default to 'basic')
    const basicRows: EvaluateTableRow[] = [
      {
        ...mockTableRows[0],
        outputs: [{ ...mockTableRows[0].outputs[0] }],
        test: { ...mockTableRows[0].test, metadata: {} },
      },
    ];

    const basicFiltered = applyClientSideFiltering(basicRows, 'all', '', basicFilters);
    expect(basicFiltered).toHaveLength(1); // Should match default 'basic' strategy
  });

  it('should handle redteam severity filters correctly', () => {
    const redteamRows: EvaluateTableRow[] = [
      {
        ...mockTableRows[0],
        outputs: [
          {
            ...mockTableRows[0].outputs[0],
            metadata: { severity: 'high' },
          },
        ],
      },
      {
        ...mockTableRows[1],
        outputs: [
          {
            ...mockTableRows[1].outputs[0],
            gradingResult: {
              ...mockTableRows[1].outputs[0].gradingResult,
              metadata: { severity: 'medium' },
            },
          },
        ],
      },
    ];

    const severityFilters: ResultsFilter[] = [
      {
        id: 'severity-filter',
        type: 'severity',
        operator: 'equals',
        value: 'high',
        logicOperator: 'and',
        sortIndex: 0,
      },
    ];

    const filtered = applyClientSideFiltering(redteamRows, 'all', '', severityFilters);
    expect(filtered).toHaveLength(1); // Only row with high severity
    expect(filtered[0].testIdx).toBe(0);

    // Test not_contains operator
    const notContainsFilters: ResultsFilter[] = [
      {
        id: 'severity-not-contains-filter',
        type: 'severity',
        operator: 'not_contains',
        value: 'low',
        logicOperator: 'and',
        sortIndex: 0,
      },
    ];

    const notContainsFiltered = applyClientSideFiltering(redteamRows, 'all', '', notContainsFilters);
    expect(notContainsFiltered).toHaveLength(2); // Both rows don't contain 'low'
  });

  it('should handle performance with large datasets', () => {
    // Create a large dataset
    const largeDataset: EvaluateTableRow[] = [];
    for (let i = 0; i < 1000; i++) {
      largeDataset.push({
        ...mockTableRows[0],
        testIdx: i,
        description: `Test case ${i}`,
      });
    }

    const start = performance.now();
    const filtered = applyClientSideFiltering(largeDataset, 'all', 'Test case 500', []);
    const metrics = calculateFilteredMetrics(filtered, 0);
    const end = performance.now();

    expect(filtered).toHaveLength(1); // Should find exactly one match
    expect(metrics.numRequests).toBe(1);
    expect(end - start).toBeLessThan(100); // Should complete in under 100ms
  });
});