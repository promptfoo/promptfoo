/**
 * Tests for ResultsTable utility functions.
 */

import { describe, expect, it } from 'vitest';
import { calculateSummaryStats } from '../../../../src/ui/components/table/ResultsTable';
import type { TableRowData } from '../../../../src/ui/components/table/types';

/**
 * Create a mock row for testing.
 */
function createMockRow(
  index: number,
  cells: Array<{
    status: 'pass' | 'fail' | 'error' | null;
    score?: number;
    cost?: number;
    latencyMs?: number;
  }>,
): TableRowData {
  return {
    index,
    testIdx: index,
    cells: cells.map((cell, i) => ({
      content: `Cell ${i}`,
      displayContent: `Cell ${i}`,
      status: cell.status,
      isTruncated: false,
      output: {
        text: `Cell ${i}`,
        pass: cell.status === 'pass',
        score: cell.score ?? (cell.status === 'pass' ? 1 : 0),
        cost: cell.cost ?? 0.01,
        latencyMs: cell.latencyMs ?? 100,
        provider: 'test-provider',
        failureReason: cell.status === 'error' ? 2 : cell.status === 'fail' ? 1 : 0,
        namedScores: {},
        id: `row-${index}-cell-${i}`,
        tokenUsage: {},
      },
    })),
    originalRow: {
      vars: [],
      outputs: [],
      testIdx: index,
    },
  };
}

