import { ThemeProvider, createTheme } from '@mui/material/styles';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import FiltersForm from './FiltersForm';
import { useTableStore, type ResultsFilter } from '../store';
import { Box } from '@mui/material';

vi.mock('../store', () => ({
  useTableStore: vi.fn(),
}));

const mockedUseTableStore = vi.mocked(useTableStore);

const mockUpdateFilter = vi.fn();
const mockRemoveFilter = vi.fn();
const mockUpdateAllFilterLogicOperators = vi.fn();
const mockAddFilter = vi.fn();
const mockRemoveAllFilters = vi.fn();

const WithTheme = ({ children }: { children: React.ReactNode }) => {
  const theme = createTheme();
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
};

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

    render(
      <WithTheme>
        <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
      </WithTheme>,
    );

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

    render(
      <WithTheme>
        <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
      </WithTheme>,
    );

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
        },
        appliedCount: 2,
      },
      metadataKeys: [],
      metadataKeysLoading: false,
      metadataKeysError: null,
      removeAllFilters: mockRemoveAllFilters,
      addFilter: mockAddFilter,
      updateFilter: mockUpdateFilter,
      removeFilter: mockRemoveFilter,
      updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
    } as any);

    const handleClose = vi.fn();

    const { getByText } = render(
      <WithTheme>
        <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
      </WithTheme>,
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

    render(
      <WithTheme>
        <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
      </WithTheme>,
    );

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

    render(
      <WithTheme>
        <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
      </WithTheme>,
    );

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

    render(
      <WithTheme>
        <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
      </WithTheme>,
    );

    const keyInput = screen.getByLabelText('Key');
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
      updateFilter: mockUpdateFilter,
      removeFilter: mockRemoveFilter,
      updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
      addFilter: mockAddFilter,
      removeAllFilters: mockRemoveAllFilters,
    } as any);

    const handleClose = vi.fn();

    render(
      <WithTheme>
        <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
      </WithTheme>,
    );

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

    render(
      <WithTheme>
        <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
      </WithTheme>,
    );

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

    render(
      <WithTheme>
        <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
      </WithTheme>,
    );

    const closeButtons = screen.getAllByRole('button');
    const closeButton = closeButtons[0];
    const filterRowContainer = closeButton.closest('div');

    expect(filterRowContainer).toHaveStyle('overflow: hidden');
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
      <WithTheme>
        <FiltersForm open={true} onClose={handleClose} anchorEl={null} />
      </WithTheme>,
    );

    expect(screen.getByRole('presentation')).toBeInTheDocument();
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
      <WithTheme>
        <Box width="300px">
          <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
        </Box>
      </WithTheme>,
    );

    expect(screen.getByRole('presentation')).toBeInTheDocument();
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

      render(
        <WithTheme>
          <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
        </WithTheme>,
      );

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

      render(
        <WithTheme>
          <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
        </WithTheme>,
      );

      const severityValueDropdown = screen.getByRole('combobox', { name: /Severity/i });
      await userEvent.click(severityValueDropdown);

      const highSeverityOption = await screen.getByRole('option', { name: 'high' });
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

      render(
        <WithTheme>
          <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
        </WithTheme>,
      );

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

      render(
        <WithTheme>
          <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
        </WithTheme>,
      );

      const closeIcon = screen.getByTestId('CloseIcon');
      const closeButton = closeIcon.closest('button');

      if (closeButton) {
        await userEvent.click(closeButton);
      }

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
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(
        <WithTheme>
          <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
        </WithTheme>,
      );

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

      render(
        <WithTheme>
          <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
        </WithTheme>,
      );

      const textField = screen.getByPlaceholderText('Loading keys...');
      expect(textField).toBeInTheDocument();
      expect(textField).toBeDisabled();

      const circularProgress = textField
        .closest('.MuiInputBase-root')
        ?.querySelector('.MuiCircularProgress-root');
      expect(circularProgress).toBeInTheDocument();
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

      render(
        <WithTheme>
          <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
        </WithTheme>,
      );

      const textField = screen.getByRole('textbox', { name: /Key/i });
      expect(textField).toBeInTheDocument();
      expect(textField).toHaveAttribute('aria-invalid', 'true');

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

      render(
        <WithTheme>
          <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
        </WithTheme>,
      );

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

      render(
        <WithTheme>
          <FiltersForm open={true} onClose={vi.fn()} anchorEl={anchorEl} />
        </WithTheme>,
      );

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

      render(
        <WithTheme>
          <FiltersForm open={true} onClose={vi.fn()} anchorEl={anchorEl} />
        </WithTheme>,
      );

      expect(mockAddFilter).toHaveBeenCalledWith({
        type: 'strategy', // Should default to strategy when available
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

    render(
      <WithTheme>
        <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
      </WithTheme>,
    );

    const severityValueDropdown = screen.getByRole('combobox', { name: /Severity/i });
    await userEvent.click(severityValueDropdown);

    const highSeverityOption = await screen.findByRole('option', { name: 'high' });
    const mediumSeverityOption = await screen.findByRole('option', { name: 'medium' });
    const lowSeverityOption = await screen.findByRole('option', { name: 'low' });

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

    render(
      <WithTheme>
        <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
      </WithTheme>,
    );

    const valueInput = screen.getByLabelText('Value') as HTMLInputElement;
    expect(valueInput).toBeInTheDocument();
    expect(valueInput.value).toBe(longValue);

    const filterContainer = valueInput.closest('.MuiBox-root');
    expect(filterContainer).toBeInTheDocument();

    if (filterContainer) {
      expect((filterContainer as HTMLElement).scrollWidth).toBeLessThanOrEqual(
        (filterContainer as HTMLElement).offsetWidth,
      );
    }
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

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 300,
    });

    render(
      <WithTheme>
        <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
      </WithTheme>,
    );

    const filterFormContainer =
      document.querySelector('[role="presentation"]') || document.querySelector('.MuiPopover-root');

    expect(filterFormContainer).toBeInTheDocument();

    if (filterFormContainer) {
      expect((filterFormContainer as HTMLElement).scrollWidth).toBeLessThanOrEqual(
        (filterFormContainer as HTMLElement).offsetWidth,
      );
    }
  });

  describe('exists operator', () => {
    it('should show exists option in operator dropdown for metadata filters', () => {
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
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(
        <WithTheme>
          <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
        </WithTheme>,
      );

      // Find the operator dropdown
      const operatorDropdown = screen.getByRole('combobox', { name: /Operator/i });
      expect(operatorDropdown).toBeInTheDocument();

      // Click to open the dropdown
      fireEvent.mouseDown(operatorDropdown);

      // Check that "Exists" option is available
      const existsOption = screen.getByRole('option', { name: 'Exists' });
      expect(existsOption).toBeInTheDocument();
    });

    it('should not show exists option for non-metadata filters', () => {
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

      render(
        <WithTheme>
          <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
        </WithTheme>,
      );

      // Find the operator dropdown
      const operatorDropdown = screen.getByRole('combobox', { name: /Operator/i });
      expect(operatorDropdown).toBeInTheDocument();

      // Click to open the dropdown
      fireEvent.mouseDown(operatorDropdown);

      // Check that only "Equals" option is available for metric filters
      const equalsOption = screen.getByRole('option', { name: 'Equals' });
      expect(equalsOption).toBeInTheDocument();

      // Check that "Exists" option is NOT available
      const existsOption = screen.queryByRole('option', { name: 'Exists' });
      expect(existsOption).not.toBeInTheDocument();
    });

    it('should disable value input when exists operator is selected', () => {
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
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(
        <WithTheme>
          <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
        </WithTheme>,
      );

      const valueInput = screen.getByRole('textbox', { name: /Value/i });
      expect(valueInput).toBeInTheDocument();
      expect(valueInput).toBeDisabled();
      expect(valueInput).toHaveAttribute('placeholder', 'No value needed for exists');
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
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(
        <WithTheme>
          <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
        </WithTheme>,
      );

      // Find and click the operator dropdown
      const operatorDropdown = screen.getByRole('combobox', { name: /Operator/i });
      fireEvent.mouseDown(operatorDropdown);

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

    it('should show helpful placeholder text for exists operator', () => {
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
        updateFilter: mockUpdateFilter,
        removeFilter: mockRemoveFilter,
        updateAllFilterLogicOperators: mockUpdateAllFilterLogicOperators,
        addFilter: mockAddFilter,
        removeAllFilters: mockRemoveAllFilters,
      } as any);

      const handleClose = vi.fn();

      render(
        <WithTheme>
          <FiltersForm open={true} onClose={handleClose} anchorEl={anchorEl} />
        </WithTheme>,
      );

      const valueInput = screen.getByRole('textbox', { name: /Value/i });
      expect(valueInput).toHaveAttribute('placeholder', 'No value needed for exists');

      const helperText = screen.getByText('Checks if the metadata key exists');
      expect(helperText).toBeInTheDocument();
    });
  });
});
