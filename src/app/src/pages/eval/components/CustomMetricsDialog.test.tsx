import { useCustomPoliciesMap } from '@app/hooks/useCustomPoliciesMap';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CustomMetricsDialog from './CustomMetricsDialog';
import { useTableStore } from './store';
import type { EvaluateTable } from '@promptfoo/types';

vi.mock('./store', () => ({
  useTableStore: vi.fn(),
}));

vi.mock('@app/hooks/useCustomPoliciesMap', () => ({
  useCustomPoliciesMap: vi.fn(),
}));

const mockAddFilter = vi.fn();
const mockOnClose = vi.fn();

const mockTableData: EvaluateTable = {
  head: {
    prompts: [
      {
        raw: 'Test prompt',
        label: 'Test prompt',
        provider: 'Test Provider',
        metrics: {
          namedScores: {
            accuracy: 0.95,
            'another-metric': 0.8,
          },
          namedScoresCount: {
            accuracy: 100,
            'another-metric': 50,
          },
          cost: 0,
          score: 0,
          testPassCount: 0,
          testFailCount: 0,
          testErrorCount: 0,
          assertPassCount: 0,
          assertFailCount: 0,
          totalLatencyMs: 0,
          tokenUsage: {},
        },
      },
    ],
    vars: [],
  },
  body: [],
};

