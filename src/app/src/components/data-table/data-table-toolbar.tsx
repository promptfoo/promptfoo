import { Button } from '@app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@app/components/ui/dropdown-menu';
import { Input } from '@app/components/ui/input';
import { Download } from 'lucide-react';
import { DataTableColumnToggle } from './data-table-column-toggle';
import { DataTableFilter } from './data-table-filter';
import { DataTableHiddenColumnChips } from './data-table-hidden-column-chips';

import type { DataTableToolbarProps } from './types';

export function DataTableToolbar<TData>({
  table,
  globalFilter,
  setGlobalFilter,
  showColumnToggle = true,
  showFilter = true,
  showExport = true,
  onExportCSV,
  onExportJSON,
  toolbarActions,
}: DataTableToolbarProps<TData>) {
  return (
    <div className="flex items-center justify-between gap-2 p-2 border-b border-border">
      <div className="flex items-center gap-2">
        {showColumnToggle && <DataTableColumnToggle table={table} />}

        {showColumnToggle && <DataTableHiddenColumnChips table={table} />}

        {showFilter && <DataTableFilter table={table} />}

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

      <Input
        placeholder="Search..."
        value={globalFilter ?? ''}
        onChange={(e) => setGlobalFilter(e.target.value)}
        className="max-w-sm rounded-lg bg-background"
      />
    </div>
  );
}
