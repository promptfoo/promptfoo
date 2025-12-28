/**
 * Tests for DetailsPanel component.
 */

import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import { DetailsPanel } from '../../../../src/ui/components/table/DetailsPanel';

import type {
  TableCellData,
  TableColumn,
  TableRowData,
} from '../../../../src/ui/components/table/types';

// Mock terminal size
vi.mock('../../../../src/ui/hooks/useTerminalSize', () => ({
  useTerminalSize: () => ({ width: 100, height: 40 }),
}));

// Helper to create test data
function createTestData(
  overrides: Partial<{
    pass: boolean;
    prompt: string;
    response: string;
    error: string;
    latencyMs: number;
    cost: number;
    provider: string;
    gradingResult: any;
  }> = {},
) {
  const cellData: TableCellData = {
    content: overrides.response || 'Test response content',
    displayContent: overrides.response || 'Test response content',
    status: overrides.pass === false ? 'fail' : 'pass',
    isTruncated: false,
    output: {
      id: 'test-id',
      pass: overrides.pass !== false,
      score: overrides.pass !== false ? 1 : 0,
      text: overrides.response || 'Test response content',
      prompt: overrides.prompt || 'Test prompt content',
      latencyMs: overrides.latencyMs || 1234,
      cost: overrides.cost || 0.0025,
      provider: overrides.provider || 'openai:gpt-4',
      namedScores: {},
      failureReason: overrides.pass === false ? 1 : 0,
      gradingResult: overrides.gradingResult || {
        pass: overrides.pass !== false,
        score: overrides.pass !== false ? 1 : 0,
        reason: overrides.pass !== false ? 'Test passed' : 'Test failed',
      },
      error: overrides.error,
      tokenUsage: { prompt: 100, completion: 50 },
      testCase: { vars: {} },
    },
  };

  const column: TableColumn = {
    id: 'output-0',
    header: 'gpt-4',
    type: 'output',
    width: 30,
  };

  const rowData: TableRowData = {
    index: 0,
    testIdx: 0,
    cells: [cellData],
    originalRow: {
      description: 'Test row',
      outputs: [cellData.output!],
      vars: ['test variable value'],
      test: { vars: { var1: 'test variable value' } },
      testIdx: 0,
    },
  };

  return { cellData, column, rowData };
}

