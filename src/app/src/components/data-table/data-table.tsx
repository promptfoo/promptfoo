import * as React from 'react';

import { Checkbox } from '@app/components/ui/checkbox';
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
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Search } from 'lucide-react';
import { DataTableHeaderFilter, operatorFilterFn } from './data-table-filter';
import { DataTablePagination } from './data-table-pagination';
import { DataTableToolbar } from './data-table-toolbar';
import type {
  ColumnDef,
  ColumnFiltersState,
  ColumnSizingState,
  ExpandedState,
  RowSelectionState,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table';

import type { DataTableProps } from './types';

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
  // manualPagination indicates parent-controlled pagination (typically server-side). We use
  // internal state only when manualPagination is false.
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
  const [internalRowSelection, setInternalRowSelection] = React.useState<RowSelectionState>({});
  const [expanded, setExpanded] = React.useState<ExpandedState>({});
  const [isPending, startTransition] = React.useTransition();
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

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
      if (manualPagination) {
        const newValue = typeof updater === 'function' ? updater(pagination) : updater;
        externalOnPaginationChange?.(newValue);
        return;
      }

      startTransition(() => {
        setInternalPagination(updater);
      });
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
            columnFilters={columnFilters}
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
            columnFilters={columnFilters}
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
            columnFilters={columnFilters}
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
              columnFilters={columnFilters}
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
                                  sortDirection
                                    ? 'text-blue-700 dark:text-blue-100 opacity-100'
                                    : 'text-zinc-400 dark:text-zinc-500 opacity-0 group-hover:opacity-100',
                                )}
                              >
                                {sortDirection === 'asc' ? (
                                  <ArrowUp className="size-4" />
                                ) : sortDirection === 'desc' ? (
                                  <ArrowDown className="size-4" />
                                ) : (
                                  <ArrowUpDown className="size-4" />
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
              if (manualPagination) {
                externalOnPageSizeChange?.(newPageSize);
                return;
              }

              startTransition(() => {
                setInternalPageSize(newPageSize);
              });
            }}
          />
        </div>
      )}
    </div>
  );
}
