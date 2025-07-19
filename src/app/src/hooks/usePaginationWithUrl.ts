import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

const ALLOWED_PAGE_SIZES = [10, 50, 100, 500, 1000] as const;
const DEFAULT_PAGE_SIZE = 50;

interface PaginationState {
  pageIndex: number;
  pageSize: number;
}

export function usePaginationWithUrl(defaultPageSize = DEFAULT_PAGE_SIZE) {
  const [searchParams, setSearchParams] = useSearchParams();
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Initialize pagination from URL params
  const getInitialPagination = (): PaginationState => {
    const pageParam = searchParams.get('page');
    const pageSizeParam = searchParams.get('pageSize');

    const pageIndex = pageParam ? Math.max(0, parseInt(pageParam, 10) - 1) : 0;
    const pageSize = pageSizeParam
      ? ALLOWED_PAGE_SIZES.includes(Number(pageSizeParam) as any)
        ? parseInt(pageSizeParam, 10)
        : defaultPageSize
      : defaultPageSize;

    return { pageIndex, pageSize };
  };

  const [pagination, setPagination] = useState<PaginationState>(getInitialPagination);
  const [gotoPageValue, setGotoPageValue] = useState((pagination.pageIndex + 1).toString());

  // Update URL when pagination changes
  useEffect(() => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);

      // Only set page if not on first page
      if (pagination.pageIndex > 0) {
        newParams.set('page', (pagination.pageIndex + 1).toString());
      } else {
        newParams.delete('page');
      }

      // Only set pageSize if not default
      if (pagination.pageSize !== defaultPageSize) {
        newParams.set('pageSize', pagination.pageSize.toString());
      } else {
        newParams.delete('pageSize');
      }

      return newParams;
    });

    // Update goto field when pagination changes
    setGotoPageValue((pagination.pageIndex + 1).toString());
  }, [pagination, setSearchParams, defaultPageSize]);

  // Debounced goto handler
  const handleGotoPageChange = useCallback(
    (value: string, pageCount: number) => {
      setGotoPageValue(value);

      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      debounceTimer.current = setTimeout(() => {
        const pageNumber = parseInt(value, 10);
        if (!isNaN(pageNumber) && pageNumber >= 1 && pageNumber <= pageCount) {
          setPagination((prev) => ({ ...prev, pageIndex: pageNumber - 1 }));
          window.scrollTo(0, 0);
        } else {
          // Reset to current page if invalid
          setGotoPageValue((pagination.pageIndex + 1).toString());
        }
      }, 500);
    },
    [pagination.pageIndex],
  );

  // Handle blur to reset invalid values
  const handleGotoPageBlur = useCallback(
    (pageCount: number) => {
      const pageNumber = parseInt(gotoPageValue, 10);
      if (isNaN(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
        setGotoPageValue((pagination.pageIndex + 1).toString());
      }
    },
    [gotoPageValue, pagination.pageIndex],
  );

  // Reset pagination but preserve page size
  const resetPagination = useCallback(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.delete('page');
      return newParams;
    });
  }, [setSearchParams]);

  return {
    pagination,
    setPagination,
    gotoPageValue,
    handleGotoPageChange,
    handleGotoPageBlur,
    resetPagination,
  };
}
