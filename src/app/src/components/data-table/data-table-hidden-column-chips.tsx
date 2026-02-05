import { Badge } from '@app/components/ui/badge';
import { cn } from '@app/lib/utils';
import { X } from 'lucide-react';
import type { Table } from '@tanstack/react-table';

interface DataTableHiddenColumnChipsProps<TData> {
  table: Table<TData>;
  className?: string;
}

export function DataTableHiddenColumnChips<TData>({
  table,
  className,
}: DataTableHiddenColumnChipsProps<TData>) {
  const hiddenColumns = table
    .getAllColumns()
    .filter((column) => column.getCanHide() && !column.getIsVisible());

  if (hiddenColumns.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {hiddenColumns.map((column) => {
        const header = column.columnDef.header;
        const headerText = typeof header === 'string' ? header : column.id;

        return (
          <Badge
            key={column.id}
            variant="secondary"
            className="cursor-pointer gap-1 pr-1 hover:bg-muted/80"
            onClick={() => column.toggleVisibility(true)}
          >
            <span className="max-w-[120px] truncate">{headerText}</span>
            <X className="size-3 shrink-0" />
          </Badge>
        );
      })}
    </div>
  );
}