describe('calculateSummaryStats', () => {
  it('returns zeros for empty rows', () => {
    const stats = calculateSummaryStats([]);
    expect(stats.passCount).toBe(0);
    expect(stats.failCount).toBe(0);
    expect(stats.errorCount).toBe(0);
    expect(stats.totalTests).toBe(0);
    expect(stats.avgScore).toBeNull();
    expect(stats.totalCost).toBe(0);
    expect(stats.avgLatencyMs).toBeNull();
  });

  it('counts passes correctly', () => {
    const rows = [
      createMockRow(0, [{ status: 'pass' }, { status: 'pass' }]),
      createMockRow(1, [{ status: 'pass' }, { status: 'pass' }]),
    ];
    const stats = calculateSummaryStats(rows);
    expect(stats.passCount).toBe(4);
    expect(stats.failCount).toBe(0);
    expect(stats.errorCount).toBe(0);
    expect(stats.totalTests).toBe(4);
  });

  it('counts failures correctly', () => {
    const rows = [
      createMockRow(0, [{ status: 'fail' }, { status: 'fail' }]),
      createMockRow(1, [{ status: 'fail' }]),
    ];
    const stats = calculateSummaryStats(rows);
    expect(stats.passCount).toBe(0);
    expect(stats.failCount).toBe(3);
    expect(stats.errorCount).toBe(0);
    expect(stats.totalTests).toBe(3);
  });

  it('counts errors correctly', () => {
    const rows = [createMockRow(0, [{ status: 'error' }, { status: 'error' }])];
    const stats = calculateSummaryStats(rows);
    expect(stats.passCount).toBe(0);
    expect(stats.failCount).toBe(0);
    expect(stats.errorCount).toBe(2);
    expect(stats.totalTests).toBe(2);
  });

  it('counts mixed statuses correctly', () => {
    const rows = [
      createMockRow(0, [{ status: 'pass' }, { status: 'fail' }]),
      createMockRow(1, [{ status: 'error' }, { status: 'pass' }]),
      createMockRow(2, [{ status: 'fail' }, { status: 'error' }]),
    ];
    const stats = calculateSummaryStats(rows);
    expect(stats.passCount).toBe(2);
    expect(stats.failCount).toBe(2);
    expect(stats.errorCount).toBe(2);
    expect(stats.totalTests).toBe(6);
  });

  it('ignores null status', () => {
    const rows = [createMockRow(0, [{ status: 'pass' }, { status: null }])];
    const stats = calculateSummaryStats(rows);
    expect(stats.passCount).toBe(1);
    expect(stats.failCount).toBe(0);
    expect(stats.errorCount).toBe(0);
    expect(stats.totalTests).toBe(1);
  });

  describe('average score calculation', () => {
    it('calculates average score correctly', () => {
      const rows = [
        createMockRow(0, [
          { status: 'pass', score: 0.8 },
          { status: 'pass', score: 1.0 },
        ]),
        createMockRow(1, [{ status: 'pass', score: 0.6 }]),
      ];
      const stats = calculateSummaryStats(rows);
      // (0.8 + 1.0 + 0.6) / 3 = 0.8
      expect(stats.avgScore).toBeCloseTo(0.8, 5);
    });

    it('handles scores of zero', () => {
      const rows = [
        createMockRow(0, [
          { status: 'fail', score: 0 },
          { status: 'pass', score: 1.0 },
        ]),
      ];
      const stats = calculateSummaryStats(rows);
      // (0 + 1.0) / 2 = 0.5
      expect(stats.avgScore).toBeCloseTo(0.5, 5);
    });

    it('returns null when no scores available', () => {
      // Create row without output scores
      const row: TableRowData = {
        index: 0,
        testIdx: 0,
        cells: [
          {
            content: 'test',
            displayContent: 'test',
            status: 'pass',
            isTruncated: false,
            // No output property
          },
        ],
        originalRow: {
          vars: [],
          outputs: [],
          testIdx: 0,
        },
      };
      const stats = calculateSummaryStats([row]);
      expect(stats.avgScore).toBeNull();
    });

    it('calculates average score from multiple providers', () => {
      const rows = [
        createMockRow(0, [
          { status: 'pass', score: 0.9 },
          { status: 'pass', score: 0.7 },
          { status: 'fail', score: 0.3 },
        ]),
      ];
      const stats = calculateSummaryStats(rows);
      // (0.9 + 0.7 + 0.3) / 3 = 0.633...
      expect(stats.avgScore).toBeCloseTo(0.633, 2);
    });
  });

  describe('realistic scenarios', () => {
    it('calculates stats for a typical eval result', () => {
      const rows = [
        // Test case 1: all providers pass
        createMockRow(0, [
          { status: 'pass', score: 1.0 },
          { status: 'pass', score: 1.0 },
        ]),
        // Test case 2: mixed results
        createMockRow(1, [
          { status: 'pass', score: 0.8 },
          { status: 'fail', score: 0.4 },
        ]),
        // Test case 3: one error
        createMockRow(2, [
          { status: 'pass', score: 0.9 },
          { status: 'error', score: 0 },
        ]),
        // Test case 4: all fail
        createMockRow(3, [
          { status: 'fail', score: 0.2 },
          { status: 'fail', score: 0.3 },
        ]),
      ];

      const stats = calculateSummaryStats(rows);

      expect(stats.passCount).toBe(4); // 2 + 1 + 1 + 0
      expect(stats.failCount).toBe(3); // 0 + 1 + 0 + 2
      expect(stats.errorCount).toBe(1);
      expect(stats.totalTests).toBe(8);
      // (1.0 + 1.0 + 0.8 + 0.4 + 0.9 + 0 + 0.2 + 0.3) / 8 = 0.575
      expect(stats.avgScore).toBeCloseTo(0.575, 3);
    });

    it('handles single provider results', () => {
      const rows = [
        createMockRow(0, [{ status: 'pass', score: 1.0 }]),
        createMockRow(1, [{ status: 'fail', score: 0.3 }]),
        createMockRow(2, [{ status: 'pass', score: 0.8 }]),
      ];

      const stats = calculateSummaryStats(rows);

      expect(stats.passCount).toBe(2);
      expect(stats.failCount).toBe(1);
      expect(stats.errorCount).toBe(0);
      expect(stats.totalTests).toBe(3);
      // (1.0 + 0.3 + 0.8) / 3 = 0.7
      expect(stats.avgScore).toBeCloseTo(0.7, 5);
    });
  });

  describe('total cost calculation', () => {
    it('sums costs correctly', () => {
      const rows = [
        createMockRow(0, [
          { status: 'pass', cost: 0.05 },
          { status: 'pass', cost: 0.1 },
        ]),
        createMockRow(1, [{ status: 'pass', cost: 0.15 }]),
      ];
      const stats = calculateSummaryStats(rows);
      // 0.05 + 0.10 + 0.15 = 0.30
      expect(stats.totalCost).toBeCloseTo(0.3, 5);
    });

    it('returns 0 for empty rows', () => {
      const stats = calculateSummaryStats([]);
      expect(stats.totalCost).toBe(0);
    });

    it('ignores zero costs', () => {
      const rows = [
        createMockRow(0, [
          { status: 'pass', cost: 0.1 },
          { status: 'pass', cost: 0 },
        ]),
      ];
      const stats = calculateSummaryStats(rows);
      expect(stats.totalCost).toBeCloseTo(0.1, 5);
    });

    it('handles missing cost data', () => {
      // Create row without output
      const row: TableRowData = {
        index: 0,
        testIdx: 0,
        cells: [
          {
            content: 'test',
            displayContent: 'test',
            status: 'pass',
            isTruncated: false,
            // No output property
          },
        ],
        originalRow: {
          vars: [],
          outputs: [],
          testIdx: 0,
        },
      };
      const stats = calculateSummaryStats([row]);
      expect(stats.totalCost).toBe(0);
    });

    it('accumulates cost from multiple providers', () => {
      const rows = [
        createMockRow(0, [
          { status: 'pass', cost: 0.01 },
          { status: 'pass', cost: 0.02 },
          { status: 'fail', cost: 0.03 },
        ]),
        createMockRow(1, [
          { status: 'pass', cost: 0.04 },
          { status: 'pass', cost: 0.05 },
          { status: 'pass', cost: 0.06 },
        ]),
      ];
      const stats = calculateSummaryStats(rows);
      // 0.01 + 0.02 + 0.03 + 0.04 + 0.05 + 0.06 = 0.21
      expect(stats.totalCost).toBeCloseTo(0.21, 5);
    });
  });

  describe('average latency calculation', () => {
    it('calculates average latency correctly', () => {
      const rows = [
        createMockRow(0, [
          { status: 'pass', latencyMs: 100 },
          { status: 'pass', latencyMs: 200 },
        ]),
        createMockRow(1, [{ status: 'pass', latencyMs: 300 }]),
      ];
      const stats = calculateSummaryStats(rows);
      // (100 + 200 + 300) / 3 = 200
      expect(stats.avgLatencyMs).toBeCloseTo(200, 5);
    });

    it('returns null for empty rows', () => {
      const stats = calculateSummaryStats([]);
      expect(stats.avgLatencyMs).toBeNull();
    });

    it('ignores zero latency values', () => {
      const rows = [
        createMockRow(0, [
          { status: 'pass', latencyMs: 100 },
          { status: 'pass', latencyMs: 0 },
        ]),
      ];
      const stats = calculateSummaryStats(rows);
      // Only counts the 100ms value
      expect(stats.avgLatencyMs).toBeCloseTo(100, 5);
    });

    it('handles missing latency data', () => {
      // Create row without output
      const row: TableRowData = {
        index: 0,
        testIdx: 0,
        cells: [
          {
            content: 'test',
            displayContent: 'test',
            status: 'pass',
            isTruncated: false,
            // No output property
          },
        ],
        originalRow: {
          vars: [],
          outputs: [],
          testIdx: 0,
        },
      };
      const stats = calculateSummaryStats([row]);
      expect(stats.avgLatencyMs).toBeNull();
    });

    it('calculates average latency from multiple providers', () => {
      const rows = [
        createMockRow(0, [
          { status: 'pass', latencyMs: 500 },
          { status: 'pass', latencyMs: 1000 },
          { status: 'fail', latencyMs: 1500 },
        ]),
      ];
      const stats = calculateSummaryStats(rows);
      // (500 + 1000 + 1500) / 3 = 1000
      expect(stats.avgLatencyMs).toBeCloseTo(1000, 5);
    });

    it('handles mixed valid and invalid latency values', () => {
      const rows = [
        createMockRow(0, [
          { status: 'pass', latencyMs: 200 },
          { status: 'pass', latencyMs: 0 }, // Ignored
          { status: 'pass', latencyMs: 400 },
        ]),
      ];
      const stats = calculateSummaryStats(rows);
      // (200 + 400) / 2 = 300
      expect(stats.avgLatencyMs).toBeCloseTo(300, 5);
    });
  });

  describe('combined metrics in realistic scenarios', () => {
    it('calculates all metrics for a typical eval result', () => {
      const rows = [
        createMockRow(0, [
          { status: 'pass', score: 1.0, cost: 0.05, latencyMs: 500 },
          { status: 'pass', score: 0.9, cost: 0.08, latencyMs: 600 },
        ]),
        createMockRow(1, [
          { status: 'fail', score: 0.3, cost: 0.04, latencyMs: 400 },
          { status: 'error', score: 0, cost: 0.02, latencyMs: 100 },
        ]),
      ];

      const stats = calculateSummaryStats(rows);

      expect(stats.passCount).toBe(2);
      expect(stats.failCount).toBe(1);
      expect(stats.errorCount).toBe(1);
      expect(stats.totalTests).toBe(4);
      // (1.0 + 0.9 + 0.3 + 0) / 4 = 0.55
      expect(stats.avgScore).toBeCloseTo(0.55, 5);
      // 0.05 + 0.08 + 0.04 + 0.02 = 0.19
      expect(stats.totalCost).toBeCloseTo(0.19, 5);
      // (500 + 600 + 400 + 100) / 4 = 400
      expect(stats.avgLatencyMs).toBeCloseTo(400, 5);
    });
  });
});
