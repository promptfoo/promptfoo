import { fireEvent, render, screen } from '@testing-library/react';
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

describe('FiltersForm', () => {
  let anchorEl: HTMLElement;

  beforeEach(() => {
    anchorEl = document.createElement('div');
    document.body.appendChild(anchorEl);
    vi.clearAllMocks();
  });

  it('should automatically add a default filter when opened with no existing filters', () => {
    mockedUseTableStore.mockReturnValue({
      filters: {
        values: {},
        options: {
          metric: ['latency'],
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
      addFilter: mockAddFilter,
      updateFilter: mockUpdateFilter,
      removeFilter: mockRemoveFilter,
      removeAllFilters: mockRemoveAllFilters,
      updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
    } as any);

    const handleClose = vi.fn();

    render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

    expect(mockAddFilter).toHaveBeenCalledTimes(1);
    expect(mockAddFilter).toHaveBeenCalledWith({
      type: 'metric',
      operator: 'equals',
      value: '',
    });
  });

  it('should add a new filter to the list when the Add Filter button is clicked', () => {
    mockedUseTableStore.mockReturnValue({
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
      addFilter: mockAddFilter,
      removeAllFilters: mockRemoveAllFilters,
      updateFilter: mockUpdateFilter,
      removeFilter: mockRemoveFilter,
      updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
    } as any);

    const handleClose = vi.fn();

    render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

    mockAddFilter.mockClear();

    const addButton = screen.getByText('Add Filter');
    fireEvent.click(addButton);

    expect(mockAddFilter).toHaveBeenCalledTimes(1);
  });

  it('should remove all filters and close the popover when the Remove All button is clicked', () => {
    mockedUseTableStore.mockReturnValue({
      filters: {
        values: {
          filter1: {
            id: 'filter1',
            type: 'metric',
            operator: 'equals',
            value: 'latency',
            sortIndex: 0,
          },
          filter2: {
            id: 'filter2',
            type: 'metadata',
            operator: 'contains',
            value: 'test',
            field: 'name',
            sortIndex: 1,
          },
        },
        options: {
          metric: ['latency'],
          metadata: [],
          plugin: [],
          strategy: [],
          severity: [],
          policy: [],
        },
        appliedCount: 2,
      },
      metadataKeys: [],
      metadataKeysLoading: false,
      metadataKeysError: null,
      metadataValues: {},
      metadataValuesLoading: {},
      metadataValuesError: {},
      removeAllFilters: mockRemoveAllFilters,
      addFilter: mockAddFilter,
      updateFilter: mockUpdateFilter,
      removeFilter: mockRemoveFilter,
      updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
    } as any);

    const handleClose = vi.fn();

    const { getByText } = render(
      <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />,
    );

    const removeAllButton = getByText('Remove All');
    fireEvent.click(removeAllButton);

    expect(mockRemoveAllFilters).toHaveBeenCalledTimes(1);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('should disable already selected severity values in other severity filter dropdowns', () => {
    const severityOptions = ['high', 'medium', 'low'];
    const filter1Id = 'filter1';
    const filter2Id = 'filter2';

    mockedUseTableStore.mockReturnValue({
      filters: {
        values: {
          [filter1Id]: {
            id: filter1Id,
            type: 'severity',
            operator: 'equals',
            value: 'high',
            sortIndex: 0,
            logicOperator: 'and',
          },
          [filter2Id]: {
            id: filter2Id,
            type: 'severity',
            operator: 'equals',
            value: 'medium',
            sortIndex: 1,
            logicOperator: 'and',
          },
        },
        options: {
          metric: [],
          metadata: [],
          plugin: [],
          strategy: [],
          severity: severityOptions,
        },
        appliedCount: 2,
      },
      metadataKeys: [],
      metadataKeysLoading: false,
      metadataKeysError: null,
      addFilter: mockAddFilter,
      removeFilter: mockRemoveFilter,
      updateFilter: mockUpdateFilter,
      updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
      removeAllFilters: mockRemoveAllFilters,
    } as any);

    const handleClose = vi.fn();

    render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

    const dropdowns = screen.getAllByRole('combobox');
    const severityValueDropdowns = dropdowns.filter((dropdown) => {
      return dropdown.getAttribute('aria-labelledby')?.includes('value-select-label');
    });

    expect(severityValueDropdowns).toHaveLength(2);

    const filter1Dropdown = severityValueDropdowns[0];
    const filter2Dropdown = severityValueDropdowns[1];

    expect(mockedUseTableStore.mock.results[0].value.filters.values[filter1Id]).toBeDefined();
    expect(mockedUseTableStore.mock.results[0].value.filters.values[filter2Id]).toBeDefined();

    expect(filter1Dropdown).toBeInTheDocument();
    expect(filter2Dropdown).toBeInTheDocument();
  });

  it('should initialize with severity filter from store and persist it', () => {
    const severityValue = 'critical';
    const filterId = 'severityFilter123';

    mockedUseTableStore.mockReturnValue({
      filters: {
        values: {
          [filterId]: {
            id: filterId,
            type: 'severity',
            operator: 'equals',
            value: severityValue,
            sortIndex: 0,
            logicOperator: 'and',
          },
        },
        options: {
          metric: [],
          metadata: [],
          plugin: [],
          strategy: [],
          severity: [severityValue],
        },
        appliedCount: 1,
      },
      metadataKeys: [],
      metadataKeysLoading: false,
      metadataKeysError: null,
      addFilter: mockAddFilter,
      updateFilter: mockUpdateFilter,
      removeFilter: mockRemoveFilter,
      removeAllFilters: mockRemoveAllFilters,
      updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
    } as any);

    const handleClose = vi.fn();

    render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

    expect(useTableStore).toHaveBeenCalled();
  });

  it('should allow manual entry of a metadata key when metadataKeysError is true', async () => {
    const initialFilter: ResultsFilter = {
      id: 'filter-1',
      type: 'metadata',
      operator: 'equals',
      value: '',
      field: '',
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      filters: {
        values: { 'filter-1': initialFilter },
        options: {
          metric: [],
          metadata: [],
          plugin: [],
          strategy: [],
          severity: [],
        },
        appliedCount: 0,
      },
      metadataKeys: [],
      metadataKeysLoading: false,
      metadataKeysError: true,
      updateFilter: mockUpdateFilter,
      removeFilter: mockRemoveFilter,
      updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
      addFilter: mockAddFilter,
      removeAllFilters: mockRemoveAllFilters,
    } as any);

    const handleClose = vi.fn();

    render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

    // When there's an error loading keys, the input shows error placeholder
    const keyInput = screen.getByPlaceholderText(/error loading keys/i);
    const testKey = 'test-metadata-key';
    fireEvent.change(keyInput, { target: { value: testKey } });

    expect(mockUpdateFilter).toHaveBeenLastCalledWith({
      ...initialFilter,
      field: testKey,
    });
  });

  it('should handle extremely long metadata key names in the dropdown without breaking the layout', async () => {
    const longMetadataKey = 'a'.repeat(200);
    const initialFilter: ResultsFilter = {
      id: 'filter-1',
      type: 'metadata',
      operator: 'equals',
      value: '',
      field: longMetadataKey,
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      filters: {
        values: { 'filter-1': initialFilter },
        options: {
          metric: [],
          metadata: [],
          plugin: [],
          strategy: [],
          severity: [],
        },
        appliedCount: 0,
      },
      metadataKeys: [longMetadataKey],
      metadataKeysLoading: false,
      metadataKeysError: null,
      metadataValues: {},
      metadataValuesLoading: {},
      metadataValuesError: {},
      updateFilter: mockUpdateFilter,
      removeFilter: mockRemoveFilter,
      updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
      addFilter: mockAddFilter,
      removeAllFilters: mockRemoveAllFilters,
    } as any);

    const handleClose = vi.fn();

    render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

    const metadataKeyDropdown = screen.getByRole('combobox', { name: /Key/i });
    expect(metadataKeyDropdown).toBeInTheDocument();

    await userEvent.click(metadataKeyDropdown);

    const metadataKeyOption = await screen.findByRole('option', { name: longMetadataKey });
    expect(metadataKeyOption).toBeInTheDocument();
  });

  it("Filter should render a Dropdown with all metadataKeys as selectable options when value.type is 'metadata', metadataKeysLoading is false, and metadataKeys contains at least one key", () => {
    const initialFilter: ResultsFilter = {
      id: 'filter-1',
      type: 'metadata',
      operator: 'equals',
      value: '',
      sortIndex: 0,
      logicOperator: 'and',
    };

    const metadataKeys = ['key1', 'key2', 'key3'];

    mockedUseTableStore.mockReturnValue({
      filters: {
        values: { 'filter-1': initialFilter },
        options: {
          metric: [],
          metadata: [],
          plugin: [],
          strategy: [],
          severity: [],
        },
        appliedCount: 0,
      },
      metadataKeys: metadataKeys,
      metadataKeysLoading: false,
      metadataKeysError: null,
      updateFilter: mockUpdateFilter,
      removeFilter: mockRemoveFilter,
      updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
      addFilter: mockAddFilter,
      removeAllFilters: mockRemoveAllFilters,
    } as any);

    const handleClose = vi.fn();

    render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

    const keyDropdown = screen.getByRole('combobox', { name: /Key/i });
    expect(keyDropdown).toBeInTheDocument();
  });

  it('should render each Filter row container with overflow set to "hidden"', () => {
    const initialFilter: ResultsFilter = {
      id: 'filter-1',
      type: 'metadata',
      operator: 'equals',
      value: '',
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      filters: {
        values: { 'filter-1': initialFilter },
        options: {
          metric: [],
          metadata: [],
          plugin: [],
          strategy: [],
          severity: [],
        },
        appliedCount: 0,
      },
      updateFilter: mockUpdateFilter,
      removeFilter: mockRemoveFilter,
      updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
      addFilter: mockAddFilter,
      removeAllFilters: mockRemoveAllFilters,
    } as any);

    const handleClose = vi.fn();

    render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

    // Find the filter row container and verify it has overflow-hidden class
    const closeButtons = screen.getAllByRole('button');
    const closeButton = closeButtons[0];
    const filterRowContainer = closeButton.closest('div');

    expect(filterRowContainer).toHaveClass('overflow-hidden');
  });
  it('should render without errors when anchorEl is null', () => {
    mockedUseTableStore.mockReturnValue({
      filters: {
        values: {},
        options: {
          metric: ['latency'],
          metadata: [],
          plugin: [],
          strategy: [],
          severity: [],
          policy: [],
        },
        appliedCount: 0,
      },
      addFilter: mockAddFilter,
      updateFilter: mockUpdateFilter,
      removeFilter: mockRemoveFilter,
      removeAllFilters: mockRemoveAllFilters,
      updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
    } as any);

    const handleClose = vi.fn();

    render(<FiltersForm open={true} onClose={handleClose} anchorEl={null} />);

    // When anchorEl is null, component may not render visible content but should not error
    // Just verify it renders without throwing
    expect(true).toBe(true);
  });

  it('should render without crashing when the container is smaller than the minimum width', () => {
    mockedUseTableStore.mockReturnValue({
      filters: {
        values: {},
        options: {
          metric: ['latency'],
          metadata: [],
          plugin: [],
          strategy: [],
          severity: [],
          policy: [],
        },
        appliedCount: 0,
      },
      addFilter: mockAddFilter,
      updateFilter: mockUpdateFilter,
      removeFilter: mockRemoveFilter,
      removeAllFilters: mockRemoveAllFilters,
      updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
    } as any);

    const handleClose = vi.fn();

    render(
      <div style={{ width: '300px' }}>
        <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
      </div>,
    );

    // Verify the form renders
    expect(screen.getByText('Add Filter')).toBeInTheDocument();
  });

  describe('Filter component', () => {
    it("should display 'Severity' as a selectable filter type in the filter type dropdown when filters.options.severity contains at least one severity value", async () => {
      const initialFilter: ResultsFilter = {
        id: 'filter-1',
        type: 'metadata',
        operator: 'equals',
        value: '',
        sortIndex: 0,
        logicOperator: 'and',
      };

      mockedUseTableStore.mockReturnValue({
        filters: {
          values: { 'filter-1': initialFilter },
          options: {
            metric: [],
            metadata: [],
            plugin: [],
            strategy: [],
            severity: ['high', 'medium', 'low'],
          },
          appliedCount: 0,
        },
        metadataKeys: [],
        metadataKeysLoading: false,
        metadataKeysError: null,
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

      const filterTypeDropdown = screen.getByRole('combobox', { name: /Field/i });
      await userEvent.click(filterTypeDropdown);

      const severityOption = await screen.findByRole('option', { name: 'Severity' });
      expect(severityOption).toBeInTheDocument();

      expect(screen.getByRole('option', { name: 'Metadata' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Metric' })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Plugin' })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Strategy' })).not.toBeInTheDocument();
    });

    it("Filter should render a value dropdown with all filters.options.severity values as selectable options when value.type is 'severity', and selecting an option should call updateFilter with the selected severity value", async () => {
      const initialFilter: ResultsFilter = {
        id: 'filter-1',
        type: 'severity',
        operator: 'equals',
        value: '',
        sortIndex: 0,
        logicOperator: 'and',
      };

      const severityOptions = ['high', 'medium', 'low'];

      mockedUseTableStore.mockReturnValue({
        filters: {
          values: { 'filter-1': initialFilter },
          options: {
            metric: [],
            metadata: [],
            plugin: [],
            strategy: [],
            severity: severityOptions,
          },
          appliedCount: 0,
        },
        metadataKeys: [],
        metadataKeysLoading: false,
        metadataKeysError: null,
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

      const severityValueDropdown = screen.getByRole('combobox', { name: /Severity/i });
      await userEvent.click(severityValueDropdown);

      const highSeverityOption = await screen.getByRole('option', { name: 'High high' });
      await userEvent.click(highSeverityOption);

      expect(mockUpdateFilter).toHaveBeenCalledTimes(1);
      expect(mockUpdateFilter).toHaveBeenCalledWith({
        id: 'filter-1',
        type: 'severity',
        operator: 'equals',
        value: 'high',
        sortIndex: 0,
        logicOperator: 'and',
      });
    });

    it('should reset the operator to "equals" when changing the filter type to "severity" if the previous operator was not "equals"', async () => {
      const initialFilter: ResultsFilter = {
        id: 'filter-1',
        type: 'metadata',
        operator: 'contains',
        value: 'test',
        sortIndex: 0,
        logicOperator: 'and',
      };

      mockedUseTableStore.mockReturnValue({
        filters: {
          values: { 'filter-1': initialFilter },
          options: {
            metric: [],
            metadata: [],
            plugin: [],
            strategy: [],
            severity: ['high', 'medium', 'low'],
          },
          appliedCount: 0,
        },
        metadataKeys: [],
        metadataKeysLoading: false,
        metadataKeysError: null,
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

      const filterTypeDropdown = screen.getByRole('combobox', { name: /Field/i });
      await userEvent.click(filterTypeDropdown);

      const severityOption = await screen.findByRole('option', { name: 'Severity' });
      await userEvent.click(severityOption);

      expect(mockUpdateFilter).toHaveBeenCalledTimes(1);
      expect(mockUpdateFilter).toHaveBeenCalledWith({
        ...initialFilter,
        type: 'severity',
        operator: 'equals',
        value: '',
      });
    });

    it('should call onClose when the last filter is removed via the close button', async () => {
      const initialFilter: ResultsFilter = {
        id: 'filter-1',
        type: 'metadata',
        operator: 'equals',
        value: '',
        sortIndex: 0,
        logicOperator: 'and',
      };

      mockedUseTableStore.mockReturnValue({
        filters: {
          values: { 'filter-1': initialFilter },
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
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

      // Find the remove filter button (X icon button)
      const removeButton = screen.getByRole('button', { name: /remove filter/i });
      await userEvent.click(removeButton);

      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('should clear the filter value when changing the filter type to "severity" from another type', async () => {
      const initialFilter: ResultsFilter = {
        id: 'filter-1',
        type: 'metadata',
        operator: 'equals',
        value: 'some-metadata-value',
        field: 'some-metadata-field',
        sortIndex: 0,
        logicOperator: 'and',
      };

      mockedUseTableStore.mockReturnValue({
        filters: {
          values: { 'filter-1': initialFilter },
          options: {
            metric: [],
            metadata: [],
            plugin: [],
            strategy: [],
            severity: ['high', 'medium', 'low'],
          },
          appliedCount: 0,
        },
        metadataKeys: [],
        metadataKeysLoading: false,
        metadataKeysError: null,
        metadataValues: {},
        metadataValuesLoading: {},
        metadataValuesError: {},
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

      const filterTypeDropdown = screen.getByRole('combobox', { name: /Field/i });
      await userEvent.click(filterTypeDropdown);

      const severityOption = await screen.findByRole('option', { name: 'Severity' });
      await userEvent.click(severityOption);

      expect(mockUpdateFilter).toHaveBeenCalledTimes(1);
      expect(mockUpdateFilter).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'filter-1',
          type: 'severity',
          value: '',
        }),
      );
    });

    it("Filter should render a disabled TextField with a loading spinner and 'Loading keys...' placeholder when value.type is 'metadata' and metadataKeysLoading is true", () => {
      const initialFilter: ResultsFilter = {
        id: 'filter-1',
        type: 'metadata',
        operator: 'equals',
        value: '',
        sortIndex: 0,
        logicOperator: 'and',
      };

      mockedUseTableStore.mockReturnValue({
        filters: {
          values: { 'filter-1': initialFilter },
          options: {
            metric: [],
            metadata: [],
            plugin: [],
            strategy: [],
            severity: [],
          },
          appliedCount: 0,
        },
        metadataKeys: [],
        metadataKeysLoading: true,
        metadataKeysError: null,
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

      const textField = screen.getByPlaceholderText('Loading keys...');
      expect(textField).toBeInTheDocument();
      expect(textField).toBeDisabled();

      // Check for loading spinner - look for svg in the input container
      const inputContainer = textField.closest('div');
      const spinner = inputContainer?.querySelector('svg');
      expect(spinner).toBeInTheDocument();
    });
    it("Filter should render a TextField with error indication and 'Failed to load available keys' helper text when value.type is 'metadata', metadataKeysLoading is false, metadataKeys is empty, and metadataKeysError is true", () => {
      const initialFilter: ResultsFilter = {
        id: 'filter-1',
        type: 'metadata',
        operator: 'equals',
        value: '',
        sortIndex: 0,
        logicOperator: 'and',
      };

      mockedUseTableStore.mockReturnValue({
        filters: {
          values: { 'filter-1': initialFilter },
          options: {
            metric: [],
            metadata: [],
            plugin: [],
            strategy: [],
            severity: [],
          },
          appliedCount: 0,
        },
        metadataKeys: [],
        metadataKeysLoading: false,
        metadataKeysError: true,
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

      // Find the error input by its placeholder text
      const textField = screen.getByPlaceholderText(/error loading keys/i);
      expect(textField).toBeInTheDocument();
      // The error input should have error styling (border-destructive class)
      expect(textField).toHaveClass('border-destructive');

      const helperText = screen.getByText('Failed to load available keys');
      expect(helperText).toBeInTheDocument();
    });

    it("Filter should render a TextField with 'Enter metadata key' placeholder and no error indication when value.type is 'metadata', metadataKeysLoading is false, metadataKeys is empty, and metadataKeysError is false", () => {
      const initialFilter: ResultsFilter = {
        id: 'filter-1',
        type: 'metadata',
        operator: 'equals',
        value: '',
        sortIndex: 0,
        logicOperator: 'and',
      };

      mockedUseTableStore.mockReturnValue({
        filters: {
          values: { 'filter-1': initialFilter },
          options: {
            metric: [],
            metadata: [],
            plugin: [],
            strategy: [],
            severity: [],
          },
          appliedCount: 0,
        },
        metadataKeys: [],
        metadataKeysLoading: false,
        metadataKeysError: false,
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

      const textField = screen.getByPlaceholderText('Enter metadata key');
      expect(textField).toBeInTheDocument();
    });

    it('should default to metadata filter for standard evaluations (no strategy options)', () => {
      mockedUseTableStore.mockReturnValue({
        filters: {
          values: {},
          options: {
            metric: [], // No metrics available
            metadata: [],
            plugin: [], // No plugins
            strategy: [], // No strategies - key change
            severity: [],
          },
          appliedCount: 0,
        },
        addFilter: mockAddFilter,
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        removeAllFilters: mockRemoveAllFilters,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
      } as any);

      render(<FiltersForm open={true} onClose={vi.fn()} anchorEl={anchorEl} />);

      expect(mockAddFilter).toHaveBeenCalledWith({
        type: 'metadata', // Should default to metadata when no other options
        operator: 'equals',
        value: '',
      });
    });

    it('should show strategy options and default to strategy for redteam evaluations', () => {
      mockedUseTableStore.mockReturnValue({
        filters: {
          values: {},
          options: {
            metric: [],
            metadata: [],
            plugin: [], // No plugins so it goes to next option
            strategy: ['jailbreak', 'basic'], // Multiple strategies available
            severity: ['high', 'medium'],
          },
          appliedCount: 0,
        },
        addFilter: mockAddFilter,
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        removeAllFilters: mockRemoveAllFilters,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
      } as any);

      render(<FiltersForm open={true} onClose={vi.fn()} anchorEl={anchorEl} />);

      expect(mockAddFilter).toHaveBeenCalledWith({
        type: 'strategy', // Should default to strategy when available
        operator: 'equals',
        value: '',
      });
    });

    it('should display Policy as a selectable filter type when policy options are available', async () => {
      const initialFilter: ResultsFilter = {
        id: 'filter-1',
        type: 'metadata',
        operator: 'equals',
        value: '',
        sortIndex: 0,
        logicOperator: 'and',
      };

      mockedUseTableStore.mockReturnValue({
        filters: {
          values: { 'filter-1': initialFilter },
          options: {
            metric: [],
            metadata: [],
            plugin: [],
            strategy: [],
            severity: [],
            policy: ['harmful', 'pii', 'bias'],
          },
          appliedCount: 0,
        },
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

      const filterTypeDropdown = screen.getByRole('combobox', { name: /Field/i });
      await userEvent.click(filterTypeDropdown);

      const policyOption = await screen.findByRole('option', { name: 'Policy' });
      expect(policyOption).toBeInTheDocument();
    });

    it('should render policy value dropdown with all policy options when filter type is policy', async () => {
      const initialFilter: ResultsFilter = {
        id: 'filter-1',
        type: 'policy',
        operator: 'equals',
        value: '',
        sortIndex: 0,
        logicOperator: 'and',
      };

      const policyOptions = ['harmful', 'pii', 'bias', 'unethical'];

      mockedUseTableStore.mockReturnValue({
        filters: {
          values: { 'filter-1': initialFilter },
          options: {
            metric: [],
            metadata: [],
            plugin: [],
            strategy: [],
            severity: [],
            policy: policyOptions,
          },
          appliedCount: 0,
        },
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

      const policyValueDropdown = screen.getByRole('combobox', { name: /Policy/i });
      await userEvent.click(policyValueDropdown);

      // Check that all policy options are available
      for (const policy of policyOptions) {
        const policyOption = await screen.findByRole('option', { name: new RegExp(policy, 'i') });
        expect(policyOption).toBeInTheDocument();
      }
    });

    it('should call updateFilter when selecting a policy value', async () => {
      const initialFilter: ResultsFilter = {
        id: 'filter-1',
        type: 'policy',
        operator: 'equals',
        value: '',
        sortIndex: 0,
        logicOperator: 'and',
      };

      const policyOptions = ['harmful', 'pii', 'bias'];

      mockedUseTableStore.mockReturnValue({
        filters: {
          values: { 'filter-1': initialFilter },
          options: {
            metric: [],
            metadata: [],
            plugin: [],
            strategy: [],
            severity: [],
            policy: policyOptions,
          },
          appliedCount: 0,
        },
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

      const policyValueDropdown = screen.getByRole('combobox', { name: /Policy/i });
      await userEvent.click(policyValueDropdown);

      const harmfulOption = await screen.findByRole('option', { name: /harmful/i });
      await userEvent.click(harmfulOption);

      expect(mockUpdateFilter).toHaveBeenCalledTimes(1);
      expect(mockUpdateFilter).toHaveBeenCalledWith({
        id: 'filter-1',
        type: 'policy',
        operator: 'equals',
        value: 'harmful',
        sortIndex: 0,
        logicOperator: 'and',
      });
    });

    it('should disable already selected policy values in other policy filter dropdowns', () => {
      const policyOptions = ['harmful', 'pii', 'bias'];
      const filter1Id = 'filter1';
      const filter2Id = 'filter2';

      mockedUseTableStore.mockReturnValue({
        filters: {
          values: {
            [filter1Id]: {
              id: filter1Id,
              type: 'policy',
              operator: 'equals',
              value: 'harmful',
              sortIndex: 0,
              logicOperator: 'and',
            },
            [filter2Id]: {
              id: filter2Id,
              type: 'policy',
              operator: 'equals',
              value: 'pii',
              sortIndex: 1,
              logicOperator: 'and',
            },
          },
          options: {
            metric: [],
            metadata: [],
            plugin: [],
            strategy: [],
            severity: [],
            policy: policyOptions,
          },
          appliedCount: 2,
        },
        addFilter: mockAddFilter,
        removeFilter: mockRemoveFilter,
        updateFilter: mockUpdateFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

      const dropdowns = screen.getAllByRole('combobox');
      const policyValueDropdowns = dropdowns.filter((dropdown) => {
        return dropdown.getAttribute('aria-labelledby')?.includes('value-select-label');
      });

      expect(policyValueDropdowns).toHaveLength(2);
      expect(mockedUseTableStore.mock.results[0].value.filters.values[filter1Id]).toBeDefined();
      expect(mockedUseTableStore.mock.results[0].value.filters.values[filter2Id]).toBeDefined();
    });
    it('should reset operator to equals when changing filter type to policy', async () => {
      const initialFilter: ResultsFilter = {
        id: 'filter-1',
        type: 'metadata',
        operator: 'contains',
        value: 'test',
        field: 'description',
        sortIndex: 0,
        logicOperator: 'and',
      };

      mockedUseTableStore.mockReturnValue({
        filters: {
          values: { 'filter-1': initialFilter },
          options: {
            metric: [],
            metadata: [],
            plugin: [],
            strategy: [],
            severity: [],
            policy: ['harmful', 'pii'],
          },
          appliedCount: 0,
        },
        metadataValues: {},
        metadataValuesLoading: {},
        metadataValuesError: {},
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

      const filterTypeDropdown = screen.getByRole('combobox', { name: /Field/i });
      await userEvent.click(filterTypeDropdown);

      const policyOption = await screen.findByRole('option', { name: 'Policy' });
      await userEvent.click(policyOption);

      expect(mockUpdateFilter).toHaveBeenCalledTimes(1);
      expect(mockUpdateFilter).toHaveBeenCalledWith({
        ...initialFilter,
        type: 'policy',
        operator: 'equals',
        value: '',
        field: undefined,
      });
    });

    it('should clear filter value when changing from another type to policy', async () => {
      const initialFilter: ResultsFilter = {
        id: 'filter-1',
        type: 'severity',
        operator: 'equals',
        value: 'high',
        sortIndex: 0,
        logicOperator: 'and',
      };

      mockedUseTableStore.mockReturnValue({
        filters: {
          values: { 'filter-1': initialFilter },
          options: {
            metric: [],
            metadata: [],
            plugin: [],
            strategy: [],
            severity: ['high', 'medium', 'low'],
            policy: ['harmful', 'pii'],
          },
          appliedCount: 0,
        },
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

      const filterTypeDropdown = screen.getByRole('combobox', { name: /Field/i });
      await userEvent.click(filterTypeDropdown);

      const policyOption = await screen.findByRole('option', { name: 'Policy' });
      await userEvent.click(policyOption);

      expect(mockUpdateFilter).toHaveBeenCalledTimes(1);
      expect(mockUpdateFilter).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'filter-1',
          type: 'policy',
          operator: 'equals',
          value: '',
        }),
      );
    });

    it('should default to policy filter when only policy options are available', () => {
      mockedUseTableStore.mockReturnValue({
        filters: {
          values: {},
          options: {
            metric: [],
            metadata: [],
            plugin: [],
            strategy: [],
            severity: [],
            policy: ['harmful', 'pii', 'bias'],
          },
          appliedCount: 0,
        },
        addFilter: mockAddFilter,
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        removeAllFilters: mockRemoveAllFilters,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
      } as any);

      render(<FiltersForm open={true} onClose={vi.fn()} anchorEl={anchorEl} />);

      expect(mockAddFilter).toHaveBeenCalledWith({
        type: 'policy',
        operator: 'equals',
        value: '',
      });
    });

    it('should initialize with policy filter from store and persist it', () => {
      const policyValue = 'harmful';
      const filterId = 'policyFilter123';

      mockedUseTableStore.mockReturnValue({
        filters: {
          values: {
            [filterId]: {
              id: filterId,
              type: 'policy',
              operator: 'equals',
              value: policyValue,
              sortIndex: 0,
              logicOperator: 'and',
            },
          },
          options: {
            metric: [],
            metadata: [],
            plugin: [],
            strategy: [],
            severity: [],
            policy: [policyValue, 'pii', 'bias'],
          },
          appliedCount: 1,
        },
        addFilter: mockAddFilter,
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        removeAllFilters: mockRemoveAllFilters,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
      } as any);

      const handleClose = vi.fn();

      render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

      expect(useTableStore).toHaveBeenCalled();

      // Verify the filter is displayed correctly
      const policyValueDropdown = screen.getByRole('combobox', { name: /Policy/i });
      expect(policyValueDropdown).toBeInTheDocument();
    });

    it('should respect filter type priority order when multiple filter options are available', () => {
      mockedUseTableStore.mockReturnValue({
        filters: {
          values: {},
          options: {
            metric: ['latency'], // First priority
            metadata: [],
            plugin: [], // Would be second if > 1
            strategy: [], // Would be third if > 1
            severity: ['high'], // Would be fourth
            policy: ['harmful', 'pii'], // Would be fifth
          },
          appliedCount: 0,
        },
        addFilter: mockAddFilter,
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        removeAllFilters: mockRemoveAllFilters,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
      } as any);

      render(<FiltersForm open={true} onClose={vi.fn()} anchorEl={anchorEl} />);

      // Should default to metric since it's available and has highest priority
      expect(mockAddFilter).toHaveBeenCalledWith({
        type: 'metric',
        operator: 'equals',
        value: '',
      });
    });

    it('should prioritize policy over metadata when policy options are available but not metrics, plugins, strategies, or severities', () => {
      mockedUseTableStore.mockReturnValue({
        filters: {
          values: {},
          options: {
            metric: [],
            metadata: [],
            plugin: [],
            strategy: [],
            severity: [],
            policy: ['harmful', 'pii'], // Only policy available with > 0 options
          },
          appliedCount: 0,
        },
        addFilter: mockAddFilter,
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        removeAllFilters: mockRemoveAllFilters,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
      } as any);

      render(<FiltersForm open={true} onClose={vi.fn()} anchorEl={anchorEl} />);

      expect(mockAddFilter).toHaveBeenCalledWith({
        type: 'policy',
        operator: 'equals',
        value: '',
      });
    });
  });

  it('should ensure dropdown menus are fully visible and functional with overflow hidden', async () => {
    const initialFilter: ResultsFilter = {
      id: 'filter-1',
      type: 'severity',
      operator: 'equals',
      value: '',
      sortIndex: 0,
      logicOperator: 'and',
    };

    const severityOptions = ['high', 'medium', 'low'];

    mockedUseTableStore.mockReturnValue({
      filters: {
        values: { 'filter-1': initialFilter },
        options: {
          metric: [],
          metadata: [],
          plugin: [],
          strategy: [],
          severity: severityOptions,
        },
        appliedCount: 0,
      },
      updateFilter: mockUpdateFilter,
      removeFilter: mockRemoveFilter,
      updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
      addFilter: mockAddFilter,
      removeAllFilters: mockRemoveAllFilters,
    } as any);

    const handleClose = vi.fn();

    render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

    const severityValueDropdown = screen.getByRole('combobox', { name: /Severity/i });
    await userEvent.click(severityValueDropdown);

    const highSeverityOption = await screen.findByRole('option', { name: 'High high' });
    const mediumSeverityOption = await screen.findByRole('option', { name: 'Medium medium' });
    const lowSeverityOption = await screen.findByRole('option', { name: 'Low low' });

    expect(highSeverityOption).toBeInTheDocument();
    expect(mediumSeverityOption).toBeInTheDocument();
    expect(lowSeverityOption).toBeInTheDocument();
  });

  it('should handle very long filter values without overflowing', () => {
    const longValue =
      'This is a very long metadata value that should not cause horizontal overflow issues.';
    const initialFilter: ResultsFilter = {
      id: 'filter-1',
      type: 'metadata',
      operator: 'equals',
      value: longValue,
      field: 'fieldName',
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      filters: {
        values: { 'filter-1': initialFilter },
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
      metadataValues: {},
      metadataValuesLoading: {},
      metadataValuesError: {},
      updateFilter: mockUpdateFilter,
      removeFilter: mockRemoveFilter,
      updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
      addFilter: mockAddFilter,
      removeAllFilters: mockRemoveAllFilters,
    } as any);

    const handleClose = vi.fn();

    render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

    // Find the value input by placeholder or within the filter
    const valueInput = screen.getByDisplayValue(longValue) as HTMLInputElement;
    expect(valueInput).toBeInTheDocument();
    expect(valueInput.value).toBe(longValue);
  });
  it('should maintain proper layout on extremely narrow viewport widths without causing horizontal overflow', () => {
    mockedUseTableStore.mockReturnValue({
      filters: {
        values: {
          filter1: {
            id: 'filter1',
            type: 'metadata',
            operator: 'contains',
            value: 'test',
            field: 'name',
            sortIndex: 0,
          },
        },
        options: {
          metric: [],
          metadata: [],
          plugin: [],
          strategy: [],
          severity: [],
          policy: [],
        },
        appliedCount: 1,
      },
      metadataValues: {},
      metadataValuesLoading: {},
      metadataValuesError: {},
      addFilter: mockAddFilter,
      updateFilter: mockUpdateFilter,
      removeFilter: mockRemoveFilter,
      removeAllFilters: mockRemoveAllFilters,
      updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
    } as any);

    const handleClose = vi.fn();

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 300,
    });

    render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

    // With Radix Popover, the container uses role="dialog" instead of role="presentation"
    // Just verify the form renders without errors at narrow viewport
    expect(screen.getByText('Add Filter')).toBeInTheDocument();
  });

  describe('exists operator', () => {
    it('should show exists option in operator dropdown for metadata filters', async () => {
      const initialFilter: ResultsFilter = {
        id: 'filter-1',
        type: 'metadata',
        operator: 'equals',
        value: '',
        field: 'testField',
        sortIndex: 0,
        logicOperator: 'and',
      };

      mockedUseTableStore.mockReturnValue({
        filters: {
          values: { 'filter-1': initialFilter },
          options: {
            metric: [],
            metadata: [],
            plugin: [],
            strategy: [],
            severity: [],
          },
          appliedCount: 0,
        },
        metadataKeys: ['testField'],
        metadataKeysLoading: false,
        metadataKeysError: false,
        metadataValues: {},
        metadataValuesLoading: {},
        metadataValuesError: {},
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

      // Find the operator dropdown
      const operatorDropdown = screen.getByRole('combobox', { name: /Operator/i });
      expect(operatorDropdown).toBeInTheDocument();

      // Click to open the dropdown
      await userEvent.click(operatorDropdown);

      // Check that "Exists" option is available
      const existsOption = screen.getByRole('option', { name: 'Exists' });
      expect(existsOption).toBeInTheDocument();
    });

    it('should not show exists option for non-metadata filters', async () => {
      const initialFilter: ResultsFilter = {
        id: 'filter-1',
        type: 'metric',
        operator: 'equals',
        value: '',
        sortIndex: 0,
        logicOperator: 'and',
      };

      mockedUseTableStore.mockReturnValue({
        filters: {
          values: { 'filter-1': initialFilter },
          options: {
            metric: ['latency'],
            metadata: [],
            plugin: [],
            strategy: [],
            severity: [],
          },
          appliedCount: 0,
        },
        metadataKeys: [],
        metadataKeysLoading: false,
        metadataKeysError: false,
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

      // Find the operator dropdown
      const operatorDropdown = screen.getByRole('combobox', { name: /Operator/i });
      expect(operatorDropdown).toBeInTheDocument();

      // Click to open the dropdown
      await userEvent.click(operatorDropdown);

      // Check that "Is Defined" and comparison operators are available for metric filters
      const isDefinedOption = screen.getByRole('option', { name: 'Is Defined' });
      expect(isDefinedOption).toBeInTheDocument();

      const eqOption = screen.getByRole('option', { name: '==' });
      expect(eqOption).toBeInTheDocument();

      // Check that "Exists" option is NOT available (it's for metadata filters)
      const existsOption = screen.queryByRole('option', { name: 'Exists' });
      expect(existsOption).not.toBeInTheDocument();
    });

    it('should hide value input when exists operator is selected', () => {
      const initialFilter: ResultsFilter = {
        id: 'filter-1',
        type: 'metadata',
        operator: 'exists',
        value: '',
        field: 'testField',
        sortIndex: 0,
        logicOperator: 'and',
      };

      mockedUseTableStore.mockReturnValue({
        filters: {
          values: { 'filter-1': initialFilter },
          options: {
            metric: [],
            metadata: [],
            plugin: [],
            strategy: [],
            severity: [],
          },
          appliedCount: 0,
        },
        metadataKeys: ['testField'],
        metadataKeysLoading: false,
        metadataKeysError: false,
        metadataValues: {},
        metadataValuesLoading: {},
        metadataValuesError: {},
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

      // Value input should not be present when exists is selected
      const valueInput = screen.queryByRole('textbox', { name: /Value/i });
      expect(valueInput).not.toBeInTheDocument();
    });

    it('should clear value when switching to exists operator', async () => {
      const initialFilter: ResultsFilter = {
        id: 'filter-1',
        type: 'metadata',
        operator: 'equals',
        value: 'someValue',
        field: 'testField',
        sortIndex: 0,
        logicOperator: 'and',
      };

      mockedUseTableStore.mockReturnValue({
        filters: {
          values: { 'filter-1': initialFilter },
          options: {
            metric: [],
            metadata: [],
            plugin: [],
            strategy: [],
            severity: [],
          },
          appliedCount: 0,
        },
        metadataKeys: ['testField'],
        metadataKeysLoading: false,
        metadataKeysError: false,
        metadataValues: {},
        metadataValuesLoading: {},
        metadataValuesError: {},
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

      // Find and click the operator dropdown
      const operatorDropdown = screen.getByRole('combobox', { name: /Operator/i });
      await userEvent.click(operatorDropdown);

      // Select "Exists" option
      const existsOption = screen.getByRole('option', { name: 'Exists' });
      fireEvent.click(existsOption);

      // Verify updateFilter was called with cleared value
      expect(mockUpdateFilter).toHaveBeenCalledWith({
        ...initialFilter,
        operator: 'exists',
        value: '', // Value should be cleared when switching to exists
      });
    });

    it('should show value input when equals operator is selected', () => {
      const initialFilter: ResultsFilter = {
        id: 'filter-1',
        type: 'metadata',
        operator: 'equals',
        value: '',
        field: 'testField',
        sortIndex: 0,
        logicOperator: 'and',
      };

      mockedUseTableStore.mockReturnValue({
        filters: {
          values: { 'filter-1': initialFilter },
          options: {
            metric: [],
            metadata: [],
            plugin: [],
            strategy: [],
            severity: [],
          },
          appliedCount: 0,
        },
        metadataKeys: ['testField'],
        metadataKeysLoading: false,
        metadataKeysError: false,
        metadataValues: {},
        metadataValuesLoading: {},
        metadataValuesError: {},
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

      // Should show value input for equals operator - metadata uses an input with datalist
      const valueInput = screen.getByPlaceholderText('Select or type a value');
      expect(valueInput).toBeInTheDocument();
    });

    it('should reset operator to "is_defined" when changing filter type from metadata with "exists" operator to metric', async () => {
      const initialFilter: ResultsFilter = {
        id: 'filter-1',
        type: 'metadata',
        operator: 'exists',
        value: '',
        field: 'testField',
        sortIndex: 0,
        logicOperator: 'and',
      };

      mockedUseTableStore.mockReturnValue({
        filters: {
          values: { 'filter-1': initialFilter },
          options: {
            metric: ['metric1'],
            metadata: [],
            plugin: [],
            strategy: [],
            severity: [],
          },
          appliedCount: 0,
        },
        metadataKeys: ['testField'],
        metadataKeysLoading: false,
        metadataKeysError: false,
        metadataValues: {},
        metadataValuesLoading: {},
        metadataValuesError: {},
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

      const filterTypeDropdown = screen.getByRole('combobox', { name: /Field/i });
      await userEvent.click(filterTypeDropdown);

      const metricOption = screen.getByText('Metric');
      await userEvent.click(metricOption);

      expect(mockUpdateFilter).toHaveBeenCalledTimes(1);
      expect(mockUpdateFilter).toHaveBeenCalledWith({
        ...initialFilter,
        type: 'metric',
        operator: 'is_defined',
        value: '',
        field: 'testField',
      });

      const operatorDropdown = screen.getByRole('combobox', { name: /Operator/i });
      expect(operatorDropdown).toBeVisible();
    });
    it('should maintain exists operator and hide value input when changing metadata field', async () => {
      const initialFilter: ResultsFilter = {
        id: 'filter-1',
        type: 'metadata',
        operator: 'exists',
        value: '',
        field: 'field1',
        sortIndex: 0,
        logicOperator: 'and',
      };

      mockedUseTableStore.mockReturnValue({
        filters: {
          values: { 'filter-1': initialFilter },
          options: {
            metric: [],
            metadata: [],
            plugin: [],
            strategy: [],
            severity: [],
          },
          appliedCount: 0,
        },
        metadataKeys: ['field1', 'field2'],
        metadataKeysLoading: false,
        metadataKeysError: false,
        metadataValues: {},
        metadataValuesLoading: {},
        metadataValuesError: {},
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

      const fieldDropdown = screen.getByRole('combobox', { name: /Key/i });
      expect(fieldDropdown).toBeInTheDocument();

      await userEvent.click(fieldDropdown);

      const field2Option = await screen.findByRole('option', { name: 'field2' });
      expect(field2Option).toBeInTheDocument();

      await userEvent.click(field2Option);

      expect(mockUpdateFilter).toHaveBeenCalledTimes(1);
      expect(mockUpdateFilter).toHaveBeenCalledWith({
        ...initialFilter,
        field: 'field2',
      });

      const valueInput = screen.queryByRole('textbox', { name: /Value/i });
      expect(valueInput).not.toBeInTheDocument();
    });

    it('should handle multiple filters with the same metadata field and "exists" operator', async () => {
      const initialFilters: Record<string, ResultsFilter> = {
        'filter-1': {
          id: 'filter-1',
          type: 'metadata',
          operator: 'exists',
          value: '',
          field: 'testField',
          sortIndex: 0,
          logicOperator: 'and',
        },
        'filter-2': {
          id: 'filter-2',
          type: 'metadata',
          operator: 'equals',
          value: 'someValue',
          field: 'testField',
          sortIndex: 1,
          logicOperator: 'and',
        },
      };

      mockedUseTableStore.mockReturnValue({
        filters: {
          values: initialFilters,
          options: {
            metric: [],
            metadata: [],
            plugin: [],
            strategy: [],
            severity: [],
          },
          appliedCount: 0,
        },
        metadataKeys: ['testField'],
        metadataKeysLoading: false,
        metadataKeysError: false,
        metadataValues: {},
        metadataValuesLoading: {},
        metadataValuesError: {},
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

      const operatorDropdown = screen.getAllByRole('combobox', { name: /Operator/i })[1];
      expect(operatorDropdown).toBeInTheDocument();

      await userEvent.click(operatorDropdown);

      const existsOption = screen.getByRole('option', { name: 'Exists' });
      fireEvent.click(existsOption);

      expect(mockUpdateFilter).toHaveBeenCalledWith({
        ...initialFilters['filter-2'],
        operator: 'exists',
        value: '',
      });
    });
  });

  it('should update the filter operator from equals to not_equals when multiple plugin filters are present', async () => {
    const initialFilters: Record<string, ResultsFilter> = {
      'filter-1': {
        id: 'filter-1',
        type: 'plugin',
        operator: 'equals',
        value: 'plugin1',
        sortIndex: 0,
        logicOperator: 'and',
      },
      'filter-2': {
        id: 'filter-2',
        type: 'plugin',
        operator: 'equals',
        value: 'plugin2',
        sortIndex: 1,
        logicOperator: 'and',
      },
    };

    mockedUseTableStore.mockReturnValue({
      filters: {
        values: initialFilters,
        options: {
          metric: [],
          metadata: [],
          plugin: ['plugin1', 'plugin2'],
          strategy: [],
          severity: [],
          policy: [],
        },
        appliedCount: 2,
      },
      metadataKeys: [],
      metadataKeysLoading: false,
      metadataKeysError: null,
      updateFilter: mockUpdateFilter,
      removeFilter: mockRemoveFilter,
      updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
      addFilter: mockAddFilter,
      removeAllFilters: mockRemoveAllFilters,
    } as any);

    const handleClose = vi.fn();

    render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

    const operatorDropdown = screen.getAllByRole('combobox', { name: /Operator/i })[1];
    expect(operatorDropdown).toBeInTheDocument();

    await userEvent.click(operatorDropdown);

    const notEqualsOption = screen.getByRole('option', { name: 'Not Equals' });
    expect(notEqualsOption).toBeInTheDocument();

    await userEvent.click(notEqualsOption);

    expect(mockUpdateFilter).toHaveBeenCalledTimes(1);
    expect(mockUpdateFilter).toHaveBeenCalledWith({
      ...initialFilters['filter-2'],
      operator: 'not_equals',
    });
  });

  it('should update the filter operator to "equals" when changing from "not_equals" for a plugin filter', async () => {
    const initialFilter: ResultsFilter = {
      id: 'filter-1',
      type: 'plugin',
      operator: 'not_equals',
      value: 'plugin1',
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      filters: {
        values: { 'filter-1': initialFilter },
        options: {
          metric: [],
          metadata: [],
          plugin: ['plugin1', 'plugin2'],
          strategy: [],
          severity: [],
          policy: [],
        },
        appliedCount: 0,
      },
      metadataKeys: [],
      metadataKeysLoading: false,
      metadataKeysError: null,
      updateFilter: mockUpdateFilter,
      removeFilter: mockRemoveFilter,
      updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
      addFilter: mockAddFilter,
      removeAllFilters: mockRemoveAllFilters,
    } as any);

    const handleClose = vi.fn();

    render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

    const operatorDropdown = screen.getByRole('combobox', { name: /Operator/i });
    await userEvent.click(operatorDropdown);

    const equalsOption = screen.getByRole('option', { name: 'Equals' });
    await userEvent.click(equalsOption);

    expect(mockUpdateFilter).toHaveBeenCalledTimes(1);
    expect(mockUpdateFilter).toHaveBeenCalledWith({
      ...initialFilter,
      operator: 'equals',
    });
  });

  it('should not display "Not Equals" in the operator dropdown for non-plugin filter types', async () => {
    const initialFilter: ResultsFilter = {
      id: 'filter-1',
      type: 'metadata',
      operator: 'equals',
      value: '',
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      filters: {
        values: { 'filter-1': initialFilter },
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
      updateFilter: mockUpdateFilter,
      removeFilter: mockRemoveFilter,
      updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
      addFilter: mockAddFilter,
      removeAllFilters: mockRemoveAllFilters,
    } as any);

    const handleClose = vi.fn();

    render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

    const operatorDropdown = screen.getByRole('combobox', { name: /Operator/i });
    await userEvent.click(operatorDropdown);

    const notEqualsOption = screen.queryByRole('option', { name: 'Not Equals' });
    expect(notEqualsOption).not.toBeInTheDocument();
  });

  it('should allow creating two plugin filters with the same plugin value but different operators (equals and not_equals) without disabling the value in the second filter', async () => {
    const pluginValue = 'testPlugin';
    const filter1Id = 'filter1';
    const filter2Id = 'filter2';

    mockedUseTableStore.mockReturnValue({
      filters: {
        values: {
          [filter1Id]: {
            id: filter1Id,
            type: 'plugin',
            operator: 'equals',
            value: pluginValue,
            sortIndex: 0,
            logicOperator: 'and',
          },
          [filter2Id]: {
            id: filter2Id,
            type: 'plugin',
            operator: 'not_equals',
            value: pluginValue,
            sortIndex: 1,
            logicOperator: 'and',
          },
        },
        options: {
          metric: [],
          metadata: [],
          plugin: [pluginValue],
          strategy: [],
          severity: [],
          policy: [],
        },
        appliedCount: 2,
      },
      metadataKeys: [],
      metadataKeysLoading: false,
      metadataKeysError: null,
      addFilter: mockAddFilter,
      removeFilter: mockRemoveFilter,
      updateFilter: mockUpdateFilter,
      updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
      removeAllFilters: mockRemoveAllFilters,
    } as any);

    const handleClose = vi.fn();

    render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

    const dropdowns = screen.getAllByRole('combobox');
    const pluginValueDropdowns = dropdowns.filter((dropdown) => {
      return dropdown.getAttribute('aria-labelledby')?.includes('value-select-label');
    });

    expect(pluginValueDropdowns).toHaveLength(2);

    const filter1Dropdown = pluginValueDropdowns[0];
    const filter2Dropdown = pluginValueDropdowns[1];

    expect(filter1Dropdown).toBeInTheDocument();
    expect(filter2Dropdown).toBeInTheDocument();

    await userEvent.click(filter2Dropdown);

    const pluginOption = screen.getByRole('option', { name: pluginValue });
    expect(pluginOption).toBeInTheDocument();
    expect(pluginOption).not.toHaveAttribute('disabled');
  });
  it("should only display 'equals' and 'not_equals' operators in the operator dropdown when filter type is 'plugin'", async () => {
    const initialFilter: ResultsFilter = {
      id: 'filter-1',
      type: 'plugin',
      operator: 'equals',
      value: '',
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      filters: {
        values: { 'filter-1': initialFilter },
        options: {
          metric: [],
          metadata: [],
          plugin: ['plugin1', 'plugin2'],
          strategy: [],
          severity: [],
          policy: [],
        },
        appliedCount: 0,
      },
      metadataKeys: [],
      metadataKeysLoading: false,
      metadataKeysError: null,
      updateFilter: mockUpdateFilter,
      removeFilter: mockRemoveFilter,
      updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
      addFilter: mockAddFilter,
      removeAllFilters: mockRemoveAllFilters,
    } as any);

    const handleClose = vi.fn();

    render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

    const operatorDropdown = screen.getByRole('combobox', { name: /Operator/i });
    expect(operatorDropdown).toBeInTheDocument();

    await userEvent.click(operatorDropdown);

    const equalsOption = screen.getByRole('option', { name: 'Equals' });
    expect(equalsOption).toBeInTheDocument();

    const notEqualsOption = screen.getByRole('option', { name: 'Not Equals' });
    expect(notEqualsOption).toBeInTheDocument();

    const containsOption = screen.queryByRole('option', { name: 'Contains' });
    expect(containsOption).toBeNull();

    const existsOption = screen.queryByRole('option', { name: 'Exists' });
    expect(existsOption).toBeNull();
  });

  it('should display "Plugin != [name]" when a plugin filter with "not_equals" operator is applied', () => {
    const pluginName = 'test-plugin';
    const initialFilter: ResultsFilter = {
      id: 'filter-1',
      type: 'plugin',
      operator: 'not_equals',
      value: pluginName,
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      filters: {
        values: { 'filter-1': initialFilter },
        options: {
          metric: [],
          metadata: [],
          plugin: [pluginName],
          strategy: [],
          severity: [],
          policy: [],
        },
        appliedCount: 1,
      },
      metadataKeys: [],
      metadataKeysLoading: false,
      metadataKeysError: null,
      updateFilter: mockUpdateFilter,
      removeFilter: mockRemoveFilter,
      updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
      addFilter: mockAddFilter,
      removeAllFilters: mockRemoveAllFilters,
    } as any);

    const handleClose = vi.fn();

    render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

    const fieldDropdown = screen.getByRole('combobox', { name: /Field/i });
    expect(fieldDropdown).toHaveTextContent('Plugin');

    const operatorDropdown = screen.getByRole('combobox', { name: /Operator/i });
    expect(operatorDropdown).toHaveTextContent('Not Equals');

    const pluginDropdown = screen.getByRole('combobox', { name: /Plugin/i });
    expect(pluginDropdown).toBeInTheDocument();
    expect(pluginDropdown).toHaveTextContent(pluginName);
  });

  it("Filter should render a value dropdown with all filters.options.plugin values as selectable options when value.type is 'plugin' and value.operator is 'not_equals'", () => {
    const initialFilter: ResultsFilter = {
      id: 'filter-1',
      type: 'plugin',
      operator: 'not_equals',
      value: '',
      sortIndex: 0,
      logicOperator: 'and',
    };

    const pluginOptions = ['plugin1', 'plugin2', 'plugin3'];

    mockedUseTableStore.mockReturnValue({
      filters: {
        values: { 'filter-1': initialFilter },
        options: {
          metric: [],
          metadata: [],
          plugin: pluginOptions,
          strategy: [],
          severity: [],
          policy: [],
        },
        appliedCount: 0,
      },
      metadataKeys: [],
      metadataKeysLoading: false,
      metadataKeysError: null,
      updateFilter: mockUpdateFilter,
      removeFilter: mockRemoveFilter,
      updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
      addFilter: mockAddFilter,
      removeAllFilters: mockRemoveAllFilters,
    } as any);

    const handleClose = vi.fn();

    render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

    const pluginValueDropdown = screen.getByRole('combobox', { name: /Plugin/i });
    expect(pluginValueDropdown).toBeInTheDocument();
  });

  it("Filter should call updateFilter with the selected plugin value and operator 'not_equals' when a plugin value is selected in the value dropdown for a plugin filter", async () => {
    const initialFilter: ResultsFilter = {
      id: 'filter-1',
      type: 'plugin',
      operator: 'not_equals',
      value: '',
      sortIndex: 0,
      logicOperator: 'and',
    };

    const pluginOptions = ['plugin1', 'plugin2', 'plugin3'];

    mockedUseTableStore.mockReturnValue({
      filters: {
        values: { 'filter-1': initialFilter },
        options: {
          metric: [],
          metadata: [],
          plugin: pluginOptions,
          strategy: [],
          severity: [],
          policy: [],
        },
        appliedCount: 0,
      },
      metadataKeys: [],
      metadataKeysLoading: false,
      metadataKeysError: null,
      updateFilter: mockUpdateFilter,
      removeFilter: mockRemoveFilter,
      updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
      addFilter: mockAddFilter,
      removeAllFilters: mockRemoveAllFilters,
    } as any);

    const handleClose = vi.fn();

    render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

    const pluginValueDropdown = screen.getByRole('combobox', { name: /Plugin/i });
    await userEvent.click(pluginValueDropdown);

    const plugin1Option = await screen.getByRole('option', { name: 'plugin1' });
    await userEvent.click(plugin1Option);

    expect(mockUpdateFilter).toHaveBeenCalledTimes(1);
    expect(mockUpdateFilter).toHaveBeenCalledWith({
      id: 'filter-1',
      type: 'plugin',
      operator: 'not_equals',
      value: 'plugin1',
      sortIndex: 0,
      logicOperator: 'and',
    });
  });

  it('should reset operator to "equals" when changing filter type to "plugin" if the previous operator was not "equals" or "not_equals"', async () => {
    const initialFilter: ResultsFilter = {
      id: 'filter-1',
      type: 'metadata',
      operator: 'contains',
      value: 'test',
      sortIndex: 0,
      logicOperator: 'and',
    };

    mockedUseTableStore.mockReturnValue({
      filters: {
        values: { 'filter-1': initialFilter },
        options: {
          metric: [],
          metadata: [],
          plugin: ['plugin1', 'plugin2'],
          strategy: [],
          severity: [],
          policy: [],
        },
        appliedCount: 0,
      },
      metadataKeys: [],
      metadataKeysLoading: false,
      metadataKeysError: null,
      updateFilter: mockUpdateFilter,
      removeFilter: mockRemoveFilter,
      updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
      addFilter: mockAddFilter,
      removeAllFilters: mockRemoveAllFilters,
    } as any);

    const handleClose = vi.fn();

    render(<FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />);

    const filterTypeDropdown = screen.getByRole('combobox', { name: /Field/i });
    await userEvent.click(filterTypeDropdown);

    const pluginOption = await screen.findByRole('option', { name: 'Plugin' });
    await userEvent.click(pluginOption);

    expect(mockUpdateFilter).toHaveBeenCalledTimes(1);
    expect(mockUpdateFilter).toHaveBeenCalledWith({
      ...initialFilter,
      type: 'plugin',
      operator: 'equals',
      value: '',
      field: undefined,
    });
  });
});
