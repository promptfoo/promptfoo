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
import { cn } from '@app/lib/utils';
import { Filter, Plus, X } from 'lucide-react';
import type { Column, ColumnFiltersState, Table } from '@tanstack/react-table';

interface DataTableFilterProps<TData> {
  table: Table<TData>;
  columnFilters: ColumnFiltersState;
}

export type ComparisonOperator =
  | 'contains'
  | 'equals'
  | 'startsWith'
  | 'endsWith'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte';

export type SelectOperator = 'equals' | 'notEquals' | 'isAny';

export type FilterOperator = ComparisonOperator | SelectOperator;

export const COMPARISON_OPERATORS: { value: ComparisonOperator; label: string }[] = [
  { value: 'contains', label: 'contains' },
  { value: 'equals', label: 'equals' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'endsWith', label: 'ends with' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
];

export const SELECT_OPERATORS: { value: SelectOperator; label: string }[] = [
  { value: 'equals', label: 'equals' },
  { value: 'notEquals', label: 'not equals' },
  { value: 'isAny', label: 'is any of' },
];

export interface FilterOption {
  label: string;
  value: string;
}

export const operatorFilterFn = (
  row: { getValue: (columnId: string) => unknown },
  columnId: string,
  filterValue: unknown,
): boolean => {
  if (!filterValue || typeof filterValue !== 'object') {
    return true;
  }

  const { operator, value } = filterValue as { operator: string; value: string | string[] };

  const hasValue = Array.isArray(value) ? value.length > 0 : Boolean(value);
  if (!hasValue) {
    return true;
  }

  const cellValue = row.getValue(columnId);
  const cellString = String(cellValue ?? '').toLowerCase();

  switch (operator) {
    case 'contains': {
      const filterString = String(value).toLowerCase();
      return cellString.includes(filterString);
    }
    case 'equals': {
      const filterString = String(value).toLowerCase();
      return cellString === filterString;
    }
    case 'startsWith': {
      const filterString = String(value).toLowerCase();
      return cellString.startsWith(filterString);
    }
    case 'endsWith': {
      const filterString = String(value).toLowerCase();
      return cellString.endsWith(filterString);
    }
    case 'gt': {
      const numCell = Number(cellValue);
      const numFilter = Number(value);
      return !isNaN(numCell) && !isNaN(numFilter) && numCell > numFilter;
    }
    case 'gte': {
      const numCell = Number(cellValue);
      const numFilter = Number(value);
      return !isNaN(numCell) && !isNaN(numFilter) && numCell >= numFilter;
    }
    case 'lt': {
      const numCell = Number(cellValue);
      const numFilter = Number(value);
      return !isNaN(numCell) && !isNaN(numFilter) && numCell < numFilter;
    }
    case 'lte': {
      const numCell = Number(cellValue);
      const numFilter = Number(value);
      return !isNaN(numCell) && !isNaN(numFilter) && numCell <= numFilter;
    }
    case 'notEquals': {
      const filterString = String(value).toLowerCase();
      return cellString !== filterString;
    }
    case 'isAny': {
      if (!Array.isArray(value)) {
        return false;
      }
      const filterValues = value.map((v) => String(v).toLowerCase());
      return filterValues.includes(cellString);
    }
    default:
      return cellString.includes(String(value).toLowerCase());
  }
};

export interface FilterMetadata {
  isSelectFilter: boolean;
  filterOptions: FilterOption[];
}

export const getFilterMetadata = <TData,>(column: Column<TData, unknown>): FilterMetadata => {
  const filterVariant = column.columnDef.meta?.filterVariant as 'select' | undefined;
  const filterOptions = column.columnDef.meta?.filterOptions as FilterOption[] | undefined;

  return {
    isSelectFilter: filterVariant === 'select' && filterOptions !== undefined,
    filterOptions: filterOptions ?? [],
  };
};

export interface HeaderFilterState {
  operator: FilterOperator;
  value: string | string[];
}

export function getHeaderFilterState<TData>(column: Column<TData, unknown>): HeaderFilterState {
  const { isSelectFilter } = getFilterMetadata(column);
  const defaultOperator: FilterOperator = isSelectFilter ? 'equals' : 'contains';
  const filterValue = column.getFilterValue();

  if (!filterValue || typeof filterValue !== 'object' || filterValue === null) {
    return { operator: defaultOperator, value: isSelectFilter ? '' : '' };
  }

  const { operator, value } = filterValue as {
    operator?: string;
    value?: string | string[];
  };

  if (isSelectFilter) {
    const safeOperator =
      operator === 'equals' || operator === 'notEquals' || operator === 'isAny'
        ? operator
        : 'equals';

    if (Array.isArray(value)) {
      return {
        operator: safeOperator,
        value: value.map((entry) => String(entry)),
      };
    }

    return {
      operator: safeOperator,
      value: typeof value === 'string' ? value : '',
    };
  }

  return {
    operator:
      operator === 'contains' ||
      operator === 'equals' ||
      operator === 'startsWith' ||
      operator === 'endsWith' ||
      operator === 'gt' ||
      operator === 'gte' ||
      operator === 'lt' ||
      operator === 'lte'
        ? (operator as ComparisonOperator)
        : 'contains',
    value: typeof value === 'string' ? value : '',
  };
}

const hasFilterValue = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'object' && value !== null) {
    const filterValue = value as { value?: string | string[] };
    return filterValue.value !== undefined && hasFilterValue(filterValue.value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  return Boolean(value);
};

const normalizeFilterValueForMatch = (value: string | string[]) => {
  return Array.isArray(value) ? [...value].map((entry) => String(entry)).sort() : [String(value)];
};

const isSameFilterValue = (left: string | string[], right: string | string[]): boolean => {
  const normalizedLeft = normalizeFilterValueForMatch(left);
  const normalizedRight = normalizeFilterValueForMatch(right);

  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((entry, index) => entry === normalizedRight[index])
  );
};

