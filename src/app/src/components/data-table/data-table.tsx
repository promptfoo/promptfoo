import * as React from 'react';

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
import { AlertTriangle, Search } from 'lucide-react';
import { DataTablePagination } from './data-table-pagination';
import { DataTableToolbar } from './data-table-toolbar';
import type { ColumnFiltersState, SortingState, VisibilityState } from '@tanstack/react-table';

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
  showExport = true,
  showPagination = true,
  initialPageSize = 25,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: initialPageSize });

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
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

  if (!hasData && !globalFilter && data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] gap-3 rounded-xl bg-muted/50">
        <Search className="h-12 w-12 text-muted-foreground" />
        <h3 className="text-lg font-semibold">No data found</h3>
        <p className="text-sm text-muted-foreground max-w-md text-center">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {showToolbar && (
        <DataTableToolbar
          table={table}
          globalFilter={globalFilter}
          setGlobalFilter={setGlobalFilter}
          showColumnToggle={showColumnToggle}
          showExport={showExport}
          onExportCSV={onExportCSV}
          onExportJSON={onExportJSON}
        />
      )}

      <div className="rounded-lg border border-border overflow-hidden bg-white dark:bg-zinc-900">
        <table className="w-full">
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left text-sm font-semibold"
                    style={{
                      width: header.column.columnDef.size
                        ? `${header.column.columnDef.size}px`
                        : undefined,
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
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
                    <td key={cell.id} className="px-4 py-3 text-sm">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="h-[200px] text-center">
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
