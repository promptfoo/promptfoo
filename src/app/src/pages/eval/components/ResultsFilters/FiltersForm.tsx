import { useCallback, useEffect, useMemo, useState } from 'react';

import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Box,
  Button,
  CircularProgress,
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
import Autocomplete from '@mui/material/Autocomplete';
import { useTheme } from '@mui/material/styles';
import { displayNameOverrides, severityDisplayNames } from '@promptfoo/redteam/constants/metadata';
import { formatPolicyIdentifierAsMetric } from '@promptfoo/redteam/plugins/policy/utils';
import { useDebounce } from 'use-debounce';
import { BaseNumberInput } from '../../../../components/form/input/BaseNumberInput';
import { type ResultsFilter, useTableStore } from '../store';

const TYPE_LABELS_BY_TYPE: Record<ResultsFilter['type'], string> = {
  metric: 'Metric',
  metadata: 'Metadata',
  plugin: 'Plugin',
  strategy: 'Strategy',
  severity: 'Severity',
  policy: 'Policy',
};

const OPERATOR_LABELS_BY_OPERATOR: Record<ResultsFilter['operator'], string> = {
  equals: 'Equals',
  not_equals: 'Not Equals',
  contains: 'Contains',
  not_contains: 'Not Contains',
  exists: 'Exists',
  is_defined: 'Is Defined',
  eq: '==',
  neq: '!=',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
};

/**
 * Convenience predicate function to determine if a filter type solely has equals operator.
 */
