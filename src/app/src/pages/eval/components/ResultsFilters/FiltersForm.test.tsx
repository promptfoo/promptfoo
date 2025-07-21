import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { type ResultsFilter, useTableStore } from '../store';
import FiltersForm from './FiltersForm';

vi.mock('../store', () => ({
  useTableStore: vi.fn(),
}));

const mockedUseTableStore = useTableStore as unknown as Mock;

describe('FiltersForm', () => {
  const mockOnClose = vi.fn();
  const anchorEl = document.createElement('div');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should automatically add a default filter when opened and no filters exist', () => {
    const mockAddFilter = vi.fn();
    mockedUseTableStore.mockReturnValue({
      filters: {
        values: {},
        options: { metric: ['some-metric-option'] },
      },
      addFilter: mockAddFilter,
      removeAllFilters: vi.fn(),
      updateFilter: vi.fn(),
      removeFilter: vi.fn(),
    });

    const { rerender } = render(
      <FiltersForm open={true} onClose={mockOnClose} anchorEl={anchorEl} />,
    );

    expect(mockAddFilter).toHaveBeenCalledTimes(1);
    expect(mockAddFilter).toHaveBeenCalledWith({
      type: 'metric',
      operator: 'equals',
      value: '',
    });

    const newFilter: ResultsFilter = {
      id: 'mock-filter-id-1',
      logicOperator: 'and',
      type: 'metric',
      operator: 'equals',
      value: '',
    };
    mockedUseTableStore.mockReturnValue({
      filters: {
        values: { [newFilter.id]: newFilter },
        options: { metric: ['some-metric-option'] },
      },
      addFilter: mockAddFilter,
      removeAllFilters: vi.fn(),
      updateFilter: vi.fn(),
      removeFilter: vi.fn(),
    });

    rerender(<FiltersForm open={true} onClose={mockOnClose} anchorEl={anchorEl} />);

    expect(screen.getByRole('combobox', { name: 'Filter Type' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Operator' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Metric' })).toBeInTheDocument();
  });

  it('should not add a default filter when popover is reopened with existing filters', () => {
    const mockAddFilter = vi.fn();
    const existingFilter: ResultsFilter = {
      id: 'existing-filter-id',
      type: 'metric',
      operator: 'equals',
      value: 'existing-value',
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      filters: {
        values: { [existingFilter.id]: existingFilter },
        options: { metric: ['some-metric-option'] },
      },
      addFilter: mockAddFilter,
      removeAllFilters: vi.fn(),
      updateFilter: vi.fn(),
      removeFilter: vi.fn(),
    });

    const { rerender } = render(
      <FiltersForm open={true} onClose={mockOnClose} anchorEl={anchorEl} />,
    );

    expect(mockAddFilter).not.toHaveBeenCalled();

    rerender(<FiltersForm open={false} onClose={mockOnClose} anchorEl={anchorEl} />);
    rerender(<FiltersForm open={true} onClose={mockOnClose} anchorEl={anchorEl} />);

    expect(mockAddFilter).not.toHaveBeenCalled();
  });

  it('should add a new filter to the list when the Add Filter button is clicked', () => {
    const mockAddFilter = vi.fn();
    mockedUseTableStore.mockReturnValue({
      filters: {
        values: {},
        options: { metric: [] },
      },
      addFilter: mockAddFilter,
      removeAllFilters: vi.fn(),
      updateFilter: vi.fn(),
      removeFilter: vi.fn(),
    });

    render(<FiltersForm open={true} onClose={mockOnClose} anchorEl={anchorEl} />);

    const addButton = screen.getByText('Add Filter');
    const initialCallCount = mockAddFilter.mock.calls.length;
    fireEvent.click(addButton);

    expect(mockAddFilter.mock.calls.length).toBe(initialCallCount + 1);
  });

  it('should remove all filters and close the popover when the "Remove All" button is clicked', () => {
    const mockRemoveAllFilters = vi.fn();
    mockedUseTableStore.mockReturnValue({
      filters: {
        values: {
          'filter-id-1': { id: 'filter-id-1', type: 'metric', operator: 'equals', value: 'value1' },
          'filter-id-2': { id: 'filter-id-2', type: 'metric', operator: 'equals', value: 'value2' },
        },
        options: { metric: ['some-metric-option'] },
      },
      addFilter: vi.fn(),
      removeAllFilters: mockRemoveAllFilters,
      updateFilter: vi.fn(),
      removeFilter: vi.fn(),
    });

    render(<FiltersForm open={true} onClose={mockOnClose} anchorEl={anchorEl} />);
    const removeAllButton = screen.getByRole('button', { name: 'Remove All' });
    fireEvent.click(removeAllButton);

    expect(mockRemoveAllFilters).toHaveBeenCalledTimes(1);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should render a Filter component for each filter in filters.values', () => {
    const filters: Record<string, ResultsFilter> = {
      'filter-id-1': {
        id: 'filter-id-1',
        type: 'metric',
        operator: 'equals',
        value: 'value1',
        logicOperator: 'and',
      },
      'filter-id-2': {
        id: 'filter-id-2',
        type: 'metric',
        operator: 'equals',
        value: 'value2',
        logicOperator: 'or',
      },
    };

    mockedUseTableStore.mockReturnValue({
      filters: {
        values: filters,
        options: { metric: ['some-metric-option'] },
      },
      addFilter: vi.fn(),
      removeAllFilters: vi.fn(),
      updateFilter: vi.fn(),
      removeFilter: vi.fn(),
    });

    render(<FiltersForm open={true} onClose={mockOnClose} anchorEl={anchorEl} />);

    const filterComponents = screen.getAllByRole('combobox', { name: 'Filter Type' });
    expect(filterComponents.length).toBe(Object.keys(filters).length);
  });
});
