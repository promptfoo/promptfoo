import * as React from 'react';

import { Checkbox } from '@app/components/ui/checkbox';
import { Spinner } from '@app/components/ui/spinner';
import { cn } from '@app/lib/utils';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { DataTablePagination } from './data-table-pagination';
import { DataTableToolbar } from './data-table-toolbar';
import type {
  ColumnDef,
  ColumnFiltersState,
  ColumnSizingState,
  RowSelectionState,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table';

import type { DataTableProps } from './types';

// Custom filter function that handles operator-based filtering
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
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(initialColumnVisibility);
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({});
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: initialPageSize });
  const [internalRowSelection, setInternalRowSelection] = React.useState<RowSelectionState>({});
  const [isPending, startTransition] = React.useTransition();
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

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
      size: 48,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
    }),
    [],
  );

  // Prepend selection column when enabled
  const allColumns = React.useMemo(() => {
    if (enableRowSelection) {
      return [selectionColumn, ...columns];
    }
    return columns;
  }, [enableRowSelection, selectionColumn, columns]);

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
    },
    enableRowSelection,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    filterFns: {
      operator: operatorFilterFn,
    },
    globalFilterFn: 'includesString',
    onRowSelectionChange: handleRowSelectionChange,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: (updater) => {
      startTransition(() => {
        setPagination(updater);
      });
    },
    getRowId: (row, index) => (getRowId ? getRowId(row) : String(index)),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

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
          <p className="text-sm text-muted-foreground">Loading data...</p>
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
        <div className="flex flex-col items-center justify-center h-[400px] gap-3 rounded-xl bg-destructive/10 border border-destructive/20">
          <AlertTriangle className="size-12 text-destructive" />
          <h3 className="text-lg font-semibold text-destructive">Error loading data</h3>
          <p className="text-sm text-muted-foreground max-w-md text-center">{error}</p>
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
        <div className="flex flex-col items-center justify-center h-[400px] gap-3 rounded-xl bg-muted/50">
          <Search className="size-12 text-muted-foreground" />
          <h3 className="text-lg font-semibold">No data found</h3>
          <p className="text-sm text-muted-foreground max-w-md text-center">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-3 flex-1 min-h-0', className)}>
      <div
        className={cn(
          'rounded-lg border border-border bg-white dark:bg-zinc-900 flex-1 min-h-0 flex flex-col',
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
          className="overflow-auto flex-1 min-h-0"
          style={maxHeight ? { maxHeight } : undefined}
        >
          <table className="w-full print:text-black" style={{ tableLayout: 'fixed' }}>
            <thead className="bg-zinc-50 dark:bg-zinc-800 sticky top-0 z-10 print:bg-zinc-50">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-border print:border-gray-300">
                  {headerGroup.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const sortDirection = header.column.getIsSorted();
                    const canResize = header.column.getCanResize();
                    const align = header.column.columnDef.meta?.align ?? 'left';
                    const isRightAligned = align === 'right';

                    return (
                      <th
                        key={header.id}
                        className={cn(
                          'group py-3 text-sm font-semibold relative',
                          isRightAligned ? 'text-right' : 'text-left',
                          header.column.id === 'select' ? 'px-3' : 'px-4 overflow-hidden',
                          canSort && 'cursor-pointer select-none hover:bg-muted/80',
                        )}
                        style={{
                          width: header.getSize(),
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
                                  <ArrowUpDown className="size-4 text-muted-foreground/50" />
                                )}
                              </span>
                            )}
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
                                'h-[calc(100%-22px)] w-[1.5px] rounded-sm bg-muted-foreground/50 transition-all duration-200',
                                'group-hover/resize:w-[3px] group-hover/resize:bg-primary group-hover/resize:rounded',
                                header.column.getIsResizing() && 'w-[3px] bg-primary/70 rounded',
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
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick?.(row.original)}
                    className={cn(
                      'border-b border-border transition-colors print:border-gray-300',
                      onRowClick && 'cursor-pointer hover:bg-muted/50',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const cellAlign = cell.column.columnDef.meta?.align ?? 'left';
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            'py-3 text-sm',
                            cell.column.id === 'select'
                              ? 'px-3 cursor-pointer'
                              : 'px-4 overflow-hidden text-ellipsis',
                            cellAlign === 'right' && 'text-right',
                          )}
                          style={{ width: cell.column.getSize() }}
                          onClick={
                            cell.column.id === 'select'
                              ? (e) => {
                                  e.stopPropagation();
                                  row.toggleSelected();
                                }
                              : undefined
                          }
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={allColumns.length} className="h-[200px] text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Search className="size-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">No results match your search</p>
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
            totalRows={table.getFilteredRowModel().rows.length}
            onPageSizeChange={(newPageSize) => {
              startTransition(() => {
                setPagination((prev) => ({ ...prev, pageSize: newPageSize, pageIndex: 0 }));
              });
            }}
          />
        </div>
      )}
    </div>
  );
}
