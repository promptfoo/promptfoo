import { TooltipProvider } from '@app/components/ui/tooltip';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FilterChips } from './FilterChips';
import { useTableStore } from './store';

vi.mock('./store', () => ({
  useTableStore: vi.fn(),
}));

vi.mock('@app/hooks/useCustomPoliciesMap', () => ({
  useCustomPoliciesMap: vi.fn(() => ({})),
}));

const mockAddFilter = vi.fn();
const mockRemoveFilter = vi.fn();

const createMockStore = (overrides = {}) => ({
  filters: {
    values: {},
  },
  addFilter: mockAddFilter,
  removeFilter: mockRemoveFilter,
  config: { redteam: {} },
  table: {
    head: {
      prompts: [
        {
          metrics: {
            namedScores: {
              'harmful-content': 8,
              'prompt-injection': 3,
              'data-leakage': 10,
            },
            namedScoresCount: {
              'harmful-content': 10,
              'prompt-injection': 10,
              'data-leakage': 10,
            },
          },
        },
      ],
    },
  },
  ...overrides,
});

describe('FilterChips', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useTableStore).mockReturnValue(createMockStore() as any);
  });

  const renderWithTooltip = (ui: React.ReactElement) => {
    return render(<TooltipProvider>{ui}</TooltipProvider>);
  };

  it('renders the "Filter by metric:" label', () => {
    renderWithTooltip(<FilterChips />);

    expect(screen.getByText('Filter by metric:')).toBeInTheDocument();
  });

  it('renders metric chips for redteam evals', () => {
    renderWithTooltip(<FilterChips />);

    expect(screen.getByText('harmful-content')).toBeInTheDocument();
    expect(screen.getByText('prompt-injection')).toBeInTheDocument();
    expect(screen.getByText('data-leakage')).toBeInTheDocument();
  });

  it('sorts metrics by pass rate (lowest first)', () => {
    renderWithTooltip(<FilterChips />);

    const buttons = screen.getAllByRole('button');
    // First chip should be prompt-injection (30% pass rate - lowest)
    expect(buttons[0]).toHaveTextContent('prompt-injection');
    // Second should be harmful-content (80% pass rate)
    expect(buttons[1]).toHaveTextContent('harmful-content');
    // Third should be data-leakage (100% pass rate - highest)
    expect(buttons[2]).toHaveTextContent('data-leakage');
  });

  it('displays pass/test counts for each metric', () => {
    renderWithTooltip(<FilterChips />);

    expect(screen.getByText('(8/10)')).toBeInTheDocument();
    expect(screen.getByText('(3/10)')).toBeInTheDocument();
    expect(screen.getByText('(10/10)')).toBeInTheDocument();
  });

  it('applies red styling for low pass rate (< 50%)', () => {
    renderWithTooltip(<FilterChips />);

    // prompt-injection has 3/10 = 30% pass rate, should be red
    const promptInjectionChip = screen.getByText('prompt-injection').closest('button');
    expect(promptInjectionChip).toHaveClass('bg-red-50');
  });

  it('applies green styling for high pass rate (>= 80%)', () => {
    renderWithTooltip(<FilterChips />);

    // data-leakage has 10/10 = 100% pass rate, should be green
    const dataLeakageChip = screen.getByText('data-leakage').closest('button');
    expect(dataLeakageChip).toHaveClass('bg-emerald-50');

    // harmful-content has 8/10 = 80% pass rate, should also be green (>=80%)
    const harmfulChip = screen.getByText('harmful-content').closest('button');
    expect(harmfulChip).toHaveClass('bg-emerald-50');
  });

  it('applies amber styling for medium pass rate (50-79%)', () => {
    vi.mocked(useTableStore).mockReturnValue(
      createMockStore({
        table: {
          head: {
            prompts: [
              {
                metrics: {
                  namedScores: {
                    'medium-metric': 6,
                  },
                  namedScoresCount: {
                    'medium-metric': 10,
                  },
                },
              },
            ],
          },
        },
      }) as any,
    );

    renderWithTooltip(<FilterChips />);

    // 6/10 = 60% pass rate, should be amber
    const chip = screen.getByText('medium-metric').closest('button');
    expect(chip).toHaveClass('bg-amber-50');
  });

  it('calls addFilter when clicking an inactive chip', async () => {
    const user = userEvent.setup();
    renderWithTooltip(<FilterChips />);

    const chip = screen.getByText('harmful-content').closest('button');
    await user.click(chip!);

    expect(mockAddFilter).toHaveBeenCalledWith({
      type: 'metric',
      operator: 'is_defined',
      value: '',
      field: 'harmful-content',
      logicOperator: 'or',
    });
  });
});

