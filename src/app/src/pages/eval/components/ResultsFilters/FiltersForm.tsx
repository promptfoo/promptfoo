import { useCallback, useEffect, useMemo, useState } from 'react';

import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Box,
  Button,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Popover,
  Select,
  Stack,
  TextField,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { displayNameOverrides } from '@promptfoo/redteam/constants/metadata';
import { useDebounce } from 'use-debounce';
import { type ResultsFilter, useTableStore } from '../store';

const TYPE_LABELS_BY_TYPE: Record<ResultsFilter['type'], string> = {
  metric: 'Metric',
  metadata: 'Metadata',
  plugin: 'Plugin',
  strategy: 'Strategy',
};

const OPERATOR_LABELS_BY_OPERATOR: Record<ResultsFilter['operator'], string> = {
  equals: 'Equals',
  contains: 'Contains',
  not_contains: 'Not Contains',
};

function Dropdown({
  id,
  label,
  values,
  value,
  onChange,
  width = 200,
  disabled = false,
  disabledValues = [],
}: {
  id: string;
  label?: string;
  values: { label: string | React.ReactNode; value: string }[];
  value: string;
  onChange: (value: string) => void;
  width?: number | string;
  disabled?: boolean;
  disabledValues?: string[];
}) {
  return (
    <FormControl variant="outlined" size="small" sx={{ minWidth: width }}>
      {label && <InputLabel id={`${id}-label`}>{label}</InputLabel>}
      <Select
        labelId={`${id}-label`}
        id={`${id}-select`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        label={label}
        disabled={disabled}
        sx={{
          backgroundColor: 'background.paper',
          '& .MuiSelect-select': {
            py: 1,
          },
        }}
      >
        {values.map((item) => (
          <MenuItem
            key={item.value}
            value={item.value}
            disabled={disabledValues.includes(item.value)}
          >
            {item.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

function DebouncedTextField({
  value,
  onChange,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  [key: string]: any;
}) {
  const [localValue, setLocalValue] = useState(value);
  const [debouncedValue] = useDebounce(localValue, 500);

  // Update parent when debounced value changes
  useEffect(() => {
    if (debouncedValue !== value) {
      onChange(debouncedValue);
    }
  }, [debouncedValue, value, onChange]);

  // Sync with external value changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <TextField
      {...props}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      sx={{
        backgroundColor: 'background.paper',
        '& .MuiInputBase-input': {
          py: 1,
        },
        ...props.sx,
      }}
    />
  );
}

function Filter({
  value,
  index,
  totalFilters,
  onClose,
}: {
  value: ResultsFilter;
  index: number;
  totalFilters: number;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { filters, updateFilter, removeFilter, updateAllFilterLogicOperators } = useTableStore();

  // Get list of already selected metric values (excluding current filter)
  const selectedMetricValues = Object.values(filters.values)
    .filter((filter) => filter.id !== value.id && filter.type === 'metric' && filter.value)
    .map((filter) => filter.value);

  // Compute selected plugin values (excluding current filter)
  const selectedPluginValues = Object.values(filters.values)
    .filter((filter) => filter.id !== value.id && filter.type === 'plugin' && filter.value)
    .map((filter) => filter.value);

  // Compute selected strategy values (excluding current filter)
  const selectedStrategyValues = Object.values(filters.values)
    .filter((filter) => filter.id !== value.id && filter.type === 'strategy' && filter.value)
    .map((filter) => filter.value);

  /**
   * Updates the metadata field.
   * @param field - The new metadata field.
   */
  const handleFieldChange = useCallback(
    (field: string) => {
      updateFilter({ ...value, field });
    },
    [value, updateFilter],
  );

  /**
   * Updates the filter type.
   * @param type - The new filter type.
   */
  const handleTypeChange = useCallback(
    (filterType: ResultsFilter['type']) => {
      // Clear field when switching away from metadata type
      const updatedFilter = { ...value, type: filterType };
      if (filterType !== 'metadata') {
        updatedFilter.field = undefined;
      }
      // Clear value when switching between different filter types
      // This prevents inheriting incompatible values (e.g., plugin value for strategy filter)
      if (value.type !== filterType) {
        updatedFilter.value = '';
      }
      // Reset operator to 'equals' when changing to types that only support 'equals'
      if (
        (filterType === 'metric' || filterType === 'plugin' || filterType === 'strategy') &&
        value.operator !== 'equals'
      ) {
        updatedFilter.operator = 'equals';
      }
      updateFilter(updatedFilter);
    },
    [value, updateFilter],
  );

  /**
   * Updates the filter operator.
   * @param operator - The new filter operator.
   */
  const handleOperatorChange = useCallback(
    (filterOperator: ResultsFilter['operator']) => {
      updateFilter({ ...value, operator: filterOperator });
    },
    [value, updateFilter],
  );

  /**
   * Updates the filter value.
   * @param filterValue - The new filter value.
   */
  const handleValueChange = useCallback(
    (filterValue: string) => {
      updateFilter({ ...value, value: filterValue });
    },
    [value, updateFilter],
  );

  /**
   * Updates the filter logic operator. Filter logic operators are defined by the second filter
   * and applied to all filters; in other words, filters are either joined by 'and' or 'or', but
   * not both. This is designed to avoid more complex logic combinations which would require the user
   * to define parenthetical logic.
   * @param logicOperator - The new filter logic operator.
   */
  const handleLogicOperatorChange = useCallback(
    (filterLogicOperator: ResultsFilter['logicOperator']) => {
      if (value.sortIndex === 1) {
        // If this is the second filter (by sortIndex), update all filters to have the same logic operator
        updateAllFilterLogicOperators(filterLogicOperator);
      } else {
        // noop:  this state should never be reached because the caller is disabled when index > 1.
      }
    },
    [value, updateFilter, updateAllFilterLogicOperators],
  );

  const handleRemove = useCallback(() => {
    const filterCount = Object.keys(filters.values).length;
    removeFilter(value.id);
    // Close the popover if this was the last filter
    if (filterCount === 1) {
      onClose();
    }
  }, [filters.values, removeFilter, value.id, onClose]);

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1.5,
        alignItems: 'center',
        p: 1,
        borderRadius: 1,
        '&:hover': {
          backgroundColor: 'action.hover',
        },
      }}
    >
      <IconButton
        onClick={handleRemove}
        size="small"
        sx={{
          color: 'text.secondary',
          '&:hover': {
            color: 'error.main',
          },
        }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>

      <Box sx={{ display: 'flex', gap: 1.5, flex: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        {index !== 0 &&
          (() => {
            // Get the filter with sortIndex === 1 to determine the logic operator for all filters
            const filterWithSortIndex1 = Object.values(filters.values).find(
              (f) => f.sortIndex === 1,
            );
            const secondFilterLogicOperator = filterWithSortIndex1?.logicOperator || null;
            const displayValue =
              value.sortIndex === 1
                ? (value.logicOperator ?? 'and')
                : (secondFilterLogicOperator ?? value.logicOperator ?? 'and');

            return (
              <Dropdown
                id={`${index}-logic-operator-select`}
                values={[
                  { label: 'And', value: 'and' },
                  { label: 'Or', value: 'or' },
                ]}
                value={displayValue}
                onChange={(e) => handleLogicOperatorChange(e as ResultsFilter['logicOperator'])}
                width={100}
                disabled={value.sortIndex > 1}
              />
            );
          })()}

        <Dropdown
          id={`${index}-filter-type-select`}
          label="Field"
          values={[
            ...(filters.options.metric.length > 0
              ? [{ label: TYPE_LABELS_BY_TYPE.metric, value: 'metric' }]
              : []),
            { label: TYPE_LABELS_BY_TYPE.metadata, value: 'metadata' },
            // Show plugin and strategy filters if there are any options available i.e. these are redteam eval results.
            ...(filters.options.plugin.length > 0
              ? [{ label: TYPE_LABELS_BY_TYPE.plugin, value: 'plugin' }]
              : []),
            ...(filters.options.strategy.length > 0
              ? [{ label: TYPE_LABELS_BY_TYPE.strategy, value: 'strategy' }]
              : []),
          ]}
          value={value.type}
          onChange={(e) => handleTypeChange(e as ResultsFilter['type'])}
          width={150}
        />

        {value.type === 'metadata' && (
          <DebouncedTextField
            id={`${index}-field-input`}
            label="Key"
            variant="outlined"
            size="small"
            value={value.field || ''}
            onChange={handleFieldChange}
            placeholder="Enter metadata key"
            sx={{ width: 180 }}
          />
        )}

        <Dropdown
          id={`${index}-operator-select`}
          label="Operator"
          values={
            value.type === 'metric' || value.type === 'plugin' || value.type === 'strategy'
              ? [{ label: OPERATOR_LABELS_BY_OPERATOR.equals, value: 'equals' }]
              : [
                  { label: OPERATOR_LABELS_BY_OPERATOR.equals, value: 'equals' },
                  { label: OPERATOR_LABELS_BY_OPERATOR.contains, value: 'contains' },
                  { label: OPERATOR_LABELS_BY_OPERATOR.not_contains, value: 'not_contains' },
                ]
          }
          value={value.operator}
          onChange={(e) => handleOperatorChange(e as ResultsFilter['operator'])}
          width={150}
        />

        <Box sx={{ flex: 1, minWidth: 250 }}>
          {value.type === 'metric' || value.type === 'plugin' || value.type === 'strategy' ? (
            <Dropdown
              id={`${index}-value-select`}
              label={TYPE_LABELS_BY_TYPE[value.type]}
              values={(filters.options[value.type] ?? [])
                .map((optionValue) => {
                  let label: string | React.ReactNode = optionValue;
                  let displayName: string | null = null;
                  if (value.type === 'plugin' || value.type === 'strategy') {
                    displayName = displayNameOverrides[
                      optionValue as keyof typeof displayNameOverrides
                    ] as string;
                    if (displayName) {
                      label = (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%',
                            gap: 16,
                          }}
                        >
                          {displayName}
                          <code
                            style={{
                              fontSize: '0.8em',
                              color: theme.palette.text.secondary,
                            }}
                          >
                            {optionValue}
                          </code>
                        </div>
                      );
                    }
                  }
                  return { label, value: optionValue, sortValue: displayName ?? optionValue };
                })
                .sort((a, b) => {
                  // Sort by the option value since label might be a React element
                  return a.sortValue.localeCompare(b.sortValue);
                })} // Sort by value
              value={value.value}
              onChange={(e) => handleValueChange(e)}
              width="100%"
              disabledValues={
                value.type === 'metric'
                  ? selectedMetricValues
                  : value.type === 'plugin'
                    ? selectedPluginValues
                    : value.type === 'strategy'
                      ? selectedStrategyValues
                      : []
              }
            />
          ) : (
            <DebouncedTextField
              id={`${index}-value-input`}
              label="Value"
              variant="outlined"
              size="small"
              value={value.value}
              onChange={handleValueChange}
              fullWidth
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default function FiltersForm({
  open,
  onClose,
  anchorEl,
}: {
  open: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
}) {
  const { filters, addFilter, removeAllFilters } = useTableStore();

  /**
   * Adds a new filter with default values.
   */
  const handleAddFilter = useCallback(() => {
    // Determine the default filter type based on available options
    let defaultType: ResultsFilter['type'] = 'metadata';
    if (filters.options.metric.length > 0) {
      defaultType = 'metric';
    } else if (filters.options.plugin.length > 1) {
      defaultType = 'plugin';
    } else if (filters.options.strategy.length > 1) {
      defaultType = 'strategy';
    }

    addFilter({
      type: defaultType,
      operator: 'equals',
      // By default, the value is empty, which means the filter is not applied.
      // In other words, the filter is not applied until the user selects a value.
      value: '',
    });
  }, [addFilter, filters.options]);

  /**
   * Removes all filters and closes the popover.
   */
  const handleRemoveAllFilters = () => {
    onClose();
    removeAllFilters();
  };

  /**
   * If there are no filters when the popover is opened, add a default filter, reducing
   * the number of clicks required to create a filter.
   */
  useEffect(() => {
    if (open && Object.keys(filters.values).length === 0) {
      handleAddFilter();
    }
  }, [filters.values, open, handleAddFilter]);

  const filterValuesList = useMemo(() => {
    // Sort by sortIndex to ensure consistent ordering
    return Object.values(filters.values).sort((a, b) => a.sortIndex - b.sortIndex);
  }, [filters.values]);

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorEl={anchorEl}
      anchorOrigin={{
        vertical: 'bottom',
        horizontal: 'left',
      }}
      transformOrigin={{
        vertical: 'top',
        horizontal: 'left',
      }}
      PaperProps={{
        sx: {
          mt: 1,
          minWidth: 600,
          maxWidth: '90vw',
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <Box sx={{ px: 2, pt: 2, pb: 1, flex: 1, overflowY: 'auto' }}>
        <Stack direction="column" spacing={0.5}>
          {filterValuesList.map((filter, index) => (
            <Filter
              key={filter.id}
              value={filter}
              index={index}
              totalFilters={filterValuesList.length}
              onClose={onClose}
            />
          ))}
        </Stack>
      </Box>

      <Box sx={{ px: 2, pt: 1, pb: 2 }}>
        {filterValuesList.length > 0 && <Divider sx={{ mb: 1.5 }} />}
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'space-between' }}>
          <Button
            startIcon={<AddIcon />}
            onClick={handleAddFilter}
            variant="contained"
            size="small"
          >
            Add Filter
          </Button>
          {filterValuesList.length > 0 && (
            <Button
              startIcon={<DeleteIcon />}
              onClick={handleRemoveAllFilters}
              color="error"
              variant="outlined"
              size="small"
            >
              Remove All
            </Button>
          )}
        </Box>
      </Box>
    </Popover>
  );
}
