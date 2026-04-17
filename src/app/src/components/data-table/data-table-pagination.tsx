import { useState } from 'react';

import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';

import type { DataTablePaginationProps } from './types';

export function DataTablePagination<TData>({
  table,
  pageIndex,
  pageSize,
  pageCount,
  totalRows,
  onPageSizeChange,
}: DataTablePaginationProps<TData>) {
  const [pageInputValue, setPageInputValue] = useState<string>('');

  const canPreviousPage = pageIndex > 0;
  const canNextPage = pageIndex < pageCount - 1;

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInputValue(e.target.value);
  };

  const handlePageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const page = Number(pageInputValue);
      if (page >= 1 && page <= pageCount) {
        table.setPageIndex(page - 1);
        setPageInputValue('');
        (e.target as HTMLInputElement).blur();
      }
    } else if (e.key === 'Escape') {
      setPageInputValue('');
      (e.target as HTMLInputElement).blur();
    }
  };

  const handlePageInputBlur = () => {
    const page = Number(pageInputValue);
    if (page >= 1 && page <= pageCount) {
      table.setPageIndex(page - 1);
    }
    setPageInputValue('');
  };

  return (
    <div className="flex items-center justify-between px-2">
      <div className="text-sm text-muted-foreground">
        Showing {pageIndex * pageSize + 1} to {Math.min((pageIndex + 1) * pageSize, totalRows)} of{' '}
        {totalRows} rows
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">Rows per page</p>
          <Select
            value={`${pageSize}`}
            onValueChange={(value) => {
              onPageSizeChange(Number(value));
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side="top" align="start">
              {[10, 25, 50, 100].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.setPageIndex(0)}
            disabled={!canPreviousPage}
          >
            First
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!canPreviousPage}
          >
            Previous
          </Button>
          <div className="flex items-center gap-1 px-2">
            <span className="text-sm font-medium whitespace-nowrap">Page</span>
            <Input
              type="text"
              inputMode="numeric"
              value={pageInputValue || pageIndex + 1}
              onChange={handlePageInputChange}
              onKeyDown={handlePageInputKeyDown}
              onBlur={handlePageInputBlur}
              className="h-8 w-12 text-center text-sm p-0"
            />
            <span className="text-sm font-medium whitespace-nowrap">of {pageCount}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!canNextPage}
          >
            Next
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.setPageIndex(pageCount - 1)}
            disabled={!canNextPage}
          >
            Last
          </Button>
        </div>
      </div>
    </div>
  );
}
