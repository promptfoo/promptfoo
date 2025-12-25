import * as React from 'react';

import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@app/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Filter, Plus, X } from 'lucide-react';
import type { Table } from '@tanstack/react-table';

interface DataTableFilterProps<TData> {
  table: Table<TData>;
}

type FilterOperator = 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'gt' | 'gte' | 'lt' | 'lte';

const OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'contains', label: 'contains' },
  { value: 'equals', label: 'equals' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'endsWith', label: 'ends with' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
];

interface ActiveFilter {
  id: string;
  columnId: string;
  operator: FilterOperator;
  value: string;
}

export function DataTableFilter<TData>({ table }: DataTableFilterProps<TData>) {
  const [open, setOpen] = React.useState(false);
  const [activeFilters, setActiveFilters] = React.useState<ActiveFilter[]>([]);

  // Get filterable columns (exclude select column and hidden columns)
  const filterableColumns = React.useMemo(() => {
    return table
      .getAllColumns()
      .filter(
        (column) =>
          column.getCanFilter() &&
          column.id !== 'select' &&
          typeof column.columnDef.header === 'string',
      );
  }, [table]);

  const addFilter = () => {
    if (filterableColumns.length === 0) {
      return;
    }
    const newFilter: ActiveFilter = {
      id: crypto.randomUUID(),
      columnId: filterableColumns[0].id,
      operator: 'contains',
      value: '',
    };
    setActiveFilters([...activeFilters, newFilter]);
  };

  // Apply filter with operator
  const applyFilter = React.useCallback(
    (filter: ActiveFilter) => {
      const column = table.getColumn(filter.columnId);
      if (!column || !filter.value) {
        column?.setFilterValue(undefined);
        return;
      }

      // Set filter value as object with operator info
      column.setFilterValue({ operator: filter.operator, value: filter.value });
    },
    [table],
  );

  const removeFilter = (id: string) => {
    const filter = activeFilters.find((f) => f.id === id);
    if (filter) {
      // Clear the column filter
      const column = table.getColumn(filter.columnId);
      column?.setFilterValue(undefined);
    }
    setActiveFilters(activeFilters.filter((f) => f.id !== id));
  };

  const updateFilter = (id: string, updates: Partial<ActiveFilter>) => {
    setActiveFilters(
      activeFilters.map((f) => {
        if (f.id === id) {
          const updated = { ...f, ...updates };
          applyFilter(updated);
          return updated;
        }
        return f;
      }),
    );
  };

  const clearAllFilters = () => {
    activeFilters.forEach((filter) => {
      const column = table.getColumn(filter.columnId);
      column?.setFilterValue(undefined);
    });
    setActiveFilters([]);
  };

  const activeFilterCount = activeFilters.filter((f) => f.value).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <Filter className="mr-2 h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Filters</h4>
            {activeFilters.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear all
              </Button>
            )}
          </div>

          {activeFilters.length === 0 ? (
            <p className="text-sm text-muted-foreground">No filters applied</p>
          ) : (
            <div className="space-y-2">
              {activeFilters.map((filter) => (
                <div key={filter.id} className="flex items-center gap-1.5">
                  <Select
                    value={filter.columnId}
                    onValueChange={(value) => {
                      // Clear old column filter
                      const oldColumn = table.getColumn(filter.columnId);
                      oldColumn?.setFilterValue(undefined);
                      // Update to new column
                      updateFilter(filter.id, { columnId: value, value: '' });
                    }}
                  >
                    <SelectTrigger className="h-8 w-[110px] shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {filterableColumns.map((column) => (
                        <SelectItem key={column.id} value={column.id}>
                          {typeof column.columnDef.header === 'string'
                            ? column.columnDef.header
                            : column.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={filter.operator}
                    onValueChange={(value: FilterOperator) => {
                      updateFilter(filter.id, { operator: value });
                    }}
                  >
                    <SelectTrigger className="h-8 w-[110px] shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATORS.map((op) => (
                        <SelectItem key={op.value} value={op.value}>
                          {op.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Value..."
                    value={filter.value}
                    onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                    className="h-8 flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFilter(filter.id)}
                    className="h-8 w-8 p-0 shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={addFilter}
            className="w-full"
            disabled={filterableColumns.length === 0}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add filter
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
