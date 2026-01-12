import React from 'react';

import { Button } from '@app/components/ui/button';
import { Checkbox } from '@app/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { Columns3, Eye, EyeOff } from 'lucide-react';

interface ColumnData {
  value: string;
  label: string;
  group?: string;
  description?: string;
}

interface ColumnSelectorProps {
  columnData: ColumnData[];
  selectedColumns: string[];
  onChange: (selectedColumns: string[]) => void;
}

export const ColumnSelector = ({ columnData, selectedColumns, onChange }: ColumnSelectorProps) => {
  const [open, setOpen] = React.useState(false);

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const handleToggle = (value: string) => {
    const newSelected = selectedColumns.includes(value)
      ? selectedColumns.filter((item) => item !== value)
      : [...selectedColumns, value];
    onChange(newSelected);
  };

  const handleShowAll = () => {
    onChange(columnData.map((col) => col.value));
  };

  // Get all variable columns
  const variableColumns = columnData
    .filter((col) => col.value.startsWith('Variable'))
    .map((col) => col.value);

  // Check if all variables are currently visible
  const variablesVisible =
    variableColumns.length > 0 && variableColumns.every((col) => selectedColumns.includes(col));

  const handleToggleVariables = () => {
    if (variablesVisible) {
      // Hide all variables - keep non-variable columns
      const newSelected = selectedColumns.filter((col) => !col.startsWith('Variable'));
      onChange(newSelected);
    } else {
      // Show all variables - add all variable columns that aren't already selected
      const newSelected = [...selectedColumns];
      variableColumns.forEach((col) => {
        if (!newSelected.includes(col)) {
          newSelected.push(col);
        }
      });
      onChange(newSelected);
    }
  };

  // Group columns by their group property
  const groupedColumns = columnData.reduce(
    (acc, column) => {
      const group = column?.group || 'Other';
      if (!acc[group]) {
        acc[group] = [];
      }
      acc[group].push(column);
      return acc;
    },
    {} as Record<string, ColumnData[]>,
  );

  return (
    <>
      <Button onClick={handleOpen} variant="outline" size="sm">
        <Columns3 className="size-4 mr-2" />
        Columns ({selectedColumns.length})
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex justify-between items-center pr-8">
              <DialogTitle>Select Columns</DialogTitle>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleShowAll} variant="outline">
                  Show All
                </Button>
                {variableColumns.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        onClick={handleToggleVariables}
                        variant={variablesVisible ? 'default' : 'outline'}
                      >
                        {variablesVisible ? (
                          <EyeOff className="size-4 mr-1" />
                        ) : (
                          <Eye className="size-4 mr-1" />
                        )}
                        Variables
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {variablesVisible ? 'Hide all variable columns' : 'Show all variable columns'}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto border-y border-border py-2">
            {Object.entries(groupedColumns).map(([group, columns]) => (
              <div key={group} className="mb-4">
                <h4 className="text-sm font-medium text-muted-foreground px-4 py-2 sticky top-0 bg-background">
                  {group}
                </h4>
                <div className="space-y-1">
                  {columns.map((column) => (
                    <label
                      key={column.value}
                      className="flex items-center gap-3 px-4 py-1.5 hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedColumns.includes(column.value)}
                        onCheckedChange={() => handleToggle(column.value)}
                      />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={cn(
                              'text-sm max-w-[400px] overflow-hidden text-ellipsis whitespace-nowrap',
                            )}
                          >
                            {column.label}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          {column.description || column.label}
                        </TooltipContent>
                      </Tooltip>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={handleClose} variant="outline">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