describe('DetailsPanel', () => {
  it('should render with basic content', () => {
    const { cellData, column, rowData } = createTestData();
    const onNavigate = vi.fn();
    const onClose = vi.fn();

    const { lastFrame } = render(
      <DetailsPanel
        cellData={cellData}
        column={column}
        rowData={rowData}
        allRows={[rowData]}
        varNames={['var1']}
        currentRowIndex={0}
        currentColIndex={1}
        outputCellIndex={0}
        onNavigate={onNavigate}
        onClose={onClose}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Details');
    expect(output).toContain('openai:gpt-4');
  });

  it('should display prompt section', () => {
    const { cellData, column, rowData } = createTestData({
      prompt: 'What is the meaning of life?',
    });
    const onNavigate = vi.fn();
    const onClose = vi.fn();

    const { lastFrame } = render(
      <DetailsPanel
        cellData={cellData}
        column={column}
        rowData={rowData}
        allRows={[rowData]}
        varNames={['var1']}
        currentRowIndex={0}
        currentColIndex={1}
        outputCellIndex={0}
        onNavigate={onNavigate}
        onClose={onClose}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('PROMPT');
  });

  it('should display response section', () => {
    const { cellData, column, rowData } = createTestData({
      response: 'The answer is 42.',
    });
    const onNavigate = vi.fn();
    const onClose = vi.fn();

    const { lastFrame } = render(
      <DetailsPanel
        cellData={cellData}
        column={column}
        rowData={rowData}
        allRows={[rowData]}
        varNames={['var1']}
        currentRowIndex={0}
        currentColIndex={1}
        outputCellIndex={0}
        onNavigate={onNavigate}
        onClose={onClose}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('RESPONSE');
  });

  it('should display assertions section when gradingResult exists', () => {
    const { cellData, column, rowData } = createTestData({
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'All assertions passed',
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'Contains expected text',
            assertion: { type: 'contains', value: '42' },
          },
          { pass: true, score: 1, reason: 'Factually accurate', assertion: { type: 'llm-rubric' } },
        ],
      },
    });
    const onNavigate = vi.fn();
    const onClose = vi.fn();

    const { lastFrame } = render(
      <DetailsPanel
        cellData={cellData}
        column={column}
        rowData={rowData}
        allRows={[rowData]}
        varNames={['var1']}
        currentRowIndex={0}
        currentColIndex={1}
        outputCellIndex={0}
        onNavigate={onNavigate}
        onClose={onClose}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('ASSERTIONS');
    expect(output).toContain('2/2 passed');
  });

  it('should display metadata section', () => {
    const { cellData, column, rowData } = createTestData({
      latencyMs: 1500,
      cost: 0.003,
      provider: 'anthropic:claude-3',
    });
    const onNavigate = vi.fn();
    const onClose = vi.fn();

    const { lastFrame } = render(
      <DetailsPanel
        cellData={cellData}
        column={column}
        rowData={rowData}
        allRows={[rowData]}
        varNames={['var1']}
        currentRowIndex={0}
        currentColIndex={1}
        outputCellIndex={0}
        onNavigate={onNavigate}
        onClose={onClose}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('METADATA');
  });

  it('should display variables section', () => {
    const { cellData, column, rowData } = createTestData();
    const onNavigate = vi.fn();
    const onClose = vi.fn();

    const { lastFrame } = render(
      <DetailsPanel
        cellData={cellData}
        column={column}
        rowData={rowData}
        allRows={[rowData]}
        varNames={['myVariable']}
        currentRowIndex={0}
        currentColIndex={1}
        outputCellIndex={0}
        onNavigate={onNavigate}
        onClose={onClose}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('VARIABLES');
  });

  it('should show row position', () => {
    const { cellData, column, rowData } = createTestData();
    const allRows = [
      rowData,
      { ...rowData, index: 1, testIdx: 1 },
      { ...rowData, index: 2, testIdx: 2 },
    ];
    const onNavigate = vi.fn();
    const onClose = vi.fn();

    const { lastFrame } = render(
      <DetailsPanel
        cellData={cellData}
        column={column}
        rowData={rowData}
        allRows={allRows}
        varNames={['var1']}
        currentRowIndex={1}
        currentColIndex={1}
        outputCellIndex={0}
        onNavigate={onNavigate}
        onClose={onClose}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Row 2/3');
  });

  it('should display pass status badge', () => {
    const { cellData, column, rowData } = createTestData({ pass: true });
    const onNavigate = vi.fn();
    const onClose = vi.fn();

    const { lastFrame } = render(
      <DetailsPanel
        cellData={cellData}
        column={column}
        rowData={rowData}
        allRows={[rowData]}
        varNames={['var1']}
        currentRowIndex={0}
        currentColIndex={1}
        outputCellIndex={0}
        onNavigate={onNavigate}
        onClose={onClose}
      />,
    );

    const output = lastFrame();
    // Should contain pass indicator (checkmark or PASS text)
    expect(output).toMatch(/PASS|✓/);
  });

  it('should display fail status badge', () => {
    const { cellData, column, rowData } = createTestData({ pass: false });
    const onNavigate = vi.fn();
    const onClose = vi.fn();

    const { lastFrame } = render(
      <DetailsPanel
        cellData={cellData}
        column={column}
        rowData={rowData}
        allRows={[rowData]}
        varNames={['var1']}
        currentRowIndex={0}
        currentColIndex={1}
        outputCellIndex={0}
        onNavigate={onNavigate}
        onClose={onClose}
      />,
    );

    const output = lastFrame();
    // Should contain fail indicator
    expect(output).toMatch(/FAIL|✗/);
  });

  it('should show keyboard shortcuts in footer', () => {
    const { cellData, column, rowData } = createTestData();
    const onNavigate = vi.fn();
    const onClose = vi.fn();

    const { lastFrame } = render(
      <DetailsPanel
        cellData={cellData}
        column={column}
        rowData={rowData}
        allRows={[rowData]}
        varNames={['var1']}
        currentRowIndex={0}
        currentColIndex={1}
        outputCellIndex={0}
        onNavigate={onNavigate}
        onClose={onClose}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('[j/k]');
    expect(output).toContain('[Tab]');
    expect(output).toContain('[y]');
    expect(output).toContain('[q]');
  });

  it('should show failed assertion details', () => {
    const { cellData, column, rowData } = createTestData({
      pass: false,
      gradingResult: {
        pass: false,
        score: 0.5,
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'Contains Paris',
            assertion: { type: 'contains', value: 'Paris' },
          },
          {
            pass: false,
            score: 0,
            reason: 'Cost exceeded limit',
            assertion: { type: 'cost', value: 0.001 },
          },
        ],
      },
    });
    const onNavigate = vi.fn();
    const onClose = vi.fn();

    const { lastFrame } = render(
      <DetailsPanel
        cellData={cellData}
        column={column}
        rowData={rowData}
        allRows={[rowData]}
        varNames={['var1']}
        currentRowIndex={0}
        currentColIndex={1}
        outputCellIndex={0}
        onNavigate={onNavigate}
        onClose={onClose}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('1/2 passed');
  });
});
