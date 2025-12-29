import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import { NumberInput } from '@app/components/ui/number-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Spinner } from '@app/components/ui/spinner';
import { cn } from '@app/lib/utils';
import { displayNameOverrides, severityDisplayNames } from '@promptfoo/redteam/constants/metadata';
import { formatPolicyIdentifierAsMetric } from '@promptfoo/redteam/plugins/policy/utils';
import { Plus, Trash2, X } from 'lucide-react';
import { useDebounce } from 'use-debounce';
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
  values: { label: string | React.ReactNode; value: string; sortValue?: string }[];
  value: string;
  onChange: (value: string) => void;
  width?: number | string;
  disabled?: boolean;
  disabledValues?: string[];
}) {
  const selectedItem = values.find((item) => item.value === value);

  return (
    <div style={{ minWidth: typeof width === 'number' ? `${width}px` : width }}>
      {label && (
        <label className="text-xs text-muted-foreground mb-1 block" id={`${id}-label`}>
          {label}
        </label>
      )}
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={`${id}-select`} aria-labelledby={label ? `${id}-label` : undefined}>
          <SelectValue>
            {typeof selectedItem?.label === 'string' ? selectedItem.label : value || 'Select...'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {values.map((item) => (
            <SelectItem
              key={item.value}
              value={item.value}
              disabled={disabledValues.includes(item.value)}
            >
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DebouncedTextField({
  value,
  onChange,
  label,
  placeholder,
  fullWidth,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  fullWidth?: boolean;
  className?: string;
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
    <div className={cn(fullWidth && 'w-full', className)}>
      {label && <label className="text-xs text-muted-foreground mb-1 block">{label}</label>}
      <Input
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={placeholder}
        className="h-9"
      />
    </div>
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
  const [_metadataAutocompleteOpen, setMetadataAutocompleteOpen] = useState(false);
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
    <div className="flex items-center gap-3 p-3 rounded overflow-hidden hover:bg-muted/50">
      <button
        type="button"
        onClick={handleRemove}
        className="p-1 text-muted-foreground hover:text-destructive transition-colors rounded"
        aria-label="Remove filter"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-3 flex-1 min-w-0 flex-nowrap">
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
            <div style={{ width: 180 }}>
              <label className="text-xs text-muted-foreground mb-1 block">Key</label>
              <div className="relative">
                <Input
                  id={`${index}-field-loading`}
                  value=""
                  placeholder="Loading keys..."
                  disabled
                  className="h-9 pr-8"
                />
                <Spinner className="h-4 w-4 absolute right-2 top-2.5" />
              </div>
            </div>
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
            <div style={{ width: 180 }}>
              <label className="text-xs text-muted-foreground mb-1 block">Key</label>
              <Input
                id={`${index}-field-input`}
                value={value.field || ''}
                onChange={(e) => handleFieldChange(e.target.value)}
                placeholder={
                  metadataKeysError ? 'Error loading keys - type manually' : 'Enter metadata key'
                }
                className={cn('h-9', metadataKeysError && 'border-destructive')}
              />
              {metadataKeysError && (
                <p className="text-xs text-destructive mt-1">Failed to load available keys</p>
              )}
            </div>
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
          <div className="flex-1 min-w-[250px]">
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
                        <div className="flex items-center justify-between w-full gap-4">
                          {displayName}
                          <code className="text-[0.8em] text-muted-foreground">{optionValue}</code>
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
              <NumberInput
                id={`${index}-value-input`}
                label="Value"
                value={value.value === '' ? undefined : Number(value.value)}
                onChange={(numericValue) => {
                  handleValueChange(numericValue === undefined ? '' : String(numericValue));
                }}
                allowDecimals
                step={0.1}
                fullWidth
              />
            ) : value.type === 'metadata' && value.operator === 'equals' ? (
              // Simplified metadata value input with datalist
              <div className="w-full">
                <label className="text-xs text-muted-foreground mb-1 block">Value</label>
                <div className="relative">
                  <Input
                    id={`${index}-metadata-value-input`}
                    list={`${index}-metadata-value-options`}
                    value={metadataValueInput}
                    onChange={(e) => {
                      setMetadataValueInput(e.target.value);
                      handleValueChange(e.target.value);
                    }}
                    onFocus={() => {
                      if (metadataKey && evalId) {
                        fetchMetadataValues(evalId, metadataKey);
                      }
                    }}
                    placeholder={metadataKey ? 'Select or type a value' : 'Select a key first'}
                    disabled={!metadataKey || !evalId}
                    className={cn('h-9', metadataValuesHadError && 'border-destructive')}
                  />
                  {metadataValuesAreLoading && (
                    <Spinner className="h-4 w-4 absolute right-2 top-2.5" />
                  )}
                  <datalist id={`${index}-metadata-value-options`}>
                    {metadataValueOptions.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                </div>
                {metadataValuesHadError && (
                  <p className="text-xs text-destructive mt-1">Failed to load metadata values</p>
                )}
              </div>
            ) : (
              <DebouncedTextField
                label="Value"
                value={value.value}
                onChange={handleValueChange}
                fullWidth
              />
            )}
          </div>
        )}
      </div>
    </div>
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

  // Handle click outside to close
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const popoverContent = document.getElementById('filters-popover-content');
      if (popoverContent && !popoverContent.contains(target) && !anchorEl?.contains(target)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, onClose, anchorEl]);

  if (!open || !anchorEl) {
    return null;
  }

  // Calculate position based on anchor element
  const rect = anchorEl.getBoundingClientRect();

  return (
    <div
      id="filters-popover-content"
      className="fixed z-[var(--z-dropdown)] mt-1 min-w-[400px] sm:min-w-[600px] max-w-[95vw] sm:max-w-[90vw] max-h-[80vh] overflow-hidden flex flex-col bg-popover border border-border rounded-lg shadow-lg"
      style={{
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
      }}
    >
      <div className="px-4 pt-4 pb-2 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-1">
          {filterValuesList.map((filter, index) => (
            <Filter
              key={filter.id}
              value={filter}
              index={index}
              totalFilters={filterValuesList.length}
              onClose={onClose}
            />
          ))}
        </div>
      </div>

      <div className="px-4 pt-2 pb-4">
        {filterValuesList.length > 0 && <hr className="border-border mb-3" />}
        <div className="flex gap-2 justify-between">
          <Button onClick={handleAddFilter} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Filter
          </Button>
          {filterValuesList.length > 0 && (
            <Button onClick={handleRemoveAllFilters} variant="outline" size="sm">
              <Trash2 className="h-4 w-4 mr-1" />
              Remove All
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
