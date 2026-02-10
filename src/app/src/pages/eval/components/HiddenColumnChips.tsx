import { Badge } from '@app/components/ui/badge';
import { cn } from '@app/lib/utils';
import { EyeOff } from 'lucide-react';

interface ColumnData {
  value: string;
  label: string;
}

interface HiddenColumnChipsProps {
  columnData: ColumnData[];
  selectedColumns: string[];
  onChange: (selectedColumns: string[]) => void;
  className?: string;
}

export function HiddenColumnChips({
  columnData,
  selectedColumns,
  onChange,
  className,
}: HiddenColumnChipsProps) {
  const hiddenColumns = columnData.filter((col) => !selectedColumns.includes(col.value));

  if (hiddenColumns.length === 0) {
    return null;
  }

  const handleRestoreColumn = (columnValue: string) => {
    onChange([...selectedColumns, columnValue]);
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {hiddenColumns.map((column) => (
        <Badge
          key={column.value}
          variant="secondary"
          className="cursor-pointer hover:bg-accent hover:text-accent-foreground max-w-[150px] transition-colors"
          onClick={() => handleRestoreColumn(column.value)}
          title={`Show ${column.label}`}
        >
          <EyeOff className="size-3.5 mr-1 shrink-0" />
          <span className="truncate">{column.label}</span>
        </Badge>
      ))}
    </div>
  );
}
