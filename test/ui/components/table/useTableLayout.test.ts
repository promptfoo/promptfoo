/**
 * Tests for useTableLayout hook.
 */

import { describe, expect, it } from 'vitest';
import { calculateTableLayout } from '../../../../src/ui/components/table/useTableLayout';

import type { EvaluateTable } from '../../../../src/types';

// Mock table data
function createMockTableData(
  varCount: number,
  promptCount: number,
  rowCount: number,
): EvaluateTable {
  return {
    head: {
      vars: Array.from({ length: varCount }, (_, i) => `var${i + 1}`),
      prompts: Array.from({ length: promptCount }, (_, i) => ({
        label: `Prompt ${i + 1}`,
        provider: `provider${i + 1}`,
        id: `prompt-${i}`,
        raw: `prompt ${i + 1}`,
        display: `Prompt ${i + 1}`,
      })),
    },
    body: Array.from({ length: rowCount }, (_, rowIdx) => ({
      testIdx: rowIdx,
      vars: Array.from({ length: varCount }, (_, i) => `value-${rowIdx}-${i}`),
      outputs: Array.from({ length: promptCount }, (_, i) => ({
        pass: true,
        failureReason: 0, // NONE
        text: `output-${rowIdx}-${i}`,
        score: 1,
        latencyMs: 100,
        cost: 0.001,
        namedScores: {},
        prompt: `prompt ${i + 1}`,
        id: `output-${rowIdx}-${i}`,
      })),
      test: {},
    })),
  } as EvaluateTable;
}

describe('calculateTableLayout', () => {
  it('creates columns for index, vars, and outputs', () => {
    const data = createMockTableData(2, 2, 5);
    const layout = calculateTableLayout(data, 120, 30, { showIndex: true });

    expect(layout.columns).toHaveLength(5); // 1 index + 2 vars + 2 outputs
    expect(layout.columns[0].type).toBe('index');
    expect(layout.columns[1].type).toBe('var');
    expect(layout.columns[2].type).toBe('var');
    expect(layout.columns[3].type).toBe('output');
    expect(layout.columns[4].type).toBe('output');
  });

  it('excludes index column when showIndex is false', () => {
    const data = createMockTableData(2, 2, 5);
    const layout = calculateTableLayout(data, 120, 30, { showIndex: false });

    expect(layout.columns).toHaveLength(4); // 2 vars + 2 outputs
    expect(layout.columns[0].type).toBe('var');
  });

  it('sets isCompact to true for narrow terminals', () => {
    const data = createMockTableData(2, 2, 5);
    const layout = calculateTableLayout(data, 50, 30); // Below MIN_TABLE_WIDTH (60)

    expect(layout.isCompact).toBe(true);
  });

  it('sets isCompact to false for wide terminals', () => {
    const data = createMockTableData(2, 2, 5);
    const layout = calculateTableLayout(data, 120, 30);

    expect(layout.isCompact).toBe(false);
  });

  it('calculates visible row count based on terminal height', () => {
    const data = createMockTableData(1, 1, 100);
    const layout = calculateTableLayout(data, 120, 20, { maxVisibleRows: 50 });

    // With 20 rows terminal height and 7 reserved lines, should have ~13 visible rows
    expect(layout.visibleRowCount).toBeLessThanOrEqual(13);
    expect(layout.visibleRowCount).toBeGreaterThan(0);
  });

  it('limits visible rows to maxVisibleRows', () => {
    const data = createMockTableData(1, 1, 100);
    const layout = calculateTableLayout(data, 120, 100, { maxVisibleRows: 10 });

    expect(layout.visibleRowCount).toBe(10);
  });

  it('limits visible rows to total data rows', () => {
    const data = createMockTableData(1, 1, 5);
    const layout = calculateTableLayout(data, 120, 100, { maxVisibleRows: 50 });

    expect(layout.visibleRowCount).toBe(5);
  });

  it('assigns widths to all columns', () => {
    const data = createMockTableData(2, 3, 5);
    const layout = calculateTableLayout(data, 200, 30);

    for (const col of layout.columns) {
      expect(col.width).toBeGreaterThan(0);
    }
  });

  it('truncates long header text', () => {
    const data = createMockTableData(1, 1, 1);
    // Modify the prompt label to be very long
    data.head.prompts[0].label = 'A'.repeat(200);

    const layout = calculateTableLayout(data, 100, 30);
    const outputCol = layout.columns.find((c) => c.type === 'output');

    expect(outputCol).toBeDefined();
    expect(outputCol!.header.length).toBeLessThanOrEqual(outputCol!.width);
  });

  it('handles empty data gracefully', () => {
    const data: EvaluateTable = {
      head: { vars: [], prompts: [] },
      body: [],
    };
    const layout = calculateTableLayout(data, 100, 30);

    expect(layout.columns).toHaveLength(1); // Just index column
    expect(layout.visibleRowCount).toBe(0);
  });
});
