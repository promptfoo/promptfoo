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

    const filterButton = within(row as HTMLElement).getByRole('button');
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
