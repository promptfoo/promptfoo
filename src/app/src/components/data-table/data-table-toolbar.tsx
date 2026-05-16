import { Button } from '@app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@app/components/ui/dropdown-menu';
import { Input } from '@app/components/ui/input';
import { Download, Search } from 'lucide-react';
import { DataTableColumnToggle } from './data-table-column-toggle';
import { DataTableFilter } from './data-table-filter';

import type { DataTableToolbarProps } from './types';

export function DataTableToolbar<TData>({
  table,
  columnFilters,
  columnVisibility,
  setColumnVisibility,
  globalFilter,
  setGlobalFilter,
  showColumnToggle = true,
  showFilter = true,
  showGlobalFilter = true,
  showExport = true,
  globalFilterLabel,
  onExportCSV,
  onExportJSON,
  toolbarActions,
}: DataTableToolbarProps<TData>) {
  return (
    <div className="flex flex-col gap-2 border-b border-border p-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        {showColumnToggle && (
          <DataTableColumnToggle
            table={table}
            columnVisibility={columnVisibility}
            setColumnVisibility={setColumnVisibility}
          />
        )}

        {showFilter && <DataTableFilter table={table} columnFilters={columnFilters} />}

        {showExport && (onExportCSV || onExportJSON) && (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="mr-2 size-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {onExportCSV && <DropdownMenuItem onClick={onExportCSV}>Export CSV</DropdownMenuItem>}
              {onExportJSON && (
                <DropdownMenuItem onClick={onExportJSON}>Export JSON</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {toolbarActions}
      </div>

      {showGlobalFilter && (
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="search"
            aria-label={globalFilterLabel}
            placeholder="Search..."
            value={globalFilter ?? ''}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-8 rounded-lg"
          />
        </div>
      )}
    </div>
  );
}
