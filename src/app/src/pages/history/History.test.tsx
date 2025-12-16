import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import type { StandaloneEval } from '@promptfoo/util/database';

import History from './History';

const mockData: StandaloneEval[] = [
  {
    uuid: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
    evalId: 'eval-2024-01-01',
    datasetId: 'alpha-dataset',
    provider: 'TestProviderA',
    promptId: 'abc123prompt',
    raw: 'What is the capital of France?',
    label: 'What is the capital of France?',
    description: 'First evaluation',
    createdAt: new Date().getTime(),
    config: {},
    metrics: {
      testPassCount: 9,
      testFailCount: 1,
      testErrorCount: 0,
      score: 0.9,
      assertPassCount: 9,
      assertFailCount: 1,
      totalLatencyMs: 1000,
      tokenUsage: { total: 150, prompt: 100, completion: 50 },
      namedScores: {},
      namedScoresCount: {},
      cost: 0.01,
    },
    isRedteam: false,
    pluginFailCount: {},
    pluginPassCount: {},
  },
  {
    uuid: 'b2c3d4e5-f6a7-8901-2345-67890abcdef0',
    evalId: 'eval-2024-01-02',
    datasetId: 'beta-dataset',
    provider: 'TestProviderB',
    promptId: 'def456prompt',
    raw: 'Summarize the following text.',
    label: 'Summarize the following text.',
    description: 'Second evaluation',
    createdAt: new Date().getTime(),
    config: {},
    metrics: {
      testPassCount: 7,
      testFailCount: 2,
      testErrorCount: 1,
      score: 0.75,
      assertPassCount: 7,
      assertFailCount: 3,
      totalLatencyMs: 1200,
      tokenUsage: { total: 200, prompt: 150, completion: 50 },
      namedScores: {},
      namedScoresCount: {},
      cost: 0.02,
    },
    isRedteam: false,
    pluginFailCount: {},
    pluginPassCount: {},
  },
];