describe('FilterChips with active filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useTableStore).mockReturnValue(
      createMockStore({
        filters: {
          values: {
            'filter-1': {
              id: 'filter-1',
              type: 'metric',
              field: 'harmful-content',
              operator: 'is_defined',
              value: '',
            },
          },
        },
        table: {
          head: {
            prompts: [
              {
                metrics: {
                  namedScores: {
                    'harmful-content': 8,
                  },
                  namedScoresCount: {
                    'harmful-content': 10,
                  },
                },
              },
            ],
          },
        },
      }) as any,
    );
  });

  it('applies blue styling for active filter', () => {
    render(
      <TooltipProvider>
        <FilterChips />
      </TooltipProvider>,
    );

    const activeChip = screen.getByText('harmful-content').closest('button');
    expect(activeChip).toHaveClass('bg-blue-50');
  });

  it('calls removeFilter when clicking an active chip', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <FilterChips />
      </TooltipProvider>,
    );

    const chip = screen.getByText('harmful-content').closest('button');
    await user.click(chip!);

    expect(mockRemoveFilter).toHaveBeenCalledWith('filter-1');
  });
});

describe('FilterChips visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render for non-redteam evals', () => {
    vi.mocked(useTableStore).mockReturnValue(
      createMockStore({
        config: {}, // No redteam config
      }) as any,
    );

    const { container } = render(
      <TooltipProvider>
        <FilterChips />
      </TooltipProvider>,
    );

    expect(container.firstChild).toBeNull();
  });

  it('does not render when no metrics available', () => {
    vi.mocked(useTableStore).mockReturnValue(
      createMockStore({
        table: {
          head: {
            prompts: [
              {
                metrics: {
                  namedScores: {},
                  namedScoresCount: {},
                },
              },
            ],
          },
        },
      }) as any,
    );

    const { container } = render(
      <TooltipProvider>
        <FilterChips />
      </TooltipProvider>,
    );

    expect(container.firstChild).toBeNull();
  });
});

describe('FilterChips expand/collapse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createManyMetrics = () => {
    const namedScores: Record<string, number> = {};
    const namedScoresCount: Record<string, number> = {};
    // Create 12 metrics to trigger the expand/collapse behavior (default visible is 8)
    for (let i = 1; i <= 12; i++) {
      namedScores[`metric-${i}`] = i;
      namedScoresCount[`metric-${i}`] = 10;
    }
    return { namedScores, namedScoresCount };
  };

  it('shows expand button when more than 8 metrics exist', () => {
    vi.mocked(useTableStore).mockReturnValue(
      createMockStore({
        table: {
          head: {
            prompts: [{ metrics: createManyMetrics() }],
          },
        },
      }) as any,
    );

    render(
      <TooltipProvider>
        <FilterChips />
      </TooltipProvider>,
    );

    expect(screen.getByText('+4 more')).toBeInTheDocument();
  });

  it('expands to show all metrics when clicking expand button', async () => {
    const user = userEvent.setup();
    vi.mocked(useTableStore).mockReturnValue(
      createMockStore({
        table: {
          head: {
            prompts: [{ metrics: createManyMetrics() }],
          },
        },
      }) as any,
    );

    render(
      <TooltipProvider>
        <FilterChips />
      </TooltipProvider>,
    );

    // Initially, metric-12 should not be visible (it's beyond the first 8)
    // Note: metrics are sorted by pass rate, so metric-1 (10%) is first, metric-12 is likely hidden
    expect(screen.queryByText('metric-12')).not.toBeInTheDocument();

    // Click expand button
    await user.click(screen.getByText('+4 more'));

    // Now all metrics should be visible
    expect(screen.getByText('metric-12')).toBeInTheDocument();
    expect(screen.getByText('Show less')).toBeInTheDocument();
  });

  it('collapses back when clicking "Show less"', async () => {
    const user = userEvent.setup();
    vi.mocked(useTableStore).mockReturnValue(
      createMockStore({
        table: {
          head: {
            prompts: [{ metrics: createManyMetrics() }],
          },
        },
      }) as any,
    );

    render(
      <TooltipProvider>
        <FilterChips />
      </TooltipProvider>,
    );

    // Expand first
    await user.click(screen.getByText('+4 more'));
    expect(screen.getByText('metric-12')).toBeInTheDocument();

    // Collapse
    await user.click(screen.getByText('Show less'));

    // Should show expand button again
    expect(screen.getByText('+4 more')).toBeInTheDocument();
    expect(screen.queryByText('metric-12')).not.toBeInTheDocument();
  });

  it('does not show expand button when 8 or fewer metrics', () => {
    vi.mocked(useTableStore).mockReturnValue(createMockStore() as any);

    render(
      <TooltipProvider>
        <FilterChips />
      </TooltipProvider>,
    );

    expect(screen.queryByText(/more$/)).not.toBeInTheDocument();
    expect(screen.queryByText('Show less')).not.toBeInTheDocument();
  });
});