describe('MetricsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCustomPoliciesMap).mockReturnValue({});
    vi.mocked(useTableStore).mockReturnValue({
      table: mockTableData,
      config: {
        redteam: {
          plugins: [],
        },
      },
      addFilter: mockAddFilter,
      filters: {
        values: {},
        appliedCount: 0,
        options: {
          metric: [],
          metadata: [],
        },
      },
    } as any);
  });

  it('should apply the correct metric filter and close the dialog when the filter icon is clicked for a non-policy metric row', async () => {
    render(<CustomMetricsDialog open={true} onClose={mockOnClose} />);
    const user = userEvent.setup();

    const metricText = await screen.findByText('accuracy');
    const row = metricText.closest('tr');
    expect(row).not.toBeNull();

    const filterButton = within(row as HTMLElement).getByRole('button', {
      name: 'Filter results by accuracy',
    });
    await user.click(filterButton);

    expect(mockAddFilter).toHaveBeenCalledTimes(1);
    expect(mockAddFilter).toHaveBeenCalledWith({
      type: 'metric',
      operator: 'is_defined',
      value: '',
      field: 'accuracy',
      logicOperator: 'or',
    });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('uses filtered named scores and denominators when filters are active', async () => {
    vi.mocked(useTableStore).mockReturnValue({
      table: mockTableData,
      filteredMetrics: [
        {
          namedScores: { accuracy: 1.5 },
          namedScoresCount: { accuracy: 2 },
        },
      ],
      config: { redteam: { plugins: [] } },
      addFilter: mockAddFilter,
      filters: {
        values: {},
        appliedCount: 1,
        options: { metric: [], metadata: [] },
      },
    } as any);

    render(<CustomMetricsDialog open={true} onClose={mockOnClose} />);

    const accuracyRow = (await screen.findByText('accuracy')).closest('tr');
    expect(accuracyRow).not.toBeNull();
    expect(within(accuracyRow as HTMLElement).getByText('75.00%')).toBeInTheDocument();
    expect(within(accuracyRow as HTMLElement).getByText('1.5')).toBeInTheDocument();
    expect(within(accuracyRow as HTMLElement).getByText('2')).toBeInTheDocument();
    expect(screen.queryByText('another-metric')).not.toBeInTheDocument();
  });

  it('keeps filtered and comparison totals separate in cross-prompt summaries', async () => {
    const state = vi.mocked(useTableStore)();
    const prompt = mockTableData.head.prompts[0];
    const metrics = prompt.metrics!;
    vi.mocked(useTableStore).mockReturnValue({
      ...state,
      table: {
        ...mockTableData,
        head: { ...mockTableData.head, prompts: [prompt, prompt] },
      },
      derivedMetricNamesByPrompt: [[], []],
      filteredMetrics: [
        {
          ...metrics,
          namedScores: { accuracy: 1 },
          namedScoresCount: { accuracy: 2 },
        },
      ],
    });
    render(<CustomMetricsDialog open isFilteringActive onClose={mockOnClose} />);
    const accuracy = within((await screen.findByText('accuracy')).closest('tr')!);
    expect(accuracy.getByText('50.00%')).toBeInTheDocument();
    expect(accuracy.getByText('0.95 (total)')).toBeInTheDocument();
    expect(accuracy.getByTitle('Pass rate unavailable')).toBeInTheDocument();
    expect(accuracy.getByTitle('Pass-rate spread across prompt columns')).toHaveTextContent('--');
    const absent = within(screen.getByText('another-metric').closest('tr')!);
    expect(absent.getByTitle('Score unavailable')).toHaveTextContent('—');
  });

  it('keeps unavailable pass rates and counts distinct from an explicit zero', async () => {
    const table = structuredClone(mockTableData);
    const prompt = table.head.prompts[0];
    const metrics = prompt.metrics!;
    metrics.namedScores = { accuracy: 2, 'zero-control': 0 };
    metrics.namedScoresCount = { 'zero-control': 0 };
    for (const score of [60, 80]) {
      table.head.prompts.push({
        ...prompt,
        metrics: {
          ...metrics,
          namedScores: { accuracy: score },
          namedScoresCount: { accuracy: 100 },
        },
      });
    }
    vi.mocked(useTableStore).mockReturnValue({
      ...vi.mocked(useTableStore)(),
      table,
    });

    render(<CustomMetricsDialog open={true} onClose={mockOnClose} />);

    const accuracy = within((await screen.findByText('accuracy')).closest('tr')!);
    expect(accuracy.getAllByTitle('Pass rate unavailable')).toHaveLength(2);
    expect(accuracy.getAllByText('—')).toHaveLength(3);
    expect(accuracy.getByText('60.00%')).toBeInTheDocument();
    expect(accuracy.getByText('80.00%')).toBeInTheDocument();
    expect(accuracy.getByTitle('Pass-rate spread across prompt columns')).toHaveTextContent('--');
    expect(accuracy.queryByText('70.00%')).not.toBeInTheDocument();

    const zero = within(screen.getByText('zero-control').closest('tr')!);
    const zeroCells = zero.getAllByRole('cell');
    expect(zeroCells[1]).toHaveTextContent('0.00%');
    expect(zeroCells[3]).toHaveTextContent('0');
    expect(zero.getAllByTitle('Pass rate unavailable')).toHaveLength(2);
  });

  it('should return null when table is missing', () => {
    vi.mocked(useTableStore).mockReturnValue({
      table: null,
      config: {
        redteam: {
          plugins: [],
        },
      },
      addFilter: vi.fn(),
      filters: {
        values: {},
        appliedCount: 0,
        options: {
          metric: [],
          metadata: [],
        },
      },
    } as any);

    const { container } = render(<CustomMetricsDialog open={true} onClose={vi.fn()} />);

    expect(container.firstChild).toBeNull();
  });

  it('should render the DataTable with metric columns and rows when table data and promptMetricNames are available', async () => {
    render(<CustomMetricsDialog open={true} onClose={mockOnClose} />);

    const dataTable = await screen.findByRole('table');

    expect(dataTable).toBeInTheDocument();
  });

  it('should label a single prompt group without rendering multi-prompt summary columns', async () => {
    render(<CustomMetricsDialog open={true} onClose={mockOnClose} />);

    expect(await screen.findByText('Prompt 1')).toBeInTheDocument();
    expect(screen.getByText('Test Provider')).toBeInTheDocument();
    expect(screen.getByText('Pass')).toBeInTheDocument();
    expect(screen.getByText('Score')).toBeInTheDocument();
    expect(screen.getByText('Count')).toBeInTheDocument();
    expect(screen.queryByText('Summary')).not.toBeInTheDocument();
    expect(screen.queryByText('Spread')).not.toBeInTheDocument();
  });

  it('should render summary metrics when multiple prompt columns are present', async () => {
    const user = userEvent.setup();
    vi.mocked(useTableStore).mockReturnValue({
      table: {
        head: {
          prompts: [
            {
              raw: 'Prompt A',
              label: 'Prompt A',
              provider: 'Shared Provider',
              metrics: {
                namedScores: {
                  accuracy: 80,
                },
                namedScoresCount: {
                  accuracy: 100,
                },
                cost: 0,
                score: 0,
                testPassCount: 0,
                testFailCount: 0,
                testErrorCount: 0,
                assertPassCount: 0,
                assertFailCount: 0,
                totalLatencyMs: 0,
                tokenUsage: {},
              },
            },
            {
              raw: 'Prompt B',
              label: 'Prompt B',
              provider: 'Shared Provider',
              metrics: {
                namedScores: {
                  accuracy: 60,
                },
                namedScoresCount: {
                  accuracy: 100,
                },
                cost: 0,
                score: 0,
                testPassCount: 0,
                testFailCount: 0,
                testErrorCount: 0,
                assertPassCount: 0,
                assertFailCount: 0,
                totalLatencyMs: 0,
                tokenUsage: {},
              },
            },
          ],
          vars: [],
        },
        body: [],
      },
      config: {
        redteam: {
          plugins: [],
        },
      },
      addFilter: mockAddFilter,
      filters: {
        values: {},
        appliedCount: 0,
        options: {
          metric: [],
          metadata: [],
        },
      },
    } as any);

    render(<CustomMetricsDialog open={true} onClose={mockOnClose} />);

    expect(await screen.findAllByText('Shared Provider')).toHaveLength(2);
    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Avg. Pass')).toBeInTheDocument();
    expect(screen.getByText('Spread')).toBeInTheDocument();
    expect(screen.getByText('70.00%')).toBeInTheDocument();
    expect(screen.getByText('20.00 pts')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Columns/i }));
    expect(
      await screen.findByRole('menuitemcheckbox', {
        name: 'Prompt 1 - Shared Provider - Pass',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Prompt 2 - Shared Provider - Count' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Summary - Avg. Pass' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitemcheckbox', { name: 'prompt_0_group' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitemcheckbox', { name: 'Pass' })).not.toBeInTheDocument();
  });

  it('should return null when promptMetricNames is empty', () => {
    vi.mocked(useTableStore).mockReturnValue({
      table: {
        head: {
          prompts: [],
          vars: [],
        },
        body: [],
      },
      config: {
        redteam: {
          plugins: [],
        },
      },
      addFilter: mockAddFilter,
      filters: {
        values: {},
        appliedCount: 0,
        options: {
          metric: [],
          metadata: [],
        },
      },
    } as any);

    render(<CustomMetricsDialog open={true} onClose={mockOnClose} />);

    const dataTable = screen.queryByRole('table');

    expect(dataTable).toBeNull();
  });

  it('should render without error when config is null', () => {
    vi.mocked(useTableStore).mockReturnValue({
      table: mockTableData,
      config: null,
      addFilter: vi.fn(),
      filters: {
        values: {},
        appliedCount: 0,
        options: {
          metric: [],
          metadata: [],
        },
      },
    } as any);

    render(<CustomMetricsDialog open={true} onClose={mockOnClose} />);

    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('should display the original policy metric when the policy ID is not found in policiesById', async () => {
    const policyMetric = 'Policy:my-policy-id';
    vi.mocked(useTableStore).mockReturnValue({
      table: {
        head: {
          prompts: [
            {
              raw: 'Test prompt',
              label: 'Test prompt',
              provider: 'Test Provider',
              metrics: {
                namedScores: {
                  [policyMetric]: 0.95,
                },
                namedScoresCount: {
                  [policyMetric]: 100,
                },
                cost: 0,
                score: 0,
                testPassCount: 0,
                testFailCount: 0,
                testErrorCount: 0,
                assertPassCount: 0,
                assertFailCount: 0,
                totalLatencyMs: 0,
                tokenUsage: {},
              },
            },
          ],
          vars: [],
        },
        body: [],
      },
      config: {
        redteam: {
          plugins: [],
        },
      },
      addFilter: mockAddFilter,
      filters: {
        values: {},
        appliedCount: 0,
        options: {
          metric: [],
          metadata: [],
        },
      },
    } as any);

    render(<CustomMetricsDialog open={true} onClose={mockOnClose} />);

    const metricElement = await screen.findByText(policyMetric);
    expect(metricElement).toBeInTheDocument();
  });

  it('should render correctly when prompts have undefined or missing metrics.namedScores', () => {
    const mockTableDataWithMissingMetrics: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Prompt 1',
            label: 'Prompt 1',
            provider: 'Provider A',
            metrics: {
              namedScores: {
                accuracy: 0.9,
              },
              namedScoresCount: {
                accuracy: 100,
              },
              cost: 0,
              score: 0,
              testPassCount: 0,
              testFailCount: 0,
              testErrorCount: 0,
              assertPassCount: 0,
              assertFailCount: 0,
              totalLatencyMs: 0,
              tokenUsage: {},
            },
          },
          {
            raw: 'Prompt 2',
            label: 'Prompt 2',
            provider: 'Provider B',
            metrics: undefined,
          },
          {
            raw: 'Prompt 3',
            label: 'Prompt 3',
            provider: 'Provider C',
            metrics: {
              namedScores: {},
              namedScoresCount: {},
              cost: 0,
              score: 0,
              testPassCount: 0,
              testFailCount: 0,
              testErrorCount: 0,
              assertPassCount: 0,
              assertFailCount: 0,
              totalLatencyMs: 0,
              tokenUsage: {},
            },
          },
        ],
        vars: [],
      },
      body: [],
    };

    vi.mocked(useTableStore).mockReturnValue({
      table: mockTableDataWithMissingMetrics,
      config: {
        redteam: {
          plugins: [],
        },
      },
      addFilter: mockAddFilter,
      filters: {
        values: {},
        appliedCount: 0,
        options: {
          metric: [],
          metadata: [],
        },
      },
    } as any);

    render(<CustomMetricsDialog open={true} onClose={mockOnClose} />);

    const dataTableElement = screen.getByRole('table');
    expect(dataTableElement).toBeInTheDocument();

    const accuracyElement = screen.getByText('accuracy');
    expect(accuracyElement).toBeInTheDocument();
  });
});