interface ActiveFilter {
  id: string;
  columnId: string;
  operator: FilterOperator;
  value: string | string[]; // Can be array for multi-select
}

interface ColumnFilterDisplay {
  id: string;
  columnId: string;
  columnHeader: string;
  operator: FilterOperator;
  value: string | string[];
  isSelectFilter: boolean;
  filterOptions: FilterOption[];
}

// Select filter component for discrete values
interface SelectFilterProps {
  operator: SelectOperator;
  value: string | string[];
  options: FilterOption[];
  onOperatorChange: (operator: SelectOperator) => void;
  onChange: (value: string | string[]) => void;
  disabled?: boolean;
}

function SelectFilterInput({
  operator,
  value,
  options,
  onOperatorChange,
  onChange,
  disabled = false,
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
      <Select value={operator} onValueChange={onOperatorChange} disabled={disabled}>
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
            <Button
              variant="outline"
              disabled={disabled}
              className="h-8 flex-1 justify-start font-normal"
            >
              {selectedValues.length > 0 ? (
                <span className="truncate">
                  {selectedValues.length} selected
                  {selectedValues.length <= 2 &&
                    `: ${selectedValues.map((v) => options.find((o) => o.value === v)?.label || v).join(', ')}`}
                </span>
              ) : (
                <span className="text-gray-500 dark:text-gray-400">Select values...</span>
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
          disabled={disabled}
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
  disabled?: boolean;
}

function ComparisonFilterInput({
  operator,
  value,
  onOperatorChange,
  onValueChange,
  disabled = false,
}: ComparisonFilterProps) {
  return (
    <>
      <Select value={operator} onValueChange={onOperatorChange} disabled={disabled}>
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
        disabled={disabled}
        className="h-8 flex-1"
      />
    </>
  );
}

export function DataTableHeaderFilter<TData>({ column }: { column: Column<TData, unknown> }) {
  const canFilter = column.getCanFilter();
  const { isSelectFilter, filterOptions } = getFilterMetadata(column);
  const { operator: initialOperator, value } = getHeaderFilterState(column);
  const [operator, setOperator] = React.useState<FilterOperator>(initialOperator);
  const hasActiveFilter = column.getIsFiltered();
  const [textValue, setTextValue] = React.useState<string>(typeof value === 'string' ? value : '');
  const [selectValue, setSelectValue] = React.useState<string>(
    Array.isArray(value) ? (value[0] ?? '') : typeof value === 'string' ? value : '',
  );
  const [multiSelectValues, setMultiSelectValues] = React.useState<string[]>(
    Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : [],
  );
  const [isMultiSelectOpen, setIsMultiSelectOpen] = React.useState<boolean>(false);
  const columnHeader =
    typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id;

  React.useEffect(() => {
    if (!isSelectFilter) {
      setTextValue(typeof value === 'string' ? value : '');
    } else if (isSelectFilter) {
      setSelectValue(
        Array.isArray(value) ? (value[0] ?? '') : typeof value === 'string' ? value : '',
      );
      setMultiSelectValues(
        Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : [],
      );
    }
  }, [isSelectFilter, value]);

  React.useEffect(() => {
    setOperator(initialOperator);
    setIsMultiSelectOpen(initialOperator === 'isAny');
  }, [initialOperator]);

  const setFilterValue = React.useCallback(
    (nextOperator: FilterOperator, nextValue: string | string[]) => {
      const nextHasValue = Array.isArray(nextValue) ? nextValue.length > 0 : Boolean(nextValue);

      if (nextOperator === 'isAny') {
        const nextValues = Array.isArray(nextValue) ? nextValue : nextValue ? [nextValue] : [];
        column.setFilterValue({ operator: nextOperator, value: nextValues });
        return;
      }

      if (!nextHasValue) {
        column.setFilterValue(undefined);
        return;
      }
      column.setFilterValue({ operator: nextOperator, value: nextValue });
    },
    [column],
  );

  if (!canFilter) {
    return null;
  }

  const handleClearFilter = () => {
    if (isSelectFilter) {
      setFilterValue('equals', '');
      setOperator('equals');
      setIsMultiSelectOpen(false);
      setMultiSelectValues([]);
      setSelectValue('');
    } else {
      setFilterValue('contains', '');
      setTextValue('');
    }
  };

  const handleOperatorChange = (nextOperator: FilterOperator) => {
    setOperator(nextOperator);
    setIsMultiSelectOpen(nextOperator === 'isAny');
    setMultiSelectValues(
      nextOperator === 'isAny'
        ? isSelectFilter && Array.isArray(value)
          ? value
          : isSelectFilter && typeof value === 'string' && value
            ? [value]
            : []
        : [],
    );
    const nextValue =
      isSelectFilter && nextOperator === 'isAny'
        ? Array.isArray(value)
          ? value
          : typeof value === 'string' && value
            ? [value]
            : []
        : Array.isArray(value)
          ? value[0] || ''
          : value;

    setFilterValue(nextOperator, nextValue);
  };

  const handleMultiSelectChange = (optionValue: string) => {
    const nextValues = multiSelectValues.includes(optionValue)
      ? multiSelectValues.filter((entry) => entry !== optionValue)
      : [...multiSelectValues, optionValue];
    setMultiSelectValues(nextValues);
    setFilterValue('isAny', nextValues);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Filter ${columnHeader}`}
          className={cn(
            'h-6 w-6 p-0 transition-opacity',
            hasActiveFilter
              ? 'text-blue-700 dark:text-blue-100 opacity-100'
              : 'text-zinc-400 dark:text-zinc-500 opacity-0 group-hover:opacity-100',
          )}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <Filter className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-fit min-w-[320px] max-w-[min(90vw,560px)] overflow-visible p-3"
        align="start"
      >
        <div className="space-y-3">
          <h4 className="text-sm font-medium truncate">{`Filter ${columnHeader}`}</h4>
          <div className="grid min-w-0 items-center gap-1.5 [grid-template-columns:110px_minmax(140px,1fr)_auto]">
            {isSelectFilter ? (
              <>
                <Select
                  value={operator}
                  onValueChange={(selectedOperator) =>
                    handleOperatorChange(selectedOperator as FilterOperator)
                  }
                >
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SELECT_OPERATORS.map((selectOperator) => (
                      <SelectItem key={selectOperator.value} value={selectOperator.value}>
                        {selectOperator.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {operator === 'isAny' ? (
                  <div className="relative min-w-0 w-full">
                    <Button
                      variant="outline"
                      className="h-8 w-full min-w-0 overflow-hidden justify-start font-normal"
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        setIsMultiSelectOpen(true);
                      }}
                    >
                      {multiSelectValues.length > 0 ? (
                        <span className="truncate">
                          {multiSelectValues.length} selected
                          {multiSelectValues.length <= 2 &&
                            `: ${multiSelectValues
                              .map(
                                (entry) =>
                                  filterOptions.find((option) => option.value === entry)?.label ||
                                  entry,
                              )
                              .join(', ')}`}
                        </span>
                      ) : (
                        <span className="text-zinc-500 dark:text-zinc-400">Select values...</span>
                      )}
                    </Button>
                    {isMultiSelectOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 w-full rounded-md border border-border bg-white dark:bg-zinc-900 shadow-md p-2 z-(--z-dropdown)">
                        <div className="space-y-1">
                          {filterOptions.map((option) => {
                            const isSelected = multiSelectValues.includes(option.value);

                            return (
                              <div
                                key={option.value}
                                role="menuitem"
                                className="flex items-center space-x-2 px-2 py-1.5 rounded-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleMultiSelectChange(option.value);
                                }}
                              >
                                <div
                                  className={`size-4 border rounded flex items-center justify-center ${
                                    isSelected
                                      ? 'bg-zinc-900 border-zinc-900 text-white dark:bg-zinc-100 dark:border-zinc-100 dark:text-zinc-900'
                                      : 'border-zinc-300 dark:border-zinc-600'
                                  }`}
                                >
                                  {isSelected && <span className="text-xs">✓</span>}
                                </div>
                                <span className="text-sm">{option.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <Select
                    value={selectValue}
                    onValueChange={(nextValue) => {
                      setSelectValue(nextValue);
                      setFilterValue(operator, nextValue);
                    }}
                  >
                    <SelectTrigger className="h-8 w-full min-w-0">
                      <SelectValue placeholder="Select value..." />
                    </SelectTrigger>
                    <SelectContent>
                      {filterOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </>
            ) : (
              <>
                <Select
                  value={operator}
                  onValueChange={(selectedOperator) =>
                    handleOperatorChange(selectedOperator as FilterOperator)
                  }
                >
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPARISON_OPERATORS.map((comparisonOperator) => (
                      <SelectItem key={comparisonOperator.value} value={comparisonOperator.value}>
                        {comparisonOperator.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Value..."
                  value={textValue}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setTextValue(nextValue);
                    setFilterValue(operator, nextValue);
                  }}
                  className="h-8 w-full min-w-0"
                />
              </>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilter}
              className="h-8 px-2 text-xs shrink-0 whitespace-nowrap"
            >
              Clear
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function DataTableFilter<TData>({ table, columnFilters }: DataTableFilterProps<TData>) {
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

  // Helper to get column metadata
  const getColumnMetadata = React.useCallback(
    (columnId: string) => {
      const column = table.getColumn(columnId);
      if (!column) {
        return {
          column,
          isSelectFilter: false,
          filterOptions: [],
        };
      }
      const { isSelectFilter, filterOptions } = getFilterMetadata(column);
      return {
        column,
        isSelectFilter,
        filterOptions,
      };
    },
    [table],
  );

  const createDefaultFilter = React.useCallback((): ActiveFilter | null => {
    if (filterableColumns.length === 0) {
      return null;
    }
    const firstColumn = filterableColumns[0];
    const { isSelectFilter } = getColumnMetadata(firstColumn.id);

    return {
      id: crypto.randomUUID(),
      columnId: firstColumn.id,
      operator: isSelectFilter ? 'equals' : 'contains',
      value: '',
    };
  }, [filterableColumns, getColumnMetadata]);

  const addFilter = React.useCallback(() => {
    const newFilter = createDefaultFilter();
    if (!newFilter) {
      return;
    }
    setActiveFilters((prevFilters) => [...prevFilters, newFilter]);
  }, [createDefaultFilter]);

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
    table.getAllColumns().forEach((column) => {
      if (column.getCanFilter()) {
        column.setFilterValue(undefined);
      }
    });
    setActiveFilters([]);
  }, [table]);

  const activeFilterCount = React.useMemo(() => {
    return columnFilters
      .map((filter) => ({
        column: table.getColumn(filter.id),
        filterValue: filter.value,
      }))
      .filter(({ column, filterValue }) => column?.getCanFilter() && hasFilterValue(filterValue))
      .length;
  }, [columnFilters, table]);

  const columnFiltersDisplay = React.useMemo(() => {
    return columnFilters
      .map((filterState): ColumnFilterDisplay | null => {
        const column = table.getColumn(filterState.id);
        if (!column || !column.getCanFilter()) {
          return null;
        }

        const { isSelectFilter, filterOptions } = getColumnMetadata(filterState.id);
        const filterValue = filterState.value;
        const defaultOperator: FilterOperator = isSelectFilter ? 'equals' : 'contains';
        const isRawObjectValue = filterValue !== null && typeof filterValue === 'object';

        const parsedOperator = (() => {
          if (!isRawObjectValue) {
            return defaultOperator;
          }

          const { operator } = filterValue as { operator?: FilterOperator };
          return isSelectFilter
            ? operator === 'equals' || operator === 'notEquals' || operator === 'isAny'
              ? operator
              : 'equals'
            : operator &&
                (operator === 'contains' ||
                  operator === 'equals' ||
                  operator === 'startsWith' ||
                  operator === 'endsWith' ||
                  operator === 'gt' ||
                  operator === 'gte' ||
                  operator === 'lt' ||
                  operator === 'lte')
              ? operator
              : 'contains';
        })();

        const rawValue = isRawObjectValue
          ? (filterValue as { value?: string | string[] }).value
          : filterValue;

        const hasValue = hasFilterValue(rawValue);
        if (!hasValue) {
          return null;
        }

        return {
          id: filterState.id,
          columnId: filterState.id,
          columnHeader:
            typeof column.columnDef.header === 'string' ? column.columnDef.header : filterState.id,
          operator: isSelectFilter ? parsedOperator : (parsedOperator as ComparisonOperator),
          value: Array.isArray(rawValue)
            ? rawValue.map((entry) => String(entry))
            : String(rawValue),
          isSelectFilter,
          filterOptions,
        };
      })
      .filter((filter) => filter !== null) as ColumnFilterDisplay[];
  }, [columnFilters, getColumnMetadata, table]);

  // Auto-add a filter row when popover opens with no existing filters
  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) {
        return;
      }

      if (columnFiltersDisplay.length > 0) {
        setActiveFilters(
          columnFiltersDisplay.map((filter) => ({
            id: `column-filter-${filter.id}`,
            columnId: filter.columnId,
            operator: filter.operator,
            value: filter.value,
          })),
        );
        return;
      }

      const defaultFilter = createDefaultFilter();
      setActiveFilters(defaultFilter ? [defaultFilter] : []);
    },
    [columnFiltersDisplay, createDefaultFilter],
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
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
      <PopoverContent className="w-[520px] p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Filters</h4>
            {(activeFilters.length > 0 || activeFilterCount > 0) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="h-auto px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-foreground"
              >
                Clear all
              </Button>
            )}
          </div>

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
            {columnFiltersDisplay
              .filter(
                (filter) =>
                  !activeFilters.find(
                    (activeFilter) =>
                      activeFilter.columnId === filter.columnId &&
                      activeFilter.operator === filter.operator &&
                      isSameFilterValue(activeFilter.value, filter.value),
                  ),
              )
              .map((filter) => (
                <div key={`column-${filter.id}`} className="flex items-center gap-1.5">
                  <div className="h-8 w-[110px] px-3 py-1.5 text-xs rounded-md border border-input bg-background shrink-0">
                    <span className="truncate">{filter.columnHeader}</span>
                  </div>
                  <div className="flex min-h-8 h-8 flex-1 items-center border rounded-md bg-gray-100/50 dark:bg-gray-800/50 px-3 text-sm">
                    {filter.isSelectFilter ? (
                      <span className="truncate">
                        {`${filter.operator} ${
                          Array.isArray(filter.value)
                            ? filter.value.length <= 2
                              ? filter.value
                                  .map(
                                    (entry) =>
                                      filter.filterOptions.find((option) => option.value === entry)
                                        ?.label || entry,
                                  )
                                  .join(', ')
                              : `${filter.value.length} selected`
                            : filter.value
                        }`}
                      </span>
                    ) : (
                      <span className="truncate">{`${filter.operator} ${filter.value}`}</span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => table.getColumn(filter.columnId)?.setFilterValue(undefined)}
                    className="size-8 p-0 shrink-0"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
          </div>

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