describe('History', () => {
  it('should render a DataGrid with all expected columns and rows when provided with a non-empty data array', () => {
    render(
      <MemoryRouter>
        <History data={mockData} isLoading={false} error={null} showDatasetColumn={true} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('columnheader', { name: 'Eval' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Dataset' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Provider' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Prompt' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Pass Rate %' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Pass Count' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Fail Count' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Raw score' })).toBeInTheDocument();

    const row1 = screen.getByRole('row', { name: /eval-2024-01-01/i });
    const row1Cells = within(row1);
    const evalLink1 = row1Cells.getByRole('link', { name: 'eval-2024-01-01' });
    expect(evalLink1).toHaveAttribute('href', '/eval?evalId=eval-2024-01-01');
    const datasetLink1 = row1Cells.getByRole('link', { name: 'alpha-' });
    expect(datasetLink1).toHaveAttribute('href', '/datasets?id=alpha-dataset');
    expect(row1Cells.getByText('TestProviderA')).toBeInTheDocument();
    const promptLink1 = row1Cells.getByRole('link', { name: '[abc123]' });
    expect(promptLink1).toHaveAttribute('href', '/prompts?id=abc123prompt');
    expect(row1Cells.getByText('What is the capital of France?')).toBeInTheDocument();
    expect(row1Cells.getByText('90.00')).toBeInTheDocument();
    expect(row1Cells.getByRole('gridcell', { name: '9' })).toBeInTheDocument();
    expect(row1Cells.getByRole('gridcell', { name: '1' })).toBeInTheDocument();
    expect(row1Cells.getByText('0.90')).toBeInTheDocument();

    const row2 = screen.getByRole('row', { name: /eval-2024-01-02/i });
    const row2Cells = within(row2);
    const evalLink2 = row2Cells.getByRole('link', { name: 'eval-2024-01-02' });
    expect(evalLink2).toHaveAttribute('href', '/eval?evalId=eval-2024-01-02');
    const datasetLink2 = row2Cells.getByRole('link', { name: 'beta-d' });
    expect(datasetLink2).toHaveAttribute('href', '/datasets?id=beta-dataset');
    expect(row2Cells.getByText('TestProviderB')).toBeInTheDocument();
    const promptLink2 = row2Cells.getByRole('link', { name: '[def456]' });
    expect(promptLink2).toHaveAttribute('href', '/prompts?id=def456prompt');
    expect(row2Cells.getByText('Summarize the following text.')).toBeInTheDocument();
    expect(row2Cells.getByText('77.78')).toBeInTheDocument();
    expect(row2Cells.getByRole('gridcell', { name: '7' })).toBeInTheDocument();
    expect(row2Cells.getByText('2')).toBeInTheDocument();
    expect(row2Cells.getByText('1 errors')).toBeInTheDocument();
    expect(row2Cells.getByText('0.75')).toBeInTheDocument();
  });

  it('should display the loading overlay when isLoading is true', () => {
    render(
      <MemoryRouter>
        <History data={[]} isLoading={true} error={null} showDatasetColumn={true} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Loading history...')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('should display the "No history found" overlay when data is an empty array, isLoading is false, and error is null', () => {
    render(
      <MemoryRouter>
        <History data={[]} isLoading={false} error={null} />
      </MemoryRouter>,
    );

    expect(screen.getByText('No history found')).toBeInTheDocument();
    expect(screen.getByText('Run some evals to see their results here')).toBeInTheDocument();
  });

  it('should display the error overlay with the error message when error is a non-null string and isLoading is false', () => {
    const errorMessage = 'Failed to load data.';
    render(
      <MemoryRouter>
        <History data={[]} isLoading={false} error={errorMessage} />
      </MemoryRouter>,
    );

    const errorElement = screen.getByText(errorMessage);
    expect(errorElement).toBeInTheDocument();
  });

  it('should not render the Dataset column when showDatasetColumn is false', () => {
    render(
      <MemoryRouter>
        <History data={mockData} isLoading={false} error={null} showDatasetColumn={false} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('columnheader', { name: 'Dataset' })).toBeNull();
  });

  it('should handle rows with undefined metrics without errors', () => {
    const mockData: StandaloneEval[] = [
      {
        uuid: 'c4d5e6f7-g8h9-0123-4567-890123ghijkl',
        evalId: 'eval-no-metrics',
        datasetId: 'no-metrics-dataset',
        provider: 'TestProviderC',
        promptId: 'ghi789prompt',
        raw: 'Translate to Spanish.',
        label: 'Translate to Spanish.',
        description: 'Evaluation with no metrics',
        createdAt: new Date().getTime(),
        config: {},
        metrics: undefined,
        isRedteam: false,
        pluginFailCount: {},
        pluginPassCount: {},
      },
    ];

    render(
      <MemoryRouter>
        <History data={mockData} isLoading={false} error={null} showDatasetColumn={true} />
      </MemoryRouter>,
    );

    const row = screen.getByRole('row', { name: /eval-no-metrics/i });
    const failCountCell = row.querySelector('[data-field="metrics.testFailCount"]');
    expect(failCountCell).toHaveTextContent('0');
  });

  it('should display 0.00 as the pass rate when both testPassCount and testFailCount are zero', () => {
    const mockData: StandaloneEval[] = [
      {
        uuid: 'test-uuid',
        evalId: 'test-eval',
        datasetId: 'test-dataset',
        provider: 'TestProvider',
        promptId: 'test-prompt',
        raw: 'Test prompt',
        label: 'Test prompt',
        description: 'Test evaluation',
        createdAt: new Date().getTime(),
        config: {},
        metrics: {
          testPassCount: 0,
          testFailCount: 0,
          testErrorCount: 0,
          score: 0,
          assertPassCount: 0,
          assertFailCount: 0,
          totalLatencyMs: 0,
          tokenUsage: { total: 0, prompt: 0, completion: 0 },
          namedScores: {},
          namedScoresCount: {},
          cost: 0,
        },
        isRedteam: false,
        pluginFailCount: {},
        pluginPassCount: {},
      },
    ];

    render(
      <MemoryRouter>
        <History data={mockData} isLoading={false} error={null} showDatasetColumn={true} />
      </MemoryRouter>,
    );

    const passRateCell = screen
      .getByRole('row', { name: /test-eval/i })
      .querySelector('[data-field="passRate"]');
    expect(passRateCell).toHaveTextContent('0');
  });

  it('should handle rows with extremely large or negative metric values gracefully', () => {
    const mockData: StandaloneEval[] = [
      {
        uuid: 'large-values-uuid',
        evalId: 'large-values-eval',
        datasetId: 'test-dataset',
        provider: 'TestProvider',
        promptId: 'test-prompt',
        raw: 'Test prompt with large values',
        label: 'Test prompt with large values',
        description: 'Evaluation with large metric values',
        createdAt: new Date().getTime(),
        config: {},
        metrics: {
          testPassCount: 1000000,
          testFailCount: -1000,
          testErrorCount: 0,
          score: -999999,
          assertPassCount: 0,
          assertFailCount: 0,
          totalLatencyMs: 0,
          tokenUsage: { total: 0, prompt: 0, completion: 0 },
          namedScores: {},
          namedScoresCount: {},
          cost: 0,
        },
        isRedteam: false,
        pluginFailCount: {},
        pluginPassCount: {},
      },
    ];

    render(
      <MemoryRouter>
        <History data={mockData} isLoading={false} error={null} showDatasetColumn={true} />
      </MemoryRouter>,
    );

    const row = screen.getByRole('row', { name: /large-values-eval/i });
    const rowCells = within(row);

    expect(rowCells.getByText('100.10')).toBeInTheDocument();

    expect(rowCells.getByRole('gridcell', { name: '1000000' })).toBeInTheDocument();

    expect(rowCells.getByRole('gridcell', { name: '-1000' })).toBeInTheDocument();

    expect(rowCells.getByText('-999999.00')).toBeInTheDocument();
  });
});
