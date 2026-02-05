import { Badge } from '@app/components/ui/badge';
import { cn } from '@app/lib/utils';
import { Eye } from 'lucide-react';

interface ColumnData {
  value: string;
  label: string;
  group?: string;
  description?: string;
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
          className="cursor-pointer gap-1 pr-1 hover:bg-muted/80"
          onClick={() => handleRestoreColumn(column.value)}
          title={`Show ${column.label}`}
        >
          <span className="max-w-[120px] truncate">{column.label}</span>
          <Eye className="size-3 shrink-0" />
        </Badge>
      ))}
    </div>
  );
}
