import { Button } from '@app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@app/components/ui/dropdown-menu';
import { Columns3 } from 'lucide-react';

import type { DataTableColumnToggleProps } from './types';

export function DataTableColumnToggle<TData>({
  table,
  columnVisibility,
  setColumnVisibility,
}: DataTableColumnToggleProps<TData>) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Columns3 className="mr-2 size-4" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {table
          .getAllColumns()
          .filter((column) => column.getCanHide())
          .map((column) => {
            const header = column.columnDef.header;
            const headerText = typeof header === 'string' ? header : column.id;
            const isVisible = columnVisibility[column.id] !== false;

            return (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={isVisible}
                onCheckedChange={(value) => {
                  setColumnVisibility((previous) => {
                    const next = { ...previous };
                    if (value) {
                      delete next[column.id];
                    } else {
                      next[column.id] = false;
                    }
                    return next;
                  });
                }}
              >
                {headerText}
              </DropdownMenuCheckboxItem>
            );
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
