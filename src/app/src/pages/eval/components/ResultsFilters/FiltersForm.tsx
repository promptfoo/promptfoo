import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import { NumberInput } from '@app/components/ui/number-input';
import { Popover, PopoverContent, PopoverTrigger } from '@app/components/ui/popover';
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
import { Plus, SlidersHorizontal, X } from 'lucide-react';
import { useDebounce } from 'use-debounce';
import { type ResultsFilter, useTableStore } from '../store';

const TYPE_LABELS: Record<ResultsFilter['type'], string> = {
  metric: 'Metric',
  metadata: 'Metadata',
  plugin: 'Plugin',
  strategy: 'Strategy',
  severity: 'Severity',
  policy: 'Policy',
};

const OPERATOR_LABELS: Record<ResultsFilter['operator'], string> = {
  equals: 'equals',
  not_equals: 'not equals',
  contains: 'contains',
  not_contains: 'not contains',
  exists: 'exists',
  is_defined: 'is defined',
  eq: '=',
  neq: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
};

function solelyHasEqualsOperator(type: ResultsFilter['type']): boolean {
  return ['strategy', 'severity', 'policy'].includes(type);
}

function buildFilterTypeOptions(options: ReturnType<typeof useTableStore.getState>['filters']['options']) {
  const result: { value: string; label: string }[] = [];
  if (options.metric.length > 0) {
    result.push({ value: 'metric', label: TYPE_LABELS.metric });
  }
  result.push({ value: 'metadata', label: TYPE_LABELS.metadata });
  for (const type of ['plugin', 'strategy', 'severity', 'policy'] as const) {
    if ((options[type]?.length ?? 0) > 0) {
      result.push({ value: type, label: TYPE_LABELS[type] });
    }
  }
  return result;
}

function buildOperatorOptions(type: ResultsFilter['type']) {
  if (type === 'metric') {
    return ['is_defined', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte'].map((value) => ({
      value,
      label: OPERATOR_LABELS[value as keyof typeof OPERATOR_LABELS],
    }));
  }
  if (type === 'plugin') {
    return ['equals', 'not_equals'].map((value) => ({
      value,
      label: OPERATOR_LABELS[value as keyof typeof OPERATOR_LABELS],
    }));
  }
  if (solelyHasEqualsOperator(type)) {
    return [{ value: 'equals', label: OPERATOR_LABELS.equals }];
  }
  return ['equals', 'contains', 'not_contains', 'exists'].map((value) => ({
    value,
    label: OPERATOR_LABELS[value as keyof typeof OPERATOR_LABELS],
  }));
}

function buildValueOptions({
  type,
  options,
  policyIdToNameMap,
}: {
  type: ResultsFilter['type'];
  options: ReturnType<typeof useTableStore.getState>['filters']['options'];
  policyIdToNameMap?: Record<string, string>;
}) {
  if (type !== 'plugin' && !solelyHasEqualsOperator(type)) {
    return [];
  }

  return (options[type] ?? [])
    .map((optionValue) => {
      let displayName: string | null = null;
      if (type === 'plugin' || type === 'strategy') {
        displayName = displayNameOverrides[optionValue as keyof typeof displayNameOverrides] || null;
      }
      if (type === 'severity') {
        displayName = severityDisplayNames[optionValue as keyof typeof severityDisplayNames] || null;
      }
      if (type === 'policy') {
        displayName = policyIdToNameMap?.[optionValue] ?? formatPolicyIdentifierAsMetric(optionValue);
      }
      return {
        value: optionValue,
        label: displayName ?? optionValue,
        sortValue: displayName ?? optionValue,
      };
    })
    .sort((a, b) => a.sortValue.localeCompare(b.sortValue));
}

function getFilterValuePlaceholder(type: ResultsFilter['type'], metadataKey: string) {
  switch (type) {
    case 'plugin':
      return 'Choose plugin...';
    case 'strategy':
      return 'Choose strategy...';
    case 'severity':
      return 'Choose severity...';
    case 'policy':
      return 'Choose policy...';
    case 'metric':
      return '0.0';
    case 'metadata':
      return metadataKey ? `Enter ${metadataKey} value...` : 'Select a key first';
    default:
      return 'Enter value...';
  }
}

