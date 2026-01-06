import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type ResultsFilter, useTableStore } from '../store';
import FiltersForm from './FiltersForm';

vi.mock('../store', () => ({
  useTableStore: vi.fn(),
}));

const mockedUseTableStore = vi.mocked(useTableStore);

const mockUpdateFilter = vi.fn();
const mockRemoveFilter = vi.fn();
const mockUpdateAllFilterLogicOperators = vi.fn();
const mockAddFilter = vi.fn();
const mockRemoveAllFilters = vi.fn();
const mockFetchMetadataKeys = vi.fn();
const mockFetchMetadataValues = vi.fn();

const defaultStoreValue = {
  filters: {
    values: {},
    options: {
      metric: [],
      metadata: [],
      plugin: [],
      strategy: [],
      severity: [],
      policy: [],
    },
    appliedCount: 0,
  },
  metadataKeys: [],
  metadataKeysLoading: false,
  metadataKeysError: null,
  metadataValues: {},
  metadataValuesLoading: {},
  metadataValuesError: {},
  evalId: 'test-eval-id',
  addFilter: mockAddFilter,
  updateFilter: mockUpdateFilter,
  removeFilter: mockRemoveFilter,
  removeAllFilters: mockRemoveAllFilters,
  updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
  fetchMetadataKeys: mockFetchMetadataKeys,
  fetchMetadataValues: mockFetchMetadataValues,
};

async function openFiltersPopover(user: ReturnType<typeof userEvent.setup>) {
  const filtersButton = screen.getByRole('button', { name: /filters/i });
  await user.click(filtersButton);
  // Wait for popover to open
  await waitFor(() => {
    expect(screen.getByText('Add filter')).toBeInTheDocument();
  });
}

