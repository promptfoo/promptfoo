import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetricFilterSelector } from './MetricFilterSelector';
import { useTableStore } from './store';

vi.mock('./store', () => ({
  useTableStore: vi.fn(),
}));

const mockedUseTableStore = vi.mocked(useTableStore);

describe('MetricFilterSelector', () => {
  const mockAddFilter = vi.fn();
  const mockResetFilters = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render a dropdown with all filters.options.metric values as selectable MenuItem options when filters.options.metric contains metrics', async () => {
    const availableMetrics = ['latency', 'cost', 'similarity'];
    mockedUseTableStore.mockReturnValue({
      filters: {
        options: {
          metric: availableMetrics,
        },
        values: {},
        appliedCount: 0,
      },
      addFilter: mockAddFilter,
      resetFilters: mockResetFilters,
    } as any);

    render(<MetricFilterSelector />);

    const selectButton = screen.getByRole('combobox', { name: /filter by metric/i });
    await userEvent.click(selectButton);

    expect(screen.getByRole('option', { name: 'All metrics' })).toBeInTheDocument();

    for (const metric of availableMetrics) {
      expect(screen.getByRole('option', { name: metric })).toBeInTheDocument();
    }

    const allOptions = screen.getAllByRole('option');
    expect(allOptions).toHaveLength(availableMetrics.length + 1);
  });

  it('should render only the "All metrics" option when filters.options.metric is an empty array', async () => {
    mockedUseTableStore.mockReturnValue({
      filters: {
        options: {
          metric: [],
        },
        values: {},
        appliedCount: 0,
      },
      addFilter: mockAddFilter,
      resetFilters: mockResetFilters,
    });

    render(<MetricFilterSelector />);

    const selectButton = screen.getByRole('combobox', { name: /filter by metric/i });
    await userEvent.click(selectButton);

    const allOptions = screen.getAllByRole('option');
    expect(allOptions).toHaveLength(1);
    expect(screen.getByRole('option', { name: 'All metrics' })).toBeInTheDocument();
  });

  it('should display the currently applied metric filter as the selected value in the dropdown when filters.values contains a metric filter', () => {
    const selectedMetric = 'latency';
    mockedUseTableStore.mockReturnValue({
      filters: {
        options: {
          metric: ['latency', 'cost', 'similarity'],
        },
        values: {
          metricFilter: {
            id: 'metricFilter',
            type: 'metric',
            operator: 'equals',
            value: selectedMetric,
            logicOperator: 'and',
          },
        },
        appliedCount: 1,
      },
      addFilter: mockAddFilter,
      resetFilters: mockResetFilters,
    });

    render(<MetricFilterSelector />);

    const selectElement = screen.getByRole('combobox', { name: /filter by metric/i });
    expect(selectElement).toHaveTextContent(selectedMetric);
  });

  it('should call resetFilters and then addFilter with the selected metric when a user selects a metric from the dropdown', async () => {
    const availableMetrics = ['latency', 'cost', 'similarity'];
    const selectedMetric = 'cost';
    mockedUseTableStore.mockReturnValue({
      filters: {
        options: {
          metric: availableMetrics,
        },
        values: {},
        appliedCount: 0,
      },
      addFilter: mockAddFilter,
      resetFilters: mockResetFilters,
    } as any);

    render(<MetricFilterSelector />);

    const selectButton = screen.getByRole('combobox', { name: /filter by metric/i });
    await userEvent.click(selectButton);

    const metricOption = screen.getByRole('option', { name: selectedMetric });
    await userEvent.click(metricOption);

    expect(mockResetFilters).toHaveBeenCalledTimes(1);
    expect(mockAddFilter).toHaveBeenCalledTimes(1);
    expect(mockAddFilter).toHaveBeenCalledWith({
      type: 'metric',
      operator: 'equals',
      value: selectedMetric,
    });
  });

  it('should call resetFilters and not call addFilter when the user selects the "All metrics" (empty) option', async () => {
    mockedUseTableStore.mockReturnValue({
      filters: {
        options: {
          metric: ['latency', 'cost', 'similarity'],
        },
        values: {
          metricFilter: {
            type: 'metric',
            operator: 'equals',
            value: 'latency',
            id: 'metricFilter',
            logicOperator: 'and',
          },
        },
        appliedCount: 1,
      },
      addFilter: mockAddFilter,
      resetFilters: mockResetFilters,
    } as any);

    render(<MetricFilterSelector />);

    const selectButton = screen.getByRole('combobox', { name: /filter by metric/i });
    await userEvent.click(selectButton);

    const allMetricsOption = screen.getByRole('option', { name: 'All metrics' });
    await userEvent.click(allMetricsOption);

    expect(mockResetFilters).toHaveBeenCalledTimes(1);
    expect(mockAddFilter).not.toHaveBeenCalled();
  });
});
