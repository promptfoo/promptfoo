import * as React from 'react';

import { Button } from '@app/components/ui/button';
import { Checkbox } from '@app/components/ui/checkbox';
import { Skeleton } from '@app/components/ui/skeleton';
import { Spinner } from '@app/components/ui/spinner';
import { useIsPrinting } from '@app/hooks/useIsPrinting';
import { cn } from '@app/lib/utils';
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Search } from 'lucide-react';
import { DataTableHeaderFilter, operatorFilterFn } from './data-table-filter';
import { DataTableToolbar } from './data-table-toolbar';
import type {
  ColumnDef,
  ColumnFiltersState,
  ColumnSizingState,
  ExpandedState,
  Header,
  Row,
  RowSelectionState,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table';

import type { DataTableProps } from './types';

const UTILITY_COLUMN_IDS = new Set(['select', 'expand']);

type RowDisplayMode = 'client-virtualized' | 'server-virtualized';

type DataTableHeaderActionsProps<TData, TValue> = {
  canFilter: boolean;
  canSort: boolean;
  header: Header<TData, TValue>;
  isFiltered: boolean;
  isRightAligned: boolean;
  sortDirection: false | 'asc' | 'desc';
};

type DataTableHeaderSortButtonProps = {
  onToggleSorting?: (event: unknown) => void;
  sortDirection: false | 'asc' | 'desc';
};

function renderDataTableHeaderSortButton({
  onToggleSorting,
  sortDirection,
}: DataTableHeaderSortButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        'h-6 w-6 p-0',
        sortDirection ? 'text-blue-700 dark:text-blue-100' : 'text-zinc-400 dark:text-zinc-500',
      )}
      onClick={(e) => {
        e.stopPropagation();
        onToggleSorting?.(e);
      }}
    >
      {sortDirection === 'asc' ? (
        <ArrowUp className="size-4" />
      ) : sortDirection === 'desc' ? (
        <ArrowDown className="size-4" />
      ) : (
        <ArrowUpDown className="size-4" />
      )}
    </Button>
  );
}

function renderDataTableHeaderActions<TData, TValue>({
  canFilter,
  canSort,
  header,
  isFiltered,
  isRightAligned,
  sortDirection,
}: DataTableHeaderActionsProps<TData, TValue>) {
  if (!canSort && !canFilter) {
    return null;
  }

  return (
    <span
      className={cn(
        'absolute top-1/2 -translate-y-1/2 flex items-center gap-0.5',
        'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity',
        'bg-inherit',
        isRightAligned ? 'left-0 pr-1' : 'right-0 pl-1',
        (sortDirection || isFiltered) && 'opacity-100 pointer-events-auto',
      )}
    >
      {canSort &&
        renderDataTableHeaderSortButton({
          onToggleSorting: header.column.getToggleSortingHandler(),
          sortDirection,
        })}
      {canFilter && <DataTableHeaderFilter column={header.column} />}
    </span>
  );
}

function renderDataTableHeaderResizeHandle<TData, TValue>(header: Header<TData, TValue>) {
  if (!header.column.getCanResize()) {
    return null;
  }

  return (
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
          header.column.getIsResizing() && 'w-[3px] bg-zinc-500/70 dark:bg-zinc-400/70 rounded',
        )}
      />
    </div>
  );
}

function renderDataTableHeaderCell<TData, TValue = unknown>(
  header: Header<TData, TValue>,
  showFilter = true,
) {
  const canSort = header.column.getCanSort();
  const canFilter = showFilter && header.column.getCanFilter();
  const isFiltered = header.column.getIsFiltered();
  const isRightAligned = header.column.columnDef.meta?.align === 'right';
  const sortDirection = header.column.getIsSorted();
  const headerSize = `${header.getSize()}px`;
  const isUtilityColumn = UTILITY_COLUMN_IDS.has(header.column.id);

  return (
    <th
      key={header.id}
      className={cn(
        'group py-3 text-sm font-medium relative bg-white dark:bg-zinc-900',
        isRightAligned ? 'text-right' : 'text-left',
        isUtilityColumn ? 'px-3' : 'px-4 overflow-hidden',
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
            'relative min-w-0 overflow-hidden',
            isRightAligned && 'flex flex-row-reverse',
          )}
        >
          <span className="truncate block">
            {flexRender(header.column.columnDef.header, header.getContext())}
          </span>
          {renderDataTableHeaderActions({
            canFilter,
            canSort,
            header,
            isFiltered,
            isRightAligned,
            sortDirection,
          })}
        </div>
      )}
      {renderDataTableHeaderResizeHandle(header)}
    </th>
  );
}