function buildUpdatedFilterForType(filter: ResultsFilter, type: ResultsFilter['type']) {
  const updatedFilter = { ...filter, type, value: '' };

  if (type !== 'metadata' && type !== 'metric') {
    updatedFilter.field = undefined;
  }

  if (solelyHasEqualsOperator(type) && filter.operator !== 'equals') {
    updatedFilter.operator = 'equals';
  }
  if (type === 'plugin' && !['equals', 'not_equals'].includes(filter.operator)) {
    updatedFilter.operator = 'equals';
  }
  if (
    type === 'metric' &&
    !['is_defined', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte'].includes(filter.operator)
  ) {
    updatedFilter.operator = 'is_defined';
  }

  return updatedFilter;
}

function shouldFetchMetadataKeys({
  type,
  evalId,
  metadataKeysLoading,
  metadataKeys,
}: {
  type: ResultsFilter['type'];
  evalId?: string;
  metadataKeysLoading: boolean;
  metadataKeys?: string[];
}) {
  return (
    type === 'metadata' &&
    Boolean(evalId) &&
    !metadataKeysLoading &&
    (!metadataKeys || metadataKeys.length === 0)
  );
}

function shouldPrefetchMetadataValues({
  evalId,
  metadataKey,
  hasMetadataValueCache,
  metadataValuesAreLoading,
  metadataValuesHadError,
}: {
  evalId?: string;
  metadataKey: string;
  hasMetadataValueCache: boolean;
  metadataValuesAreLoading: boolean;
  metadataValuesHadError: boolean;
}) {
  return (
    Boolean(evalId) &&
    Boolean(metadataKey) &&
    !hasMetadataValueCache &&
    !metadataValuesAreLoading &&
    !metadataValuesHadError
  );
}

function getDisplayLogicOperator(
  filter: ResultsFilter,
  filterValues: Record<string, ResultsFilter>,
) {
  const filterWithSortIndex1 = Object.values(filterValues).find((value) => value.sortIndex === 1);
  if (filter.sortIndex === 1) {
    return filter.logicOperator ?? 'and';
  }
  return filterWithSortIndex1?.logicOperator ?? filter.logicOperator ?? 'and';
}

function DebouncedInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [localValue, setLocalValue] = useState(value);
  const [debouncedValue] = useDebounce(localValue, 500);

  useEffect(() => {
    if (debouncedValue !== value) {
      onChange(debouncedValue);
    }
  }, [debouncedValue, value, onChange]);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <Input
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  );
}

function LogicOperatorSelector({
  index,
  totalFilters,
  displayLogicOperator,
  filterSortIndex,
  onChange,
}: {
  index: number;
  totalFilters: number;
  displayLogicOperator: ResultsFilter['logicOperator'];
  filterSortIndex: number;
  onChange: (logicOperator: ResultsFilter['logicOperator']) => void;
}) {
  if (index === 0 && totalFilters > 1) {
    return <span className="w-[70px] shrink-0" />;
  }
  if (index === 0) {
    return null;
  }
  return (
    <Select
      value={displayLogicOperator}
      onValueChange={(v) => onChange(v as ResultsFilter['logicOperator'])}
      disabled={filterSortIndex > 1}
    >
      <SelectTrigger className="h-8 w-[70px] shrink-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="and">and</SelectItem>
        <SelectItem value="or">or</SelectItem>
      </SelectContent>
    </Select>
  );
}

