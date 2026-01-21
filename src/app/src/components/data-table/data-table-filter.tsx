import * as React from 'react';

import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@app/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Filter, Plus, X } from 'lucide-react';
import type { Table } from '@tanstack/react-table';

interface DataTableFilterProps<TData> {
  table: Table<TData>;
}

type ComparisonOperator =
  | 'contains'
  | 'equals'
  | 'startsWith'
  | 'endsWith'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte';

type SelectOperator = 'equals' | 'notEquals' | 'isAny';

type FilterOperator = ComparisonOperator | SelectOperator;

const COMPARISON_OPERATORS: { value: ComparisonOperator; label: string }[] = [
  { value: 'contains', label: 'contains' },
  { value: 'equals', label: 'equals' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'endsWith', label: 'ends with' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
];

const SELECT_OPERATORS: { value: SelectOperator; label: string }[] = [
  { value: 'equals', label: 'equals' },
  { value: 'notEquals', label: 'not equals' },
  { value: 'isAny', label: 'is any of' },
];

interface ActiveFilter {
  id: string;
  columnId: string;
  operator: FilterOperator;
  value: string | string[]; // Can be array for multi-select
}

interface FilterOption {
  label: string;
  value: string;
}

// Select filter component for discrete values
interface SelectFilterProps {
  operator: SelectOperator;
  value: string | string[];
  options: FilterOption[];
  onOperatorChange: (operator: SelectOperator) => void;
  onChange: (value: string | string[]) => void;
}

function SelectFilterInput({
  operator,
  value,
  options,
  onOperatorChange,
  onChange,
}: SelectFilterProps) {
  const isMultiSelect = operator === 'isAny';
  const selectedValues = Array.isArray(value) ? value : value ? [value] : [];

  const handleSingleSelect = (newValue: string) => {
    onChange(newValue);
  };

  const handleMultiSelectToggle = (optionValue: string) => {
    const currentValues = Array.isArray(value) ? value : [];
    const newValues = currentValues.includes(optionValue)
      ? currentValues.filter((v) => v !== optionValue)
      : [...currentValues, optionValue];
    onChange(newValues);
  };

  return (
    <>
      <Select value={operator} onValueChange={onOperatorChange}>
        <SelectTrigger className="h-8 w-[110px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SELECT_OPERATORS.map((op) => (
            <SelectItem key={op.value} value={op.value}>
              {op.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isMultiSelect ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-8 flex-1 justify-start font-normal">
              {selectedValues.length > 0 ? (
                <span className="truncate">
                  {selectedValues.length} selected
                  {selectedValues.length <= 2 &&
                    `: ${selectedValues.map((v) => options.find((o) => o.value === v)?.label || v).join(', ')}`}
                </span>
              ) : (
                <span className="text-muted-foreground">Select values...</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-2" align="start">
            <div className="space-y-1">
              {options.map((option) => {
                const isSelected = selectedValues.includes(option.value);
                return (
                  <div
                    key={option.value}
                    className="flex items-center space-x-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer"
                    onClick={() => handleMultiSelectToggle(option.value)}
                  >
                    <div
                      className={`size-4 border rounded flex items-center justify-center ${
                        isSelected
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-input'
                      }`}
                    >
                      {isSelected && <span className="text-xs">✓</span>}
                    </div>
                    <span className="text-sm">{option.label}</span>
                  </div>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      ) : (
        <Select
          value={Array.isArray(value) ? value[0] || '' : value}
          onValueChange={handleSingleSelect}
        >
          <SelectTrigger className="h-8 flex-1">
            <SelectValue placeholder="Select value..." />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </>
  );
}

// Comparison filter component for text/numeric values
interface ComparisonFilterProps {
  operator: FilterOperator;
  value: string;
  onOperatorChange: (operator: FilterOperator) => void;
  onValueChange: (value: string) => void;
}

function ComparisonFilterInput({
  operator,
  value,
  onOperatorChange,
  onValueChange,
}: ComparisonFilterProps) {
  return (
    <>
      <Select value={operator} onValueChange={onOperatorChange}>
        <SelectTrigger className="h-8 w-[110px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COMPARISON_OPERATORS.map((op) => (
            <SelectItem key={op.value} value={op.value}>
              {op.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        placeholder="Value..."
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className="h-8 flex-1"
      />
    </>
  );
}

export function DataTableFilter<TData>({ table }: DataTableFilterProps<TData>) {
  const [open, setOpen] = React.useState(false);
  const [activeFilters, setActiveFilters] = React.useState<ActiveFilter[]>([]);

  // Get filterable columns (exclude select column and hidden columns)
  const filterableColumns = React.useMemo(() => {
    return table
      .getAllColumns()
      .filter(
        (column) =>
          column.getCanFilter() &&
          column.id !== 'select' &&
          typeof column.columnDef.header === 'string',
      );
  }, [table]);

  const addFilter = () => {
    if (filterableColumns.length === 0) {
      return;
    }
    const firstColumn = filterableColumns[0];
    const { isSelectFilter } = getColumnMetadata(firstColumn.id);

    const newFilter: ActiveFilter = {
      id: crypto.randomUUID(),
      columnId: firstColumn.id,
      operator: isSelectFilter ? 'equals' : 'contains',
      value: isSelectFilter ? '' : '',
    };
    setActiveFilters((prevFilters) => [...prevFilters, newFilter]);
  };

  // Apply filter with operator
  const applyFilter = React.useCallback(
    (filter: ActiveFilter) => {
      const column = table.getColumn(filter.columnId);

      // Check if filter has a value (handle both string and array)
      const hasValue = Array.isArray(filter.value)
        ? filter.value.length > 0
        : Boolean(filter.value);

      if (!column || !hasValue) {
        column?.setFilterValue(undefined);
        return;
      }

      // Set filter value as object with operator info
      column.setFilterValue({ operator: filter.operator, value: filter.value });
    },
    [table],
  );

  const removeFilter = React.useCallback(
    (id: string) => {
      setActiveFilters((prevFilters) => {
        const filter = prevFilters.find((f) => f.id === id);
        const remainingFilters = prevFilters.filter((f) => f.id !== id);

        if (filter) {
          // Only clear column filter if no other filters reference this column
          queueMicrotask(() => {
            const otherFiltersOnSameColumn = remainingFilters.filter(
              (f) => f.columnId === filter.columnId,
            );
            if (otherFiltersOnSameColumn.length === 0) {
              const column = table.getColumn(filter.columnId);
              column?.setFilterValue(undefined);
            }
          });
        }
        return remainingFilters;
      });
    },
    [table],
  );

  const updateFilter = React.useCallback(
    (id: string, updates: Partial<ActiveFilter>) => {
      setActiveFilters((prevFilters) => {
        const updatedFilters = prevFilters.map((f) => {
          if (f.id === id) {
            return { ...f, ...updates };
          }
          return f;
        });

        // Apply the filter after state update (in a microtask to avoid setState during render)
        const updatedFilter = updatedFilters.find((f) => f.id === id);
        if (updatedFilter) {
          queueMicrotask(() => applyFilter(updatedFilter));
        }

        return updatedFilters;
      });
    },
    [applyFilter],
  );

  const clearAllFilters = React.useCallback(() => {
    setActiveFilters((prevFilters) => {
      // Clear all filters after state update
      queueMicrotask(() => {
        prevFilters.forEach((filter) => {
          const column = table.getColumn(filter.columnId);
          column?.setFilterValue(undefined);
        });
      });
      return [];
    });
  }, [table]);

  const activeFilterCount = activeFilters.filter((f) => {
    return Array.isArray(f.value) ? f.value.length > 0 : Boolean(f.value);
  }).length;

  // Helper to get column metadata
  const getColumnMetadata = React.useCallback(
    (columnId: string) => {
      const column = table.getColumn(columnId);
      const filterVariant = column?.columnDef.meta?.filterVariant as 'select' | undefined;
      const filterOptions = column?.columnDef.meta?.filterOptions as FilterOption[] | undefined;

      return {
        column,
        isSelectFilter: filterVariant === 'select' && filterOptions !== undefined,
        filterOptions: filterOptions || [],
      };
    },
    [table],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <Filter className="mr-2 size-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Filters</h4>
            {activeFilters.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear all
              </Button>
            )}
          </div>

          {activeFilters.length === 0 ? (
            <p className="text-sm text-muted-foreground">No filters applied</p>
          ) : (
            <div className="space-y-2">
              {activeFilters.map((filter) => {
                const { isSelectFilter, filterOptions } = getColumnMetadata(filter.columnId);

                return (
                  <div key={filter.id} className="flex items-center gap-1.5">
                    {/* Column selector */}
                    <Select
                      value={filter.columnId}
                      onValueChange={(value) => {
                        // Only clear old column filter if no other filters are using it
                        const otherFiltersOnSameColumn = activeFilters.filter(
                          (f) => f.id !== filter.id && f.columnId === filter.columnId,
                        );
                        if (otherFiltersOnSameColumn.length === 0) {
                          const oldColumn = table.getColumn(filter.columnId);
                          oldColumn?.setFilterValue(undefined);
                        }
                        // Update to new column
                        updateFilter(filter.id, { columnId: value, value: '' });
                      }}
                    >
                      <SelectTrigger className="h-8 w-[110px] shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {filterableColumns.map((column) => (
                          <SelectItem key={column.id} value={column.id}>
                            {typeof column.columnDef.header === 'string'
                              ? column.columnDef.header
                              : column.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Filter input - either select or comparison */}
                    {isSelectFilter ? (
                      <SelectFilterInput
                        operator={filter.operator as SelectOperator}
                        value={filter.value}
                        options={filterOptions}
                        onOperatorChange={(operator) => {
                          // When switching to/from isAny, reset value appropriately
                          const newValue =
                            operator === 'isAny'
                              ? Array.isArray(filter.value)
                                ? filter.value
                                : []
                              : Array.isArray(filter.value)
                                ? filter.value[0] || ''
                                : filter.value;
                          updateFilter(filter.id, { operator, value: newValue });
                        }}
                        onChange={(value) => {
                          updateFilter(filter.id, { value });
                        }}
                      />
                    ) : (
                      <ComparisonFilterInput
                        operator={filter.operator as ComparisonOperator}
                        value={typeof filter.value === 'string' ? filter.value : ''}
                        onOperatorChange={(operator) => {
                          updateFilter(filter.id, { operator });
                        }}
                        onValueChange={(value) => {
                          updateFilter(filter.id, { value });
                        }}
                      />
                    )}

                    {/* Remove button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFilter(filter.id)}
                      className="size-8 p-0 shrink-0"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={addFilter}
            className="w-full"
            disabled={filterableColumns.length === 0}
          >
            <Plus className="mr-2 size-4" />
            Add filter
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
