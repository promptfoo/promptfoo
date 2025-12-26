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
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({});
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: initialPageSize });
  const [internalRowSelection, setInternalRowSelection] = React.useState<RowSelectionState>({});

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
      size: 40,
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
    onPaginationChange: setPagination,
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] gap-3">
        <Spinner className="h-8 w-8" />
        <p className="text-sm text-muted-foreground">Loading data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] gap-3 rounded-xl bg-destructive/10 border border-destructive/20">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <h3 className="text-lg font-semibold text-destructive">Error loading data</h3>
        <p className="text-sm text-muted-foreground max-w-md text-center">{error}</p>
      </div>
    );
  }

  const hasData = table.getRowModel().rows.length > 0;

  if (!hasData && !globalFilter) {
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
          <Search className="h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-semibold">No data found</h3>
          <p className="text-sm text-muted-foreground max-w-md text-center">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4 pb-4', className)}>
      {showToolbar && (
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
      )}

      <div className="rounded-lg border border-border overflow-hidden bg-white dark:bg-zinc-900">
        <table className="w-full" style={{ tableLayout: 'fixed' }}>
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border">
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortDirection = header.column.getIsSorted();
                  const canResize = header.column.getCanResize();

                  return (
                    <th
                      key={header.id}
                      className={cn(
                        'px-4 py-3 text-left text-sm font-semibold relative',
                        canSort && 'cursor-pointer select-none hover:bg-muted/80',
                      )}
                      style={{
                        width: header.getSize(),
                      }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {header.isPlaceholder ? null : (
                        <div className="flex items-center gap-1">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort && (
                            <span className="ml-1">
                              {sortDirection === 'asc' ? (
                                <ArrowUp className="h-4 w-4" />
                              ) : sortDirection === 'desc' ? (
                                <ArrowDown className="h-4 w-4" />
                              ) : (
                                <ArrowUpDown className="h-4 w-4 text-muted-foreground/50" />
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
                          className={cn(
                            'absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none',
                            'hover:bg-primary/50',
                            header.column.getIsResizing() && 'bg-primary',
                          )}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {hasData ? (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  className={cn(
                    'border-b border-border transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-muted/50',
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        'px-4 py-3 text-sm overflow-hidden text-ellipsis',
                        cell.column.id === 'select' && 'cursor-pointer',
                      )}
                      style={{ width: cell.column.getSize() }}
                      onClick={cell.column.id === 'select' ? (e) => e.stopPropagation() : undefined}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={allColumns.length} className="h-[200px] text-center">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Search className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No results match your search</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showPagination && hasData && <DataTablePagination table={table} />}
    </div>
  );
}