function solelyHasEqualsOperator(type: ResultsFilter['type']): boolean {
  return ['strategy', 'severity', 'policy'].includes(type);
}

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
  onClose,
}: {
  value: ResultsFilter;
  index: number;
  totalFilters: number;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [metadataAutocompleteOpen, setMetadataAutocompleteOpen] = useState(false);
  const [metadataValueInput, setMetadataValueInput] = useState(value.value);
  const {
    filters,
    updateFilter,
    removeFilter,
    updateAllFilterLogicOperators,
    metadataKeys,
    metadataKeysLoading,
    metadataKeysError,
    fetchMetadataKeys,
    evalId,
    metadataValues,
    metadataValuesLoading,
    metadataValuesError,
    fetchMetadataValues,
  } = useTableStore();

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

  // Compute selected severity values (excluding current filter)
  const selectedSeverityValues = Object.values(filters.values)
    .filter((filter) => filter.id !== value.id && filter.type === 'severity' && filter.value)
    .map((filter) => filter.value);

  // Compute selected policy values (excluding current filter)
  const selectedPolicyValues = Object.values(filters.values)
    .filter((filter) => filter.id !== value.id && filter.type === 'policy' && filter.value)
    .map((filter) => filter.value);

  const metadataKey = value.field ?? '';
  const metadataValueOptions = metadataKey ? (metadataValues[metadataKey] ?? []) : [];
  const metadataValuesAreLoading = metadataKey
    ? Boolean(metadataValuesLoading[metadataKey])
    : false;
  const metadataValuesHadError = metadataKey ? Boolean(metadataValuesError[metadataKey]) : false;
  const hasMetadataValueCache = metadataKey
    ? Object.prototype.hasOwnProperty.call(metadataValues, metadataKey)
    : false;

  useEffect(() => {
    setMetadataValueInput(value.value);
  }, [value.value]);

  useEffect(() => {
    if (!metadataKey) {
      setMetadataAutocompleteOpen(false);
      setMetadataValueInput('');
    }
  }, [metadataKey]);

  useEffect(() => {
    if (
      !evalId ||
      !metadataKey ||
      hasMetadataValueCache ||
      metadataValuesAreLoading ||
      metadataValuesHadError
    ) {
      return;
    }

    fetchMetadataValues(evalId, metadataKey);
  }, [
    evalId,
    metadataKey,
    hasMetadataValueCache,
    metadataValuesAreLoading,
    metadataValuesHadError,
    fetchMetadataValues,
  ]);

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
      // Clear field when switching away from metadata or metric type
      const updatedFilter = { ...value, type: filterType };
      if (filterType !== 'metadata' && filterType !== 'metric') {
        updatedFilter.field = undefined;
      }
      // Clear value when switching between different filter types
      // This prevents inheriting incompatible values (e.g., plugin value for strategy filter)
      if (value.type !== filterType) {
        updatedFilter.value = '';
      }
      // Reset operator to 'equals' when changing to types that only support 'equals'
      if (solelyHasEqualsOperator(filterType) && value.operator !== 'equals') {
        updatedFilter.operator = 'equals';
      }
      if (filterType === 'plugin' && !['equals', 'not_equals'].includes(value.operator)) {
        updatedFilter.operator = 'equals';
      }
      // Reset operator to 'is_defined' when switching to metric type with an incompatible operator
      if (
        filterType === 'metric' &&
        !['is_defined', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte'].includes(value.operator)
      ) {
        updatedFilter.operator = 'is_defined';
      }

      // Fetch metadata keys when user switches to metadata filter type
      if (
        filterType === 'metadata' &&
        evalId &&
        !metadataKeysLoading &&
        (!metadataKeys || metadataKeys.length === 0)
      ) {
        fetchMetadataKeys(evalId);
      }

      updateFilter(updatedFilter);
    },
    [value, updateFilter, evalId, metadataKeysLoading, metadataKeys?.length, fetchMetadataKeys],
  );

  /**
   * Updates the filter operator.
   * @param operator - The new filter operator.
   */
  const handleOperatorChange = useCallback(
    (filterOperator: ResultsFilter['operator']) => {
      // Clear value when switching to exists or is_defined operator
      const updatedValue =
        filterOperator === 'exists' || filterOperator === 'is_defined' ? '' : value.value;
      updateFilter({ ...value, operator: filterOperator, value: updatedValue });
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
        p: 1.5,
        borderRadius: 1,
        overflow: 'hidden',
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

      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          flex: 1,
          alignItems: 'center',
          flexWrap: 'nowrap',
          minWidth: 0,
        }}
      >
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
            ...((filters.options.plugin?.length ?? 0) > 0
              ? [{ label: TYPE_LABELS_BY_TYPE.plugin, value: 'plugin' }]
              : []),
            ...((filters.options.strategy?.length ?? 0) > 0
              ? [{ label: TYPE_LABELS_BY_TYPE.strategy, value: 'strategy' }]
              : []),
            ...((filters.options.severity?.length ?? 0) > 0
              ? [{ label: TYPE_LABELS_BY_TYPE.severity, value: 'severity' }]
              : []),
            ...((filters.options.policy?.length ?? 0) > 0
              ? [{ label: TYPE_LABELS_BY_TYPE.policy, value: 'policy' }]
              : []),
          ]}
          value={value.type}
          onChange={(e) => handleTypeChange(e as ResultsFilter['type'])}
          width={150}
        />

        {value.type === 'metadata' &&
          // Show loading state initially to prevent flicker
          (metadataKeysLoading ? (
            <TextField
              id={`${index}-field-loading`}
              label="Key"
              variant="outlined"
              size="small"
              value=""
              placeholder="Loading keys..."
              disabled
              sx={{ width: 180 }}
              InputProps={{
                endAdornment: <CircularProgress size={16} />,
              }}
            />
          ) : metadataKeys && metadataKeys.length > 0 ? (
            // Show dropdown if keys are available
            <Dropdown
              id={`${index}-field-select`}
              label="Key"
              values={(metadataKeys || []).map((key) => ({ label: key, value: key }))}
              value={value.field || ''}
              onChange={handleFieldChange}
              width={180}
            />
          ) : (
            // Fallback to text input with error indication if needed
            <TextField
              id={`${index}-field-input`}
              label="Key"
              variant="outlined"
              size="small"
              value={value.field || ''}
              onChange={(e) => handleFieldChange(e.target.value)}
              placeholder={
                metadataKeysError ? 'Error loading keys - type manually' : 'Enter metadata key'
              }
              sx={{ width: 180 }}
              error={metadataKeysError}
              helperText={metadataKeysError ? 'Failed to load available keys' : undefined}
            />
          ))}

        {value.type === 'metric' && filters.options.metric.length > 0 && (
          <Dropdown
            id={`${index}-metric-field-select`}
            label="Metric"
            values={filters.options.metric.map((metric) => ({ label: metric, value: metric }))}
            value={value.field || ''}
            onChange={handleFieldChange}
            width={180}
          />
        )}

        <Dropdown
          id={`${index}-operator-select`}
          label="Operator"
          values={
            value.type === 'metric'
              ? [
                  { label: OPERATOR_LABELS_BY_OPERATOR.is_defined, value: 'is_defined' },
                  { label: OPERATOR_LABELS_BY_OPERATOR.eq, value: 'eq' },
                  { label: OPERATOR_LABELS_BY_OPERATOR.neq, value: 'neq' },
                  { label: OPERATOR_LABELS_BY_OPERATOR.gt, value: 'gt' },
                  { label: OPERATOR_LABELS_BY_OPERATOR.gte, value: 'gte' },
                  { label: OPERATOR_LABELS_BY_OPERATOR.lt, value: 'lt' },
                  { label: OPERATOR_LABELS_BY_OPERATOR.lte, value: 'lte' },
                ]
              : value.type === 'plugin'
                ? [
                    { label: OPERATOR_LABELS_BY_OPERATOR.equals, value: 'equals' },
                    { label: OPERATOR_LABELS_BY_OPERATOR.not_equals, value: 'not_equals' },
                  ]
                : solelyHasEqualsOperator(value.type)
                  ? [{ label: OPERATOR_LABELS_BY_OPERATOR.equals, value: 'equals' }]
                  : [
                      { label: OPERATOR_LABELS_BY_OPERATOR.equals, value: 'equals' },
                      { label: OPERATOR_LABELS_BY_OPERATOR.contains, value: 'contains' },
                      { label: OPERATOR_LABELS_BY_OPERATOR.not_contains, value: 'not_contains' },
                      { label: OPERATOR_LABELS_BY_OPERATOR.exists, value: 'exists' },
                    ]
          }
          value={value.operator}
          onChange={(e) => handleOperatorChange(e as ResultsFilter['operator'])}
          width={150}
        />

        {/* Hide value input when exists or is_defined operator is selected */}
        {value.operator !== 'exists' && value.operator !== 'is_defined' && (
          <Box
            sx={{
              // NOTE: Do not set a max-width here: this container requires dynamic width which resizes according
              // to the width of its contents i.e. the dropdown values.
              flex: 1,
              minWidth: 250,
            }}
          >
            {value.type === 'plugin' || solelyHasEqualsOperator(value.type) ? (
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
                    }
                    if (value.type === 'severity') {
                      displayName = severityDisplayNames[
                        optionValue as keyof typeof severityDisplayNames
                      ] as string;
                    }
                    if (value.type === 'policy') {
                      // For policies, use the name from the mapping if available, otherwise use the ID
                      const policyName = filters.policyIdToNameMap?.[optionValue];
                      displayName = policyName ?? formatPolicyIdentifierAsMetric(optionValue);
                    }
                    if (displayName) {
                      // For policy filters, don't show the ID in the code section
                      const showValue = value.type !== 'policy';
                      label = showValue ? (
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
                      ) : (
                        displayName
                      );
                    }
                    return { label, value: optionValue, sortValue: displayName ?? optionValue };
                  })
                  .sort((a, b) => a.sortValue.localeCompare(b.sortValue))}
                value={value.value}
                onChange={(selected) => handleValueChange(selected)}
                width="100%"
                disabledValues={
                  value.type === 'metric'
                    ? selectedMetricValues
                    : value.type === 'plugin'
                      ? selectedPluginValues
                      : value.type === 'strategy'
                        ? selectedStrategyValues
                        : value.type === 'severity'
                          ? selectedSeverityValues
                          : value.type === 'policy'
                            ? selectedPolicyValues
                            : []
                }
              />
            ) : value.type === 'metric' &&
              ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'].includes(value.operator) ? (
              <BaseNumberInput
                id={`${index}-value-input`}
                label="Value"
                variant="outlined"
                size="small"
                value={value.value === '' ? undefined : Number(value.value)}
                onChange={(numericValue) => {
                  handleValueChange(numericValue === undefined ? '' : String(numericValue));
                }}
                allowDecimals
                step={0.1}
                fullWidth
                slotProps={{
                  input: {
                    sx: {
                      py: 1,
                    },
                  },
                }}
              />
            ) : value.type === 'metadata' && value.operator === 'equals' ? (
              <Autocomplete
                freeSolo
                id={`${index}-metadata-value-autocomplete`}
                size="small"
                value={value.value || null}
                inputValue={metadataValueInput}
                onInputChange={(_event, newInputValue, reason) => {
                  if (reason === 'reset') {
                    return;
                  }

                  setMetadataValueInput(newInputValue);

                  if (reason === 'input') {
                    handleValueChange(newInputValue);
                  }

                  if (reason === 'clear') {
                    handleValueChange('');
                  }
                }}
                onChange={(_event, newValue) => {
                  const nextValue = typeof newValue === 'string' ? newValue : '';
                  setMetadataValueInput(nextValue);
                  handleValueChange(nextValue);
                }}
                open={metadataAutocompleteOpen}
                onOpen={() => {
                  if (!metadataKey || !evalId) {
                    setMetadataAutocompleteOpen(false);
                    return;
                  }

                  setMetadataAutocompleteOpen(true);
                  fetchMetadataValues(evalId, metadataKey);
                }}
                onClose={() => setMetadataAutocompleteOpen(false)}
                options={metadataValueOptions}
                loading={metadataValuesAreLoading}
                noOptionsText={metadataKey ? 'No values found' : 'Select a key to load values'}
                loadingText="Loading values..."
                disabled={!metadataKey || !evalId}
                isOptionEqualToValue={(option, currentValue) => option === currentValue}
                sx={{ width: '100%' }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Value"
                    variant="outlined"
                    size="small"
                    error={metadataValuesHadError}
                    helperText={
                      metadataValuesHadError ? 'Failed to load metadata values' : undefined
                    }
                    placeholder={metadataKey ? 'Select or type a value' : 'Select a key first'}
                    sx={{
                      '& .MuiInputBase-input': {
                        py: 1,
                      },
                    }}
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {metadataValuesAreLoading ? (
                            <CircularProgress color="inherit" size={16} />
                          ) : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
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
        )}
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
  const {
    filters,
    addFilter,
    removeAllFilters,
    metadataKeys,
    metadataKeysLoading,
    fetchMetadataKeys,
    evalId,
  } = useTableStore();

  /**
   * Adds a new filter with default values.
   */
  const handleAddFilter = useCallback(() => {
    // Determine the default filter type based on available options
    let defaultType: ResultsFilter['type'] = 'metadata';
    if (filters.options.metric.length > 0) {
      defaultType = 'metric';
    } else if ((filters.options.plugin?.length ?? 0) > 1) {
      defaultType = 'plugin';
    } else if ((filters.options.strategy?.length ?? 0) > 1) {
      defaultType = 'strategy';
    } else if ((filters.options.severity?.length ?? 0) > 0) {
      defaultType = 'severity';
    } else if ((filters.options.policy?.length ?? 0) > 0) {
      defaultType = 'policy';
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

  /**
   * Fetch metadata keys when the filter form opens if there are existing metadata filters
   * or if metadata keys haven't been loaded yet.
   */
  useEffect(() => {
    if (open && evalId && !metadataKeysLoading) {
      // Check if there are any existing metadata filters
      const hasMetadataFilters = Object.values(filters.values).some(
        (filter) => filter.type === 'metadata',
      );

      // Fetch if we have metadata filters but no keys, or if keys are empty
      if (hasMetadataFilters && (!metadataKeys || metadataKeys.length === 0)) {
        fetchMetadataKeys(evalId);
      }
    }
  }, [open, evalId, metadataKeysLoading, filters.values, metadataKeys, fetchMetadataKeys]);

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
          minWidth: { xs: 400, sm: 600 },
          maxWidth: { xs: '95vw', sm: '90vw' },
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
