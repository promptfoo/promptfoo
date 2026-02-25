import * as React from 'react';

import { Button } from '@app/components/ui/button';
import { Checkbox } from '@app/components/ui/checkbox';
import { Input } from '@app/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@app/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Spinner } from '@app/components/ui/spinner';
import { useIsPrinting } from '@app/hooks/useIsPrinting';
import { cn } from '@app/lib/utils';
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  Filter,
  Search,
} from 'lucide-react';
import { DataTablePagination } from './data-table-pagination';
import { DataTableToolbar } from './data-table-toolbar';
import type {
  Column,
  ColumnDef,
  ColumnFiltersState,
  ColumnSizingState,
  ExpandedState,
  RowSelectionState,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table';

import type { DataTableProps } from './types';

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

type FilterVariant = 'select';
interface FilterOption {
  label: string;
  value: string;
}

const operatorFilterFn = (
  row: { getValue: (columnId: string) => unknown },
  columnId: string,
  filterValue: unknown,
): boolean => {
  if (!filterValue || typeof filterValue !== 'object') {
    return true;
  }

  const { operator, value } = filterValue as { operator: string; value: string | string[] };

  // Handle empty values (both string and array)
  const hasValue = Array.isArray(value) ? value.length > 0 : Boolean(value);
  if (!hasValue) {
    return true;
  }

  const cellValue = row.getValue(columnId);
  const cellString = String(cellValue ?? '').toLowerCase();

  switch (operator) {
    // Text comparison operators
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

    // Numeric comparison operators
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

    // Select filter operators
    case 'notEquals': {
      const filterString = String(value).toLowerCase();
      return cellString !== filterString;
    }
    case 'isAny': {
      // For multi-select, check if cell value matches any of the selected values
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

const getHeaderLabel = <TData, TValue = unknown>(
  header: ColumnDef<TData, TValue>['header'],
  columnId: string,
): string => {
  return typeof header === 'string' ? header : columnId;
};

const getFilterMetadata = <TData,>(column: Column<TData, unknown>) => {
  const filterVariant = column.columnDef.meta?.filterVariant as FilterVariant | undefined;
  const filterOptions = column.columnDef.meta?.filterOptions as FilterOption[] | undefined;

  return {
    isSelectFilter: filterVariant === 'select' && filterOptions !== undefined,
    filterOptions: filterOptions ?? [],
  };
};

interface HeaderFilterState {
  operator: FilterOperator;
  value: string | string[];
}

const getHeaderFilterState = <TData,>(column: Column<TData, unknown>): HeaderFilterState => {
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
};

function DataTableHeaderFilter<TData>({ column }: { column: Column<TData, unknown> }) {
  const canFilter = column.getCanFilter();
  const { isSelectFilter, filterOptions } = getFilterMetadata(column);
  const { operator, value } = getHeaderFilterState(column);
  const columnHeader = getHeaderLabel(column.columnDef.header, column.id);
  const hasValue = Array.isArray(value) ? value.length > 0 : Boolean(value);

  const setFilterValue = React.useCallback(
    (nextOperator: FilterOperator, nextValue: string | string[]) => {
      const nextHasValue = Array.isArray(nextValue) ? nextValue.length > 0 : Boolean(nextValue);
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
    } else {
      setFilterValue('contains', '');
    }
  };

  const handleOperatorChange = (nextOperator: FilterOperator) => {
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

  const multiSelectValues = React.useMemo(() => {
    if (Array.isArray(value)) {
      return value;
    }
    return typeof value === 'string' && value ? [value] : [];
  }, [value]);

  const singleSelectValue = React.useMemo(() => {
    if (Array.isArray(value)) {
      return value[0] ?? '';
    }
    return value;
  }, [value]);

  const handleMultiSelectChange = (optionValue: string) => {
    const nextValues = multiSelectValues.includes(optionValue)
      ? multiSelectValues.filter((entry) => entry !== optionValue)
      : [...multiSelectValues, optionValue];
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
            hasValue
              ? 'text-zinc-900 dark:text-zinc-100 opacity-100'
              : 'text-zinc-400 dark:text-zinc-500 opacity-0 group-hover:opacity-100',
          )}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <Filter className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] overflow-hidden p-3" align="start">
        <div className="space-y-3">
          <h4 className="text-sm font-medium truncate">{`Filter ${columnHeader}`}</h4>
          <div className="flex min-w-0 items-center gap-1.5">
            {isSelectFilter ? (
              <>
                <Select
                  value={operator}
                  onValueChange={(selectedOperator) =>
                    handleOperatorChange(selectedOperator as FilterOperator)
                  }
                >
                  <SelectTrigger className="h-8 w-[110px] shrink-0">
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
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-8 flex-1 min-w-0 overflow-hidden justify-start font-normal"
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
                    </PopoverTrigger>
                    <PopoverContent className="w-[200px] p-2" align="start">
                      <div className="space-y-1">
                        {filterOptions.map((option) => {
                          const isSelected = multiSelectValues.includes(option.value);

                          return (
                            <div
                              key={option.value}
                              className="flex items-center space-x-2 px-2 py-1.5 rounded-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                              onClick={() => handleMultiSelectChange(option.value)}
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
                    </PopoverContent>
                  </Popover>
                ) : (
                  <Select
                    value={singleSelectValue}
                    onValueChange={setFilterValue.bind(null, operator)}
                  >
                    <SelectTrigger className="h-8 flex-1 min-w-0">
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
                  <SelectTrigger className="h-8 w-[110px] shrink-0">
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
                  value={typeof value === 'string' ? value : ''}
                  onChange={(event) => setFilterValue(operator, event.target.value)}
                  className="h-8 flex-1 min-w-0"
                />
              </>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilter}
              className="h-8 px-2 text-xs shrink-0"
            >
              Clear
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function DataTable<TData, TValue = unknown>({
  columns,
  data,
  isLoading = false,
  error = null,
  onRowClick,
  emptyMessage = 'No results found',
  className,
  initialSorting = [],
  onExportCSV,
  onExportJSON,
  showToolbar = true,
  showColumnToggle = true,
  showFilter = true,
  showExport = true,
  showPagination = true,
  initialPageSize = 25,
  enableRowSelection = false,
  rowSelection: controlledRowSelection,
  onRowSelectionChange,
  getRowId,
  toolbarActions,
  maxHeight,
  initialColumnVisibility = {},
  manualPagination = false,
  pageCount: externalPageCount,
  pageIndex: externalPageIndex,
  pageSize: externalPageSize,
  onPaginationChange: externalOnPaginationChange,
  onPageSizeChange: externalOnPageSizeChange,
  rowCount,
  renderSubComponent,
  singleExpand = false,
  getRowCanExpand: getRowCanExpandProp,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(initialColumnVisibility);
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({});
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [internalPagination, setInternalPagination] = React.useState({
    pageIndex: 0,
    pageSize: initialPageSize,
  });
  const pagination = manualPagination
    ? {
        pageIndex: externalPageIndex ?? internalPagination.pageIndex,
        pageSize: externalPageSize ?? internalPagination.pageSize,
      }
    : internalPagination;
  const setInternalPageSize = React.useCallback((pageSize: number) => {
    setInternalPagination((prev: { pageIndex: number; pageSize: number }) => ({
      ...prev,
      pageSize,
      pageIndex: 0,
    }));
  }, []);
  const hasWarnedMissingManualPaginationHandler = React.useRef(false);
  const hasWarnedMissingManualPageSizeHandler = React.useRef(false);
  const [internalRowSelection, setInternalRowSelection] = React.useState<RowSelectionState>({});
  const [expanded, setExpanded] = React.useState<ExpandedState>({});
  const [isPending, startTransition] = React.useTransition();
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  if (manualPagination && rowCount === undefined) {
    console.warn(
      '[DataTable] `rowCount` is required when `manualPagination` is enabled but was not provided.',
    );
  }

  // Detect print mode to show all rows when printing
  const isPrinting = useIsPrinting();

  // Scroll to top when page changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  React.useEffect(() => {
    scrollContainerRef.current?.scrollTo?.({ top: 0 });
  }, [pagination.pageIndex]);

  // Use controlled or internal row selection state
  const rowSelection = controlledRowSelection ?? internalRowSelection;
  const handleRowSelectionChange = React.useCallback(
    (updaterOrValue: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) => {
      const newValue =
        typeof updaterOrValue === 'function' ? updaterOrValue(rowSelection) : updaterOrValue;
      if (onRowSelectionChange) {
        onRowSelectionChange(newValue);
      } else {
        setInternalRowSelection(newValue);
      }
    },
    [onRowSelectionChange, rowSelection],
  );

  // Create checkbox column for row selection (selects ALL rows, not just current page)
  const selectionColumn: ColumnDef<TData, unknown> = React.useMemo(
    () => ({
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllRowsSelected()}
          indeterminate={table.getIsSomeRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onChange={row.getToggleSelectedHandler()}
          aria-label="Select row"
        />
      ),
      size: 20,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
    }),
    [],
  );

  // Create chevron column for row expansion
  const expansionColumn: ColumnDef<TData, unknown> = React.useMemo(
    () => ({
      id: 'expand',
      header: () => null,
      cell: ({ row }) => {
        if (!row.getCanExpand()) {
          return null;
        }
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              row.toggleExpanded();
            }}
            aria-label="Expand row"
            className="flex items-center justify-center size-6 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <ChevronRight
              className={cn(
                'size-4 transition-transform duration-200',
                row.getIsExpanded() && 'rotate-90',
              )}
            />
          </button>
        );
      },
      size: 40,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
    }),
    [],
  );

  // Prepend selection and/or expansion columns when enabled
  const allColumns = React.useMemo(() => {
    const cols = [...columns];
    if (renderSubComponent) {
      cols.unshift(expansionColumn);
    }
    if (enableRowSelection) {
      cols.unshift(selectionColumn);
    }
    return cols;
  }, [enableRowSelection, selectionColumn, renderSubComponent, expansionColumn, columns]);

  const table = useReactTable({
    data,
    columns: allColumns,
    defaultColumn: {
      filterFn: operatorFilterFn,
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      columnSizing,
      globalFilter,
      pagination,
      rowSelection,
      expanded,
    },
    enableRowSelection,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    filterFns: {
      operator: operatorFilterFn,
    },
    globalFilterFn: 'includesString',
    onRowSelectionChange: handleRowSelectionChange,
    onExpandedChange: (updater) => {
      setExpanded((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        if (!singleExpand || typeof next === 'boolean') {
          return next;
        }
        // In singleExpand mode, keep only the newly expanded row
        if (typeof prev !== 'boolean' && typeof next !== 'boolean') {
          const newKeys = Object.keys(next).filter((k) => !prev[k] && next[k]);
          if (newKeys.length > 0) {
            return { [newKeys[0]]: true };
          }
        }
        return next;
      });
    },
    getRowCanExpand: getRowCanExpandProp ?? (renderSubComponent ? () => true : undefined),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: (updater) => {
      if (manualPagination && externalOnPaginationChange) {
        const newValue = typeof updater === 'function' ? updater(pagination) : updater;
        externalOnPaginationChange(newValue);
      } else {
        if (
          manualPagination &&
          import.meta.env.DEV &&
          !hasWarnedMissingManualPaginationHandler.current
        ) {
          console.warn(
            'DataTable is in manualPagination mode but onPaginationChange was not provided. ' +
              'Falling back to internal pagination state and table UI may not remain in sync with server data.',
          );
          hasWarnedMissingManualPaginationHandler.current = true;
        }
        startTransition(() => {
          setInternalPagination(updater);
        });
      }
    },
    ...(manualPagination ? { manualPagination: true, pageCount: externalPageCount ?? -1 } : {}),
    getRowId: (row, index) => (getRowId ? getRowId(row) : String(index)),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(manualPagination ? {} : { getPaginationRowModel: getPaginationRowModel() }),
    ...(renderSubComponent ? { getExpandedRowModel: getExpandedRowModel() } : {}),
  });

  const tableMinWidth = table.getTotalSize() ? `${table.getTotalSize()}px` : undefined;
  const totalRows = manualPagination ? (rowCount ?? 0) : table.getFilteredRowModel().rows.length;

  // When printing, show all rows instead of just the current page
  const rows = isPrinting ? table.getPrePaginationRowModel().rows : table.getRowModel().rows;

  if (isLoading) {
    return (
      <div className={cn('space-y-4 pb-4', className)}>
        {showToolbar && toolbarActions && (
          <DataTableToolbar
            table={table}
            globalFilter={globalFilter}
            setGlobalFilter={setGlobalFilter}
            showColumnToggle={false}
            showFilter={false}
            showExport={false}
            toolbarActions={toolbarActions}
          />
        )}
        <div className="flex flex-col items-center justify-center h-[400px] gap-3">
          <Spinner className="size-8" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('space-y-4 pb-4', className)}>
        {showToolbar && toolbarActions && (
          <DataTableToolbar
            table={table}
            globalFilter={globalFilter}
            setGlobalFilter={setGlobalFilter}
            showColumnToggle={false}
            showFilter={false}
            showExport={false}
            toolbarActions={toolbarActions}
          />
        )}
        <div className="flex flex-col items-center justify-center h-[400px] gap-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50">
          <AlertTriangle className="size-12 text-red-600 dark:text-red-400" />
          <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">
            Error loading data
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md text-center">{error}</p>
        </div>
      </div>
    );
  }

  const hasData = table.getRowModel().rows.length > 0;
  const hasActiveFilters = globalFilter || columnFilters.length > 0;

  // Show initial empty state only when there's no data AND no active filters
  // If filters are active but return no results, we show the table with "no results" message
  // so users can still access the toolbar to clear/modify their filters
  if (!hasData && !hasActiveFilters) {
    return (
      <div className={cn('space-y-4 pb-4', className)}>
        {showToolbar && toolbarActions && (
          <DataTableToolbar
            table={table}
            globalFilter={globalFilter}
            setGlobalFilter={setGlobalFilter}
            showColumnToggle={false}
            showFilter={false}
            showExport={false}
            toolbarActions={toolbarActions}
          />
        )}
        <div className="flex flex-col items-center justify-center h-[400px] gap-3 rounded-xl bg-zinc-100/50 dark:bg-zinc-800/50">
          <Search className="size-12 text-zinc-400 dark:text-zinc-500" />
          <h3 className="text-lg font-semibold">No data found</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md text-center">
            {emptyMessage}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-3 flex-1 min-h-0', className)}>
      <div
        className={cn(
          'rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex-1 min-h-0 flex flex-col',
          'print:bg-white print:border-gray-300',
        )}
      >
        {showToolbar && (
          <div className="shrink-0 print:hidden">
            <DataTableToolbar
              table={table}
              globalFilter={globalFilter}
              setGlobalFilter={setGlobalFilter}
              showColumnToggle={showColumnToggle}
              showFilter={showFilter}
              showExport={showExport}
              onExportCSV={onExportCSV}
              onExportJSON={onExportJSON}
              toolbarActions={toolbarActions}
            />
          </div>
        )}

        <div
          ref={scrollContainerRef}
          className="overflow-auto flex-1 min-h-0 print:overflow-visible print:max-h-none print:flex-none"
          style={maxHeight ? { maxHeight } : undefined}
        >
          <table
            className="w-full print:text-black"
            style={{
              tableLayout: 'fixed',
              ...(tableMinWidth ? { minWidth: tableMinWidth } : {}),
            }}
          >
            <thead className="bg-zinc-50 dark:bg-zinc-800 sticky top-0 z-10 print:bg-zinc-50">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr
                  key={headerGroup.id}
                  className="border-b border-zinc-200 dark:border-zinc-800 print:border-gray-300"
                >
                  {headerGroup.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const sortDirection = header.column.getIsSorted();
                    const canResize = header.column.getCanResize();
                    const canFilter = header.column.getCanFilter();
                    const align = header.column.columnDef.meta?.align ?? 'left';
                    const isRightAligned = align === 'right';
                    const headerSize = `${header.getSize()}px`;

                    return (
                      <th
                        key={header.id}
                        className={cn(
                          'group py-3 text-sm font-medium relative',
                          isRightAligned ? 'text-right' : 'text-left',
                          header.column.id === 'select' || header.column.id === 'expand'
                            ? 'px-3'
                            : 'px-4 overflow-hidden',
                          canSort && 'cursor-pointer select-none',
                        )}
                        style={{
                          width: headerSize,
                          minWidth: headerSize,
                          maxWidth: headerSize,
                        }}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {header.isPlaceholder ? null : (
                          <div
                            className={cn(
                              'flex items-center gap-1 min-w-0',
                              isRightAligned && 'flex-row-reverse',
                            )}
                          >
                            <span className="truncate">
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </span>
                            {canSort && (
                              <span
                                className={cn(
                                  'shrink-0 transition-opacity',
                                  !sortDirection && 'opacity-0 group-hover:opacity-100',
                                )}
                              >
                                {sortDirection === 'asc' ? (
                                  <ArrowUp className="size-4" />
                                ) : sortDirection === 'desc' ? (
                                  <ArrowDown className="size-4" />
                                ) : (
                                  <ArrowUpDown className="size-4 text-zinc-400 dark:text-zinc-500" />
                                )}
                              </span>
                            )}
                            {canFilter && <DataTableHeaderFilter column={header.column} />}
                          </div>
                        )}
                        {/* Column resize handle */}
                        {canResize && (
                          <div
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                            onClick={(e) => e.stopPropagation()}
                            className="group/resize absolute -right-[5px] top-0 z-[1] h-full w-[10px] cursor-col-resize select-none touch-none flex items-center justify-center"
                          >
                            <div
                              className={cn(
                                'h-[calc(100%-22px)] w-[1.5px] rounded-sm bg-zinc-300 dark:bg-zinc-600 transition-all duration-200',
                                'group-hover/resize:w-[3px] group-hover/resize:bg-zinc-500 dark:group-hover/resize:bg-zinc-400 group-hover/resize:rounded',
                                header.column.getIsResizing() &&
                                  'w-[3px] bg-zinc-500/70 dark:bg-zinc-400/70 rounded',
                              )}
                            />
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className={cn(isPending && 'opacity-60 transition-opacity')}>
              {hasData ? (
                // When printing, show all rows instead of just the current page
                rows.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr
                      onClick={() => {
                        if (onRowClick) {
                          onRowClick(row.original);
                        } else if (renderSubComponent && row.getCanExpand()) {
                          row.toggleExpanded();
                        }
                      }}
                      className={cn(
                        'border-b border-zinc-200 dark:border-zinc-800 last:border-b-0 transition-colors print:border-gray-300',
                        (onRowClick || (renderSubComponent && row.getCanExpand())) &&
                          'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50',
                      )}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const cellAlign = cell.column.columnDef.meta?.align ?? 'left';
                        const cellSize = `${cell.column.getSize()}px`;
                        const isUtilityColumn =
                          cell.column.id === 'select' || cell.column.id === 'expand';

                        return (
                          <td
                            key={cell.id}
                            className={cn(
                              'py-3 text-sm',
                              isUtilityColumn
                                ? cn('px-3', cell.column.id === 'select' && 'cursor-pointer')
                                : 'px-4 overflow-hidden text-ellipsis',
                              cellAlign === 'right' && 'text-right',
                            )}
                            style={{
                              width: cellSize,
                              minWidth: cellSize,
                              maxWidth: cellSize,
                            }}
                            onClick={
                              cell.column.id === 'select'
                                ? (e) => {
                                    e.stopPropagation();
                                    row.toggleSelected();
                                  }
                                : undefined
                            }
                          >
                            {isUtilityColumn ? (
                              flexRender(cell.column.columnDef.cell, cell.getContext())
                            ) : (
                              <div className="overflow-hidden min-w-0">
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    {renderSubComponent && row.getIsExpanded() && (
                      <tr className="bg-zinc-100/30 dark:bg-zinc-800/30">
                        <td colSpan={allColumns.length} className="p-4">
                          {renderSubComponent(row)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              ) : (
                <tr>
                  <td colSpan={allColumns.length} className="h-[200px] text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Search className="size-8 text-zinc-400 dark:text-zinc-500" />
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        No results match your search
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showPagination && hasData && (
        <div className="shrink-0 print:hidden">
          <DataTablePagination
            table={table}
            pageIndex={pagination.pageIndex}
            pageSize={pagination.pageSize}
            pageCount={table.getPageCount()}
            totalRows={totalRows}
            onPageSizeChange={(newPageSize) => {
              if (manualPagination && externalOnPageSizeChange) {
                externalOnPageSizeChange(newPageSize);
              } else {
                if (
                  manualPagination &&
                  import.meta.env.DEV &&
                  !hasWarnedMissingManualPageSizeHandler.current
                ) {
                  console.warn(
                    'DataTable is in manualPagination mode but onPageSizeChange was not provided. ' +
                      'Falling back to internal pagination state and table UI may not remain in sync with server data.',
                  );
                  hasWarnedMissingManualPageSizeHandler.current = true;
                }
                startTransition(() => {
                  setInternalPageSize(newPageSize);
                });
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