function shouldShowEmptyDataState(
  hasData: boolean,
  globalFilter: string,
  columnFilters: ColumnFiltersState,
) {
  return !hasData && !(globalFilter || columnFilters.length > 0);
}

function resolveRowDisplayMode(
  rowDisplayMode: RowDisplayMode | undefined,
  hasServerVirtualization: boolean,
) {
  const requestedRowDisplayMode = rowDisplayMode ?? 'client-virtualized';
  const isInvalidServerVirtualizationConfig =
    requestedRowDisplayMode === 'server-virtualized' && !hasServerVirtualization;
  const resolvedRowDisplayMode = isInvalidServerVirtualizationConfig
    ? 'client-virtualized'
    : requestedRowDisplayMode;

  return {
    isInvalidServerVirtualizationConfig,
    isServerVirtualized: resolvedRowDisplayMode === 'server-virtualized',
  };
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
  rowDisplayMode,
  virtualRowEstimate = 48,
  virtualOverscan = 10,
  serverVirtualization,
  manualSorting = false,
  sorting: controlledSorting,
  onSortingChange,
  enableRowSelection = false,
  rowSelection: controlledRowSelection,
  onRowSelectionChange,
  getRowId,
  expanded: controlledExpanded,
  onExpandedChange,
  expandedRowClassName,
  toolbarActions,
  maxHeight,
  initialColumnVisibility = {},
  renderSubComponent,
  singleExpand = false,
  getRowCanExpand: getRowCanExpandProp,
  manualFiltering = false,
  columnFilters: externalColumnFilters,
  onColumnFiltersChange: externalOnColumnFiltersChange,
}: DataTableProps<TData, TValue>) {
  const [internalSorting, setInternalSorting] = React.useState<SortingState>(initialSorting);
  const sorting = controlledSorting ?? internalSorting;
  const sortingRef = React.useRef(sorting);
  sortingRef.current = sorting;
  const { isInvalidServerVirtualizationConfig, isServerVirtualized } = resolveRowDisplayMode(
    rowDisplayMode,
    serverVirtualization != null,
  );
  const showColumnFilterControls = showFilter && (!isServerVirtualized || manualFiltering);
  const showGlobalFilterControl = !isServerVirtualized;

  React.useEffect(() => {
    if (isInvalidServerVirtualizationConfig) {
      console.warn(
        'DataTable: rowDisplayMode="server-virtualized" requires serverVirtualization. Falling back to client virtualization.',
      );
    }
  }, [isInvalidServerVirtualizationConfig]);
  const handleSortingChange = React.useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      const nextValue = typeof updater === 'function' ? updater(sortingRef.current) : updater;
      if (onSortingChange) {
        onSortingChange(nextValue);
      } else {
        setInternalSorting(nextValue);
      }
    },
    [onSortingChange],
  );
  const [internalColumnFilters, setInternalColumnFilters] = React.useState<ColumnFiltersState>([]);
  const columnFilters =
    manualFiltering && externalColumnFilters ? externalColumnFilters : internalColumnFilters;
  // Use a ref to avoid stale closures when resolving updater functions
  const columnFiltersRef = React.useRef(columnFilters);
  columnFiltersRef.current = columnFilters;
  const setColumnFilters = React.useCallback(
    (updater: ColumnFiltersState | ((prev: ColumnFiltersState) => ColumnFiltersState)) => {
      const nextValue = typeof updater === 'function' ? updater(columnFiltersRef.current) : updater;
      if (manualFiltering && externalOnColumnFiltersChange) {
        externalOnColumnFiltersChange(nextValue);
      } else {
        setInternalColumnFilters(nextValue);
      }
    },
    [manualFiltering, externalOnColumnFiltersChange],
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(initialColumnVisibility);
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({});
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [internalRowSelection, setInternalRowSelection] = React.useState<RowSelectionState>({});
  const [internalExpanded, setInternalExpanded] = React.useState<ExpandedState>({});
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  // Detect print mode to show all rows when printing
  const isPrinting = useIsPrinting();

  // Use controlled or internal row selection state
  const rowSelection = controlledRowSelection ?? internalRowSelection;
  const expanded = controlledExpanded ?? internalExpanded;

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

  const handleExpandedChange = React.useCallback(
    (updaterOrValue: ExpandedState | ((old: ExpandedState) => ExpandedState)) => {
      const nextValue =
        typeof updaterOrValue === 'function' ? updaterOrValue(expanded) : updaterOrValue;
      let normalizedValue = nextValue;

      if (singleExpand && typeof nextValue !== 'boolean' && typeof expanded !== 'boolean') {
        const newKeys = Object.keys(nextValue).filter((key) => !expanded[key] && nextValue[key]);
        if (newKeys.length > 0) {
          normalizedValue = { [newKeys[0]]: true };
        }
      }

      if (onExpandedChange) {
        onExpandedChange(normalizedValue);
      } else {
        setInternalExpanded(normalizedValue);
      }
    },
    [expanded, onExpandedChange, singleExpand],
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
      rowSelection,
      expanded,
    },
    enableRowSelection,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    manualFiltering,
    manualSorting: manualSorting || isServerVirtualized,
    filterFns: {
      operator: operatorFilterFn,
    },
    globalFilterFn: 'includesString',
    onRowSelectionChange: handleRowSelectionChange,
    onExpandedChange: handleExpandedChange,
    getRowCanExpand: getRowCanExpandProp ?? (renderSubComponent ? () => true : undefined),
    onSortingChange: handleSortingChange,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    onGlobalFilterChange: setGlobalFilter,
    getRowId: (row, index) => (getRowId ? getRowId(row) : String(index)),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(renderSubComponent ? { getExpandedRowModel: getExpandedRowModel() } : {}),
  });

  const visibleColumnCount = table.getVisibleLeafColumns().length;
  const tableMinWidth = table.getTotalSize() ? `${table.getTotalSize()}px` : undefined;
  const clientRows = table.getRowModel().rows;
  const serverRowCount = serverVirtualization?.rowCount ?? 0;
  const serverGetRow = serverVirtualization?.getRow;
  const serverLoadRows = serverVirtualization?.loadRows;
  const serverIsRowLoading = serverVirtualization?.isRowLoading;

  const virtualizerCount = isServerVirtualized ? serverRowCount : clientRows.length;
  const rowVirtualizer = useVirtualizer({
    count: isPrinting ? 0 : virtualizerCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => virtualRowEstimate,
    measureElement: (element) => element?.getBoundingClientRect().height ?? virtualRowEstimate,
    overscan: virtualOverscan,
    enabled: !isPrinting,
    initialRect: { width: 800, height: 600 },
    useFlushSync: false,
  });
  const virtualItems = rowVirtualizer.getVirtualItems();
  const fallbackVirtualItems = React.useMemo(() => {
    if (isPrinting || virtualItems.length > 0 || virtualizerCount === 0) {
      return virtualItems;
    }

    const initialVisibleCount = Math.min(
      virtualizerCount,
      Math.ceil(600 / virtualRowEstimate) + virtualOverscan * 2,
    );
    return Array.from({ length: initialVisibleCount }, (_, index) => ({
      key: index,
      index,
      start: index * virtualRowEstimate,
      end: (index + 1) * virtualRowEstimate,
      size: virtualRowEstimate,
      lane: 0,
    }));
  }, [isPrinting, virtualItems, virtualOverscan, virtualRowEstimate, virtualizerCount]);
  const activeVirtualItems = fallbackVirtualItems;
  const firstVirtualIndex = activeVirtualItems[0]?.index;
  const lastVirtualIndex = activeVirtualItems[activeVirtualItems.length - 1]?.index;
  const virtualScrollResetKey = React.useMemo(
    () => JSON.stringify({ columnFilters, globalFilter, sorting }),
    [columnFilters, globalFilter, sorting],
  );
  const loadServerRows = React.useCallback(
    (range: { startIndex: number; endIndex: number; signal: AbortSignal }) =>
      serverLoadRows?.(range),
    [serverLoadRows],
  );

  React.useEffect(() => {
    if (!isServerVirtualized || firstVirtualIndex === undefined || lastVirtualIndex === undefined) {
      return;
    }

    // Rerun on row-order changes so stale range loads are aborted and replaced.
    void virtualScrollResetKey;

    const abortController = new AbortController();
    Promise.resolve(
      loadServerRows({
        startIndex: firstVirtualIndex,
        endIndex: lastVirtualIndex,
        signal: abortController.signal,
      }),
    ).catch((error) => {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        // Surface unexpected load errors through the caller-owned error state when possible.
        console.error('Failed to load virtualized table rows:', error);
      }
    });

    return () => abortController.abort();
  }, [
    firstVirtualIndex,
    isServerVirtualized,
    lastVirtualIndex,
    loadServerRows,
    virtualScrollResetKey,
  ]);
  const previousVirtualScrollResetKeyRef = React.useRef(virtualScrollResetKey);

  // Reset virtual scroll when row order or filters change.
  React.useEffect(() => {
    if (isPrinting || previousVirtualScrollResetKeyRef.current === virtualScrollResetKey) {
      return;
    }

    previousVirtualScrollResetKeyRef.current = virtualScrollResetKey;
    const scrollElement = scrollContainerRef.current;
    if (!scrollElement || scrollElement.scrollTop === 0) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      scrollElement.scrollTo({ top: 0, left: scrollElement.scrollLeft });
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [isPrinting, virtualScrollResetKey]);

  const emptyVirtualItemsRef = React.useRef<typeof activeVirtualItems>([]);
  const serverVirtualItems = isServerVirtualized
    ? activeVirtualItems
    : emptyVirtualItemsRef.current;

  const serverVisibleRows = React.useMemo(() => {
    if (!isServerVirtualized || !serverGetRow) {
      return [];
    }

    return serverVirtualItems.flatMap((virtualItem) => {
      const row = serverGetRow(virtualItem.index);
      return row ? [{ index: virtualItem.index, row }] : [];
    });
  }, [isServerVirtualized, serverGetRow, serverVirtualItems]);

  const serverTableData = React.useMemo(
    () => serverVisibleRows.map(({ row }) => row),
    [serverVisibleRows],
  );

  const serverTable = useReactTable({
    data: serverTableData,
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
      rowSelection,
      expanded,
    },
    enableRowSelection,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    manualFiltering: true,
    manualSorting: true,
    filterFns: {
      operator: operatorFilterFn,
    },
    onRowSelectionChange: handleRowSelectionChange,
    onExpandedChange: handleExpandedChange,
    getRowCanExpand: getRowCanExpandProp ?? (renderSubComponent ? () => true : undefined),
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    getRowId: (row, index) =>
      getRowId ? getRowId(row) : String(serverVisibleRows[index]?.index ?? index),
    getCoreRowModel: getCoreRowModel(),
    ...(renderSubComponent ? { getExpandedRowModel: getExpandedRowModel() } : {}),
  });

  const serverRowsByIndex = React.useMemo(() => {
    const next = new Map<number, Row<TData>>();
    serverTable.getRowModel().rows.forEach((row, index) => {
      const virtualIndex = serverVisibleRows[index]?.index;
      if (virtualIndex !== undefined) {
        next.set(virtualIndex, row);
      }
    });
    return next;
  }, [serverTable, serverVisibleRows]);

  // When printing, show all rows instead of just the current page
  const rows = isPrinting ? table.getPrePaginationRowModel().rows : table.getRowModel().rows;
  const hasData = isServerVirtualized ? serverRowCount > 0 : table.getRowModel().rows.length > 0;

  if (isLoading) {
    return (
      <div className={cn('space-y-4 pb-4', className)}>
        {showToolbar && toolbarActions && (
          <DataTableToolbar
            table={table}
            columnFilters={columnFilters}
            columnVisibility={columnVisibility}
            setColumnVisibility={setColumnVisibility}
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
            columnVisibility={columnVisibility}
            setColumnVisibility={setColumnVisibility}
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

  // Show initial empty state only when there's no data AND no active filters
  // If filters are active but return no results, we show the table with "no results" message
  // so users can still access the toolbar to clear/modify their filters
  if (shouldShowEmptyDataState(hasData, globalFilter, columnFilters)) {
    return (
      <div className={cn('space-y-4 pb-4', className)}>
        {showToolbar && toolbarActions && (
          <DataTableToolbar
            table={table}
            columnFilters={columnFilters}
            columnVisibility={columnVisibility}
            setColumnVisibility={setColumnVisibility}
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

  const renderTableRow = (row: Row<TData>, virtualIndex?: number) => (
    <React.Fragment key={virtualIndex === undefined ? row.id : `${row.id}-${virtualIndex}`}>
      <tr
        data-index={virtualIndex}
        data-rowindex={virtualIndex ?? row.index}
        ref={virtualIndex === undefined || isPrinting ? undefined : rowVirtualizer.measureElement}
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
          const isUtilityColumn = UTILITY_COLUMN_IDS.has(cell.column.id);

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
        <tr className={cn('bg-neutral-100/30 dark:bg-neutral-800/30', expandedRowClassName)}>
          <td
            colSpan={visibleColumnCount}
            className="border-b border-zinc-200 p-4 dark:border-zinc-800"
          >
            {renderSubComponent(row)}
          </td>
        </tr>
      )}
    </React.Fragment>
  );

  const renderVirtualSpacerRow = (height: number, key: string) => {
    if (height <= 0) {
      return null;
    }

    return (
      <tr key={key} aria-hidden="true">
        <td colSpan={visibleColumnCount} style={{ height, padding: 0, border: 0 }} />
      </tr>
    );
  };

  const renderServerSkeletonRow = (virtualIndex: number) => (
    <tr
      key={`server-skeleton-${virtualIndex}`}
      data-index={virtualIndex}
      data-rowindex={virtualIndex}
      ref={isPrinting ? undefined : rowVirtualizer.measureElement}
      aria-busy={serverIsRowLoading?.(virtualIndex) ?? true}
      className="border-b border-zinc-200 dark:border-zinc-800"
    >
      {table.getVisibleLeafColumns().map((column) => {
        const columnSize = `${column.getSize()}px`;
        const isUtilityColumn = UTILITY_COLUMN_IDS.has(column.id);
        return (
          <td
            key={column.id}
            className={cn('py-3 text-sm', isUtilityColumn ? 'px-3' : 'px-4')}
            style={{ width: columnSize, minWidth: columnSize, maxWidth: columnSize }}
          >
            {!isUtilityColumn && <Skeleton className="h-4 w-full" />}
          </td>
        );
      })}
    </tr>
  );

  const renderNoResultsRow = () => (
    <tr>
      <td colSpan={visibleColumnCount} className="h-[200px] text-center">
        <div className="flex flex-col items-center justify-center gap-2">
          <Search className="size-8 text-zinc-400 dark:text-zinc-500" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No results match your search</p>
        </div>
      </td>
    </tr>
  );

  const renderTableBodyRows = () => {
    if (!hasData) {
      return renderNoResultsRow();
    }

    if (!isPrinting) {
      const virtualPaddingTop = activeVirtualItems[0]?.start ?? 0;
      const virtualPaddingBottom =
        activeVirtualItems.length > 0
          ? rowVirtualizer.getTotalSize() -
            (activeVirtualItems[activeVirtualItems.length - 1]?.end ?? 0)
          : 0;

      return (
        <>
          {renderVirtualSpacerRow(virtualPaddingTop, 'virtual-padding-top')}
          {activeVirtualItems.map((virtualItem) => {
            if (isServerVirtualized) {
              const row = serverRowsByIndex.get(virtualItem.index);
              return row
                ? renderTableRow(row, virtualItem.index)
                : renderServerSkeletonRow(virtualItem.index);
            }

            const row = clientRows[virtualItem.index];
            return row ? renderTableRow(row, virtualItem.index) : null;
          })}
          {renderVirtualSpacerRow(virtualPaddingBottom, 'virtual-padding-bottom')}
        </>
      );
    }

    return rows.map((row) => renderTableRow(row));
  };

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
              columnVisibility={columnVisibility}
              setColumnVisibility={setColumnVisibility}
              globalFilter={globalFilter}
              setGlobalFilter={setGlobalFilter}
              showColumnToggle={showColumnToggle}
              showFilter={showColumnFilterControls}
              showGlobalFilter={showGlobalFilterControl}
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
                  {headerGroup.headers.map((header) =>
                    renderDataTableHeaderCell(header, showColumnFilterControls),
                  )}
                </tr>
              ))}
            </thead>
            <tbody>{renderTableBodyRows()}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