function MetadataFieldSelector({
  filter,
  metadataKeys,
  metadataKeysLoading,
  metadataKeysError,
  onChange,
}: {
  filter: ResultsFilter;
  metadataKeys?: string[];
  metadataKeysLoading: boolean;
  metadataKeysError?: string | null;
  onChange: (field: string) => void;
}) {
  if (metadataKeysLoading) {
    return (
      <div className="relative w-[140px]">
        <Input value="" placeholder="Loading keys..." disabled className="h-8 pr-8" />
        <Spinner className="size-3 absolute right-2 top-2.5" />
      </div>
    );
  }
  if (metadataKeys && metadataKeys.length > 0) {
    return (
      <Select value={filter.field || ''} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-[140px] shrink-0">
          <SelectValue placeholder="Choose key..." />
        </SelectTrigger>
        <SelectContent>
          {metadataKeys.map((key) => (
            <SelectItem key={key} value={key}>
              {key}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return (
    <Input
      value={filter.field || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={metadataKeysError ? 'Error loading keys' : 'Enter key name...'}
      className={cn('h-8 w-[140px]', metadataKeysError && 'border-destructive')}
    />
  );
}

function MetricFieldSelector({
  filter,
  metrics,
  onChange,
}: {
  filter: ResultsFilter;
  metrics: string[];
  onChange: (field: string) => void;
}) {
  if (metrics.length === 0) {
    return null;
  }
  return (
    <Select value={filter.field || ''} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[140px] shrink-0">
        <SelectValue placeholder="Choose metric..." />
      </SelectTrigger>
      <SelectContent>
        {metrics.map((metric) => (
          <SelectItem key={metric} value={metric}>
            {metric}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FilterTypeSelector({
  filter,
  typeOptions,
  onChange,
}: {
  filter: ResultsFilter;
  typeOptions: Array<{ value: string; label: string }>;
  onChange: (type: ResultsFilter['type']) => void;
}) {
  return (
    <Select value={filter.type} onValueChange={(value) => onChange(value as ResultsFilter['type'])}>
      <SelectTrigger className="h-8 w-[110px] shrink-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {typeOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FilterFieldSelector({
  filter,
  metadataKeys,
  metadataKeysLoading,
  metadataKeysError,
  metrics,
  onChange,
}: {
  filter: ResultsFilter;
  metadataKeys?: string[];
  metadataKeysLoading: boolean;
  metadataKeysError?: string | null;
  metrics: string[];
  onChange: (field: string) => void;
}) {
  if (filter.type === 'metadata') {
    return (
      <MetadataFieldSelector
        filter={filter}
        metadataKeys={metadataKeys}
        metadataKeysLoading={metadataKeysLoading}
        metadataKeysError={metadataKeysError}
        onChange={onChange}
      />
    );
  }
  if (filter.type === 'metric') {
    return <MetricFieldSelector filter={filter} metrics={metrics} onChange={onChange} />;
  }
  return null;
}

function FilterOperatorSelector({
  filter,
  operatorOptions,
  onChange,
}: {
  filter: ResultsFilter;
  operatorOptions: Array<{ value: string; label: string }>;
  onChange: (operator: ResultsFilter['operator']) => void;
}) {
  return (
    <Select
      value={filter.operator}
      onValueChange={(value) => onChange(value as ResultsFilter['operator'])}
    >
      <SelectTrigger className="h-8 w-[110px] shrink-0">
        <SelectValue placeholder="Operator..." />
      </SelectTrigger>
      <SelectContent>
        {operatorOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FilterValueInput({
  filter,
  valuePlaceholder,
  currentValueLabel,
  valueOptions,
  selectedValues,
  metadataValueInput,
  setMetadataValueInput,
  handleValueChange,
  metadataKey,
  evalId,
  fetchMetadataValues,
  metadataValuesHadError,
  metadataValuesAreLoading,
  metadataValueOptions,
}: {
  filter: ResultsFilter;
  valuePlaceholder: string;
  currentValueLabel: string;
  valueOptions: Array<{ value: string; label: string }>;
  selectedValues: string[];
  metadataValueInput: string;
  setMetadataValueInput: (value: string) => void;
  handleValueChange: (value: string) => void;
  metadataKey: string;
  evalId?: string;
  fetchMetadataValues: (evalId: string, metadataKey: string) => void;
  metadataValuesHadError: boolean;
  metadataValuesAreLoading: boolean;
  metadataValueOptions: string[];
}) {
  if (filter.operator === 'exists' || filter.operator === 'is_defined') {
    return null;
  }

  if (filter.type === 'plugin' || solelyHasEqualsOperator(filter.type)) {
    return (
      <Select value={filter.value} onValueChange={handleValueChange}>
        <SelectTrigger className="h-8 flex-1 min-w-[150px]">
          <SelectValue placeholder={valuePlaceholder}>{currentValueLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {valueOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} disabled={selectedValues.includes(opt.value)}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (filter.type === 'metric' && ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'].includes(filter.operator)) {
    return (
      <NumberInput
        value={filter.value === '' ? undefined : Number(filter.value)}
        onChange={(v) => handleValueChange(v === undefined ? '' : String(v))}
        allowDecimals
        step={0.1}
        placeholder={valuePlaceholder}
        className="h-8 flex-1 min-w-[100px]"
      />
    );
  }

  if (filter.type === 'metadata' && filter.operator === 'equals') {
    return (
      <div className="relative flex-1 min-w-[150px]">
        <Input
          list={`metadata-values-${filter.id}`}
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
          placeholder={valuePlaceholder}
          disabled={!metadataKey || !evalId}
          className={cn('h-8', metadataValuesHadError && 'border-destructive')}
        />
        {metadataValuesAreLoading && <Spinner className="size-3 absolute right-2 top-2.5" />}
        <datalist id={`metadata-values-${filter.id}`}>
          {metadataValueOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </div>
    );
  }

  return (
    <DebouncedInput
      value={filter.value}
      onChange={handleValueChange}
      placeholder={valuePlaceholder}
      className="h-8 flex-1 min-w-[150px]"
    />
  );
}

function FilterRow({
  filter,
  index,
  totalFilters,
  onRemove,
}: {
  filter: ResultsFilter;
  index: number;
  totalFilters: number;
  onRemove: () => void;
}) {
  const [metadataValueInput, setMetadataValueInput] = useState(filter.value);
  const {
    filters,
    updateFilter,
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

  const metadataKey = filter.field ?? '';
  const metadataValueOptions = metadataKey ? (metadataValues[metadataKey] ?? []) : [];
  const metadataValuesAreLoading = metadataKey
    ? Boolean(metadataValuesLoading[metadataKey])
    : false;
  const metadataValuesHadError = metadataKey ? Boolean(metadataValuesError[metadataKey]) : false;
  const hasMetadataValueCache = metadataKey
    ? Object.prototype.hasOwnProperty.call(metadataValues, metadataKey)
    : false;

  // Get already selected values for disabling duplicates
  const selectedValues = useMemo(() => {
    const otherFilters = Object.values(filters.values).filter(
      (f) => f.id !== filter.id && f.type === filter.type && f.value,
    );
    return otherFilters.map((f) => f.value);
  }, [filters.values, filter.id, filter.type]);

  useEffect(() => {
    setMetadataValueInput(filter.value);
  }, [filter.value]);

  useEffect(() => {
    if (!metadataKey) {
      setMetadataValueInput('');
    }
  }, [metadataKey]);

  useEffect(() => {
    if (
      !shouldPrefetchMetadataValues({
        evalId,
        metadataKey,
        hasMetadataValueCache,
        metadataValuesAreLoading,
        metadataValuesHadError,
      })
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  const handleTypeChange = useCallback(
    (type: ResultsFilter['type']) => {
      const updatedFilter = buildUpdatedFilterForType(filter, type);

      if (
        shouldFetchMetadataKeys({
          type,
          evalId,
          metadataKeysLoading,
          metadataKeys,
        })
      ) {
        fetchMetadataKeys(evalId);
      }

      updateFilter(updatedFilter);
    },
    [filter, updateFilter, evalId, metadataKeysLoading, metadataKeys?.length, fetchMetadataKeys],
  );

  const handleFieldChange = useCallback(
    (field: string) => {
      updateFilter({ ...filter, field });
    },
    [filter, updateFilter],
  );

  const handleOperatorChange = useCallback(
    (operator: ResultsFilter['operator']) => {
      const updatedValue = operator === 'exists' || operator === 'is_defined' ? '' : filter.value;
      updateFilter({ ...filter, operator, value: updatedValue });
    },
    [filter, updateFilter],
  );

  const handleValueChange = useCallback(
    (value: string) => {
      updateFilter({ ...filter, value });
    },
    [filter, updateFilter],
  );

  const handleLogicOperatorChange = useCallback(
    (logicOperator: ResultsFilter['logicOperator']) => {
      if (filter.sortIndex === 1) {
        updateAllFilterLogicOperators(logicOperator);
      }
    },
    [filter.sortIndex, updateAllFilterLogicOperators],
  );

  const displayLogicOperator = getDisplayLogicOperator(filter, filters.values);

  // Build type options
  const typeOptions = useMemo(() => buildFilterTypeOptions(filters.options), [filters.options]);

  // Build operator options based on type
  const operatorOptions = useMemo(() => buildOperatorOptions(filter.type), [filter.type]);

  // Build value options for select types
  const valueOptions = useMemo(
    () =>
      buildValueOptions({
        type: filter.type,
        options: filters.options,
        policyIdToNameMap: filters.policyIdToNameMap,
      }),
    [filter.type, filters.options, filters.policyIdToNameMap],
  );

  // Get display name for current value (for select types)
  const currentValueLabel = useMemo(() => {
    const opt = valueOptions.find((o) => o.value === filter.value);
    return opt?.label || filter.value;
  }, [valueOptions, filter.value]);

  // Context-aware placeholders
  const valuePlaceholder = useMemo(
    () => getFilterValuePlaceholder(filter.type, metadataKey),
    [filter.type, metadataKey],
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <LogicOperatorSelector
        index={index}
        totalFilters={totalFilters}
        displayLogicOperator={displayLogicOperator}
        filterSortIndex={filter.sortIndex}
        onChange={handleLogicOperatorChange}
      />

      <FilterTypeSelector filter={filter} typeOptions={typeOptions} onChange={handleTypeChange} />

      <FilterFieldSelector
        filter={filter}
        metadataKeys={metadataKeys}
        metadataKeysLoading={metadataKeysLoading}
        metadataKeysError={metadataKeysError}
        metrics={filters.options.metric}
        onChange={handleFieldChange}
      />

      <FilterOperatorSelector
        filter={filter}
        operatorOptions={operatorOptions}
        onChange={handleOperatorChange}
      />

      {/* Value input */}
      <FilterValueInput
        filter={filter}
        valuePlaceholder={valuePlaceholder}
        currentValueLabel={currentValueLabel}
        valueOptions={valueOptions}
        selectedValues={selectedValues}
        metadataValueInput={metadataValueInput}
        setMetadataValueInput={setMetadataValueInput}
        handleValueChange={handleValueChange}
        metadataKey={metadataKey}
        evalId={evalId}
        fetchMetadataValues={fetchMetadataValues}
        metadataValuesHadError={metadataValuesHadError}
        metadataValuesAreLoading={metadataValuesAreLoading}
        metadataValueOptions={metadataValueOptions}
      />

      {/* Remove button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onRemove}
        className="size-8 p-0 shrink-0 text-muted-foreground hover:text-destructive"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

export default function FiltersForm() {
  const [open, setOpen] = useState(false);
  const { filters, addFilter, removeFilter, removeAllFilters } = useTableStore();

  const handleAddFilter = useCallback(() => {
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
      value: '',
    });
  }, [addFilter, filters.options]);

  const handleRemoveFilter = useCallback(
    (id: string) => {
      const filterCount = Object.keys(filters.values).length;
      removeFilter(id);
      if (filterCount === 1) {
        setOpen(false);
      }
    },
    [filters.values, removeFilter],
  );

  const handleClearAll = useCallback(() => {
    removeAllFilters();
    setOpen(false);
  }, [removeAllFilters]);

  // Auto-add filter when opening with none
  useEffect(() => {
    if (open && Object.keys(filters.values).length === 0) {
      handleAddFilter();
    }
  }, [open, filters.values, handleAddFilter]);

  const filterList = useMemo(() => {
    return Object.values(filters.values).sort((a, b) => a.sortIndex - b.sortIndex);
  }, [filters.values]);

  const activeFilterCount = filters.appliedCount;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal className="size-4 mr-2" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(500px,calc(100vw_-_1rem))] p-3"
        align="start"
        side="bottom"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Filters</h4>
            {filterList.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear all
              </Button>
            )}
          </div>

          {/* Filter rows */}
          {filterList.length === 0 ? (
            <p className="text-sm text-muted-foreground">No filters applied</p>
          ) : (
            <div className="space-y-2">
              {filterList.map((filter, index) => (
                <FilterRow
                  key={filter.id}
                  filter={filter}
                  index={index}
                  totalFilters={filterList.length}
                  onRemove={() => handleRemoveFilter(filter.id)}
                />
              ))}
            </div>
          )}

          {/* Add filter button */}
          <Button variant="outline" size="sm" onClick={handleAddFilter} className="w-full">
            <Plus className="mr-2 size-4" />
            Add filter
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