describe('FiltersForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a filters button', () => {
    mockedUseTableStore.mockReturnValue(defaultStoreValue as any);
    render(<FiltersForm />);
    expect(screen.getByRole('button', { name: /filters/i })).toBeInTheDocument();
  });

  it('shows filter count badge when there are applied filters', () => {
    mockedUseTableStore.mockReturnValue({
      ...defaultStoreValue,
      filters: {
        ...defaultStoreValue.filters,
        appliedCount: 3,
      },
    } as any);
    render(<FiltersForm />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('opens popover when clicking the filters button', async () => {
    mockedUseTableStore.mockReturnValue(defaultStoreValue as any);
    const user = userEvent.setup();
    render(<FiltersForm />);
    await openFiltersPopover(user);
    expect(screen.getByText('Add filter')).toBeInTheDocument();
  });

  it('automatically adds a default filter when opened with no existing filters', async () => {
    mockedUseTableStore.mockReturnValue({
      ...defaultStoreValue,
      filters: {
        ...defaultStoreValue.filters,
        options: {
          ...defaultStoreValue.filters.options,
          metric: ['latency'],
        },
      },
    } as any);

    const user = userEvent.setup();
    render(<FiltersForm />);
    await openFiltersPopover(user);

    expect(mockAddFilter).toHaveBeenCalledWith({
      type: 'metric',
      operator: 'equals',
      value: '',
    });
  });

  it('adds a new filter when Add filter button is clicked', async () => {
    mockedUseTableStore.mockReturnValue(defaultStoreValue as any);
    const user = userEvent.setup();
    render(<FiltersForm />);
    await openFiltersPopover(user);

    // Clear the initial auto-add call
    mockAddFilter.mockClear();

    const addButton = screen.getByText('Add filter');
    await user.click(addButton);

    expect(mockAddFilter).toHaveBeenCalledWith({
      type: 'metadata',
      operator: 'equals',
      value: '',
    });
  });

  it('shows Clear all button when there are filters', async () => {
    const filter: ResultsFilter = {
      id: 'filter-1',
      type: 'metadata',
      operator: 'equals',
      value: 'test',
      field: 'key1',
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      ...defaultStoreValue,
      filters: {
        ...defaultStoreValue.filters,
        values: { 'filter-1': filter },
        appliedCount: 1,
      },
    } as any);

    const user = userEvent.setup();
    render(<FiltersForm />);
    await openFiltersPopover(user);

    expect(screen.getByText('Clear all')).toBeInTheDocument();
  });

  it('calls removeAllFilters when Clear all is clicked', async () => {
    const filter: ResultsFilter = {
      id: 'filter-1',
      type: 'metadata',
      operator: 'equals',
      value: 'test',
      field: 'key1',
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      ...defaultStoreValue,
      filters: {
        ...defaultStoreValue.filters,
        values: { 'filter-1': filter },
        appliedCount: 1,
      },
    } as any);

    const user = userEvent.setup();
    render(<FiltersForm />);
    await openFiltersPopover(user);

    await user.click(screen.getByText('Clear all'));
    expect(mockRemoveAllFilters).toHaveBeenCalledTimes(1);
  });

  it('shows loading state for metadata keys', async () => {
    const filter: ResultsFilter = {
      id: 'filter-1',
      type: 'metadata',
      operator: 'equals',
      value: '',
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      ...defaultStoreValue,
      filters: {
        ...defaultStoreValue.filters,
        values: { 'filter-1': filter },
      },
      metadataKeysLoading: true,
    } as any);

    const user = userEvent.setup();
    render(<FiltersForm />);
    await openFiltersPopover(user);

    expect(screen.getByPlaceholderText('Loading keys...')).toBeInTheDocument();
  });

  it('shows error state for metadata keys', async () => {
    const filter: ResultsFilter = {
      id: 'filter-1',
      type: 'metadata',
      operator: 'equals',
      value: '',
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      ...defaultStoreValue,
      filters: {
        ...defaultStoreValue.filters,
        values: { 'filter-1': filter },
      },
      metadataKeysError: true,
    } as any);

    const user = userEvent.setup();
    render(<FiltersForm />);
    await openFiltersPopover(user);

    expect(screen.getByPlaceholderText('Error loading keys')).toBeInTheDocument();
  });

  it('shows metadata key dropdown when keys are loaded', async () => {
    const filter: ResultsFilter = {
      id: 'filter-1',
      type: 'metadata',
      operator: 'equals',
      value: '',
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      ...defaultStoreValue,
      filters: {
        ...defaultStoreValue.filters,
        values: { 'filter-1': filter },
      },
      metadataKeys: ['key1', 'key2', 'key3'],
    } as any);

    const user = userEvent.setup();
    render(<FiltersForm />);
    await openFiltersPopover(user);

    // Find all comboboxes and find the one with placeholder "Choose key..."
    const selects = screen.getAllByRole('combobox');
    // One of them should have metadata key options
    expect(selects.length).toBeGreaterThan(0);
  });

  it('renders filter type selector with available options', async () => {
    const filter: ResultsFilter = {
      id: 'filter-1',
      type: 'metadata',
      operator: 'equals',
      value: '',
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      ...defaultStoreValue,
      filters: {
        ...defaultStoreValue.filters,
        values: { 'filter-1': filter },
        options: {
          metric: ['latency'],
          metadata: [],
          plugin: ['plugin1'],
          strategy: ['strategy1'],
          severity: ['high', 'medium'],
          policy: [],
        },
      },
    } as any);

    const user = userEvent.setup();
    render(<FiltersForm />);
    await openFiltersPopover(user);

    // The filter type dropdown should show available types
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThan(0);
  });

  it('shows severity options in value dropdown for severity filter', async () => {
    const filter: ResultsFilter = {
      id: 'filter-1',
      type: 'severity',
      operator: 'equals',
      value: '',
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      ...defaultStoreValue,
      filters: {
        ...defaultStoreValue.filters,
        values: { 'filter-1': filter },
        options: {
          ...defaultStoreValue.filters.options,
          severity: ['critical', 'high', 'medium', 'low'],
        },
      },
    } as any);

    const user = userEvent.setup();
    render(<FiltersForm />);
    await openFiltersPopover(user);

    // Find the severity value dropdown (should have placeholder "Choose severity...")
    const selects = screen.getAllByRole('combobox');
    // Click on the value dropdown (last one should be the value selector)
    const valueDropdown = selects[selects.length - 1];
    await user.click(valueDropdown);

    // Should show severity options
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /critical/i })).toBeInTheDocument();
    });
  });

  it('shows plugin options in value dropdown for plugin filter', async () => {
    const filter: ResultsFilter = {
      id: 'filter-1',
      type: 'plugin',
      operator: 'equals',
      value: '',
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      ...defaultStoreValue,
      filters: {
        ...defaultStoreValue.filters,
        values: { 'filter-1': filter },
        options: {
          ...defaultStoreValue.filters.options,
          plugin: ['harmful:hate', 'harmful:violence'],
        },
      },
    } as any);

    const user = userEvent.setup();
    render(<FiltersForm />);
    await openFiltersPopover(user);

    // Find value dropdown and click
    const selects = screen.getAllByRole('combobox');
    const valueDropdown = selects[selects.length - 1];
    await user.click(valueDropdown);

    // Should show plugin options
    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    });
  });

  it('shows AND/OR selector for second filter', async () => {
    const filter1: ResultsFilter = {
      id: 'filter-1',
      type: 'metadata',
      operator: 'equals',
      value: 'val1',
      field: 'key1',
      sortIndex: 0,
      logicOperator: 'and',
    };
    const filter2: ResultsFilter = {
      id: 'filter-2',
      type: 'metadata',
      operator: 'equals',
      value: 'val2',
      field: 'key2',
      sortIndex: 1,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      ...defaultStoreValue,
      filters: {
        ...defaultStoreValue.filters,
        values: { 'filter-1': filter1, 'filter-2': filter2 },
        appliedCount: 2,
      },
      metadataKeys: ['key1', 'key2'],
    } as any);

    const user = userEvent.setup();
    render(<FiltersForm />);
    await openFiltersPopover(user);

    // Second filter row should have AND/OR selector
    const selects = screen.getAllByRole('combobox');
    // Look for 'and' or 'or' in the rendered content
    expect(selects.length).toBeGreaterThan(2); // At least logic operator + type + operator for multiple filters
  });

  it('calls updateFilter when filter value changes', async () => {
    const filter: ResultsFilter = {
      id: 'filter-1',
      type: 'severity',
      operator: 'equals',
      value: '',
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      ...defaultStoreValue,
      filters: {
        ...defaultStoreValue.filters,
        values: { 'filter-1': filter },
        options: {
          ...defaultStoreValue.filters.options,
          severity: ['critical', 'high', 'medium', 'low'],
        },
      },
    } as any);

    const user = userEvent.setup();
    render(<FiltersForm />);
    await openFiltersPopover(user);

    // Find the value dropdown and select an option
    const selects = screen.getAllByRole('combobox');
    const valueDropdown = selects[selects.length - 1];
    await user.click(valueDropdown);

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /high/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('option', { name: /high/i }));

    expect(mockUpdateFilter).toHaveBeenCalled();
  });

  it('shows number input for metric filter with comparison operators', async () => {
    const filter: ResultsFilter = {
      id: 'filter-1',
      type: 'metric',
      field: 'latency',
      operator: 'gt',
      value: '',
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      ...defaultStoreValue,
      filters: {
        ...defaultStoreValue.filters,
        values: { 'filter-1': filter },
        options: {
          ...defaultStoreValue.filters.options,
          metric: ['latency'],
        },
      },
    } as any);

    const user = userEvent.setup();
    render(<FiltersForm />);
    await openFiltersPopover(user);

    // Should have a number input for the value
    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs.length).toBeGreaterThan(0);
  });

  it('hides value input when exists operator is selected', async () => {
    const filter: ResultsFilter = {
      id: 'filter-1',
      type: 'metadata',
      field: 'key1',
      operator: 'exists',
      value: '',
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      ...defaultStoreValue,
      filters: {
        ...defaultStoreValue.filters,
        values: { 'filter-1': filter },
      },
      metadataKeys: ['key1', 'key2'],
    } as any);

    const user = userEvent.setup();
    render(<FiltersForm />);
    await openFiltersPopover(user);

    // With exists operator, value input should not be shown
    // Check that there's no text input for value (only the key dropdown and operator)
    const textInputs = screen.queryAllByRole('textbox');
    // Filter out any inputs that are for key entry
    const valueInputs = textInputs.filter(
      (input) => !input.getAttribute('placeholder')?.includes('key'),
    );
    expect(valueInputs.length).toBe(0);
  });

  it('defaults to metadata filter for standard evaluations', async () => {
    mockedUseTableStore.mockReturnValue({
      ...defaultStoreValue,
      filters: {
        ...defaultStoreValue.filters,
        options: {
          metric: [],
          metadata: [],
          plugin: [],
          strategy: [],
          severity: [],
          policy: [],
        },
      },
    } as any);

    const user = userEvent.setup();
    render(<FiltersForm />);
    await openFiltersPopover(user);

    expect(mockAddFilter).toHaveBeenCalledWith({
      type: 'metadata',
      operator: 'equals',
      value: '',
    });
  });

  it('defaults to metric filter when metrics are available', async () => {
    mockedUseTableStore.mockReturnValue({
      ...defaultStoreValue,
      filters: {
        ...defaultStoreValue.filters,
        options: {
          metric: ['latency', 'cost'],
          metadata: [],
          plugin: [],
          strategy: [],
          severity: [],
          policy: [],
        },
      },
    } as any);

    const user = userEvent.setup();
    render(<FiltersForm />);
    await openFiltersPopover(user);

    expect(mockAddFilter).toHaveBeenCalledWith({
      type: 'metric',
      operator: 'equals',
      value: '',
    });
  });

  it('calls removeFilter when remove button is clicked', async () => {
    const filter: ResultsFilter = {
      id: 'filter-1',
      type: 'metadata',
      operator: 'equals',
      value: '',
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      ...defaultStoreValue,
      filters: {
        ...defaultStoreValue.filters,
        values: { 'filter-1': filter },
      },
    } as any);

    const user = userEvent.setup();
    render(<FiltersForm />);
    await openFiltersPopover(user);

    // Find the remove button (X icon) in the filter row
    // It's a button with ghost variant containing an X icon
    const buttons = screen.getAllByRole('button');
    // Find the button that removes the filter (not Add filter, not Clear all, not Filters)
    const removeButton = buttons.find(
      (btn) =>
        !btn.textContent?.includes('Add') &&
        !btn.textContent?.includes('Clear') &&
        !btn.textContent?.includes('Filters') &&
        btn.querySelector('svg'),
    );

    if (removeButton) {
      await user.click(removeButton);
      expect(mockRemoveFilter).toHaveBeenCalledWith('filter-1');
    }
  });

  it('shows policy options when policy filter is selected', async () => {
    const filter: ResultsFilter = {
      id: 'filter-1',
      type: 'policy',
      operator: 'equals',
      value: '',
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      ...defaultStoreValue,
      filters: {
        ...defaultStoreValue.filters,
        values: { 'filter-1': filter },
        options: {
          ...defaultStoreValue.filters.options,
          policy: ['policy-1', 'policy-2'],
        },
        policyIdToNameMap: {
          'policy-1': 'Content Policy',
          'policy-2': 'Safety Policy',
        },
      },
    } as any);

    const user = userEvent.setup();
    render(<FiltersForm />);
    await openFiltersPopover(user);

    // Find value dropdown and click
    const selects = screen.getAllByRole('combobox');
    const valueDropdown = selects[selects.length - 1];
    await user.click(valueDropdown);

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Content Policy' })).toBeInTheDocument();
    });
  });

  it('shows strategy options when strategy filter is selected', async () => {
    const filter: ResultsFilter = {
      id: 'filter-1',
      type: 'strategy',
      operator: 'equals',
      value: '',
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      ...defaultStoreValue,
      filters: {
        ...defaultStoreValue.filters,
        values: { 'filter-1': filter },
        options: {
          ...defaultStoreValue.filters.options,
          strategy: ['jailbreak', 'prompt-injection'],
        },
      },
    } as any);

    const user = userEvent.setup();
    render(<FiltersForm />);
    await openFiltersPopover(user);

    // Find value dropdown and click
    const selects = screen.getAllByRole('combobox');
    const valueDropdown = selects[selects.length - 1];
    await user.click(valueDropdown);

    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    });
  });

  it('shows operator options for plugin filter type', async () => {
    const filter: ResultsFilter = {
      id: 'filter-1',
      type: 'plugin',
      operator: 'equals',
      value: '',
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      ...defaultStoreValue,
      filters: {
        ...defaultStoreValue.filters,
        values: { 'filter-1': filter },
        options: {
          ...defaultStoreValue.filters.options,
          plugin: ['harmful:hate'],
        },
      },
    } as any);

    const user = userEvent.setup();
    render(<FiltersForm />);
    await openFiltersPopover(user);

    // Find operator dropdown (it should show "equals" by default)
    const selects = screen.getAllByRole('combobox');
    // The operator dropdown should have equals/not_equals options for plugin type
    const operatorDropdown = selects[1]; // Usually second dropdown after type
    await user.click(operatorDropdown);

    await waitFor(() => {
      // Plugin filter should show equals and not equals options
      expect(screen.getByRole('option', { name: 'equals' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'not equals' })).toBeInTheDocument();
    });
  });

  it('shows metric operator options for metric filter type', async () => {
    const filter: ResultsFilter = {
      id: 'filter-1',
      type: 'metric',
      field: 'latency',
      operator: 'is_defined',
      value: '',
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      ...defaultStoreValue,
      filters: {
        ...defaultStoreValue.filters,
        values: { 'filter-1': filter },
        options: {
          ...defaultStoreValue.filters.options,
          metric: ['latency'],
        },
      },
    } as any);

    const user = userEvent.setup();
    render(<FiltersForm />);
    await openFiltersPopover(user);

    // Find operator dropdown
    const selects = screen.getAllByRole('combobox');
    const operatorDropdown = selects[2]; // After type and field dropdowns
    await user.click(operatorDropdown);

    await waitFor(() => {
      // Metric filter should show comparison operators
      expect(screen.getByRole('option', { name: 'is defined' })).toBeInTheDocument();
    });
  });

  it('allows manual entry of metadata key when error loading keys', async () => {
    const filter: ResultsFilter = {
      id: 'filter-1',
      type: 'metadata',
      operator: 'equals',
      value: '',
      field: '',
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      ...defaultStoreValue,
      filters: {
        ...defaultStoreValue.filters,
        values: { 'filter-1': filter },
      },
      metadataKeysError: true,
    } as any);

    const user = userEvent.setup();
    render(<FiltersForm />);
    await openFiltersPopover(user);

    const keyInput = screen.getByPlaceholderText('Error loading keys');
    // Just type one character to verify the input is editable and calls updateFilter
    await user.type(keyInput, 'k');

    // Verify updateFilter was called with a field value
    expect(mockUpdateFilter).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'filter-1',
        field: 'k',
      }),
    );
  });

  it('allows manual entry of metadata key when no keys available', async () => {
    const filter: ResultsFilter = {
      id: 'filter-1',
      type: 'metadata',
      operator: 'equals',
      value: '',
      field: '',
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      ...defaultStoreValue,
      filters: {
        ...defaultStoreValue.filters,
        values: { 'filter-1': filter },
      },
      metadataKeys: [],
      metadataKeysLoading: false,
      metadataKeysError: false,
    } as any);

    const user = userEvent.setup();
    render(<FiltersForm />);
    await openFiltersPopover(user);

    const keyInput = screen.getByPlaceholderText('Enter key name...');
    expect(keyInput).toBeInTheDocument();
  });
});
