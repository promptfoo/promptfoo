export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  maxPageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export function paginate<T>(items: T[], options: PaginationOptions = {}): PaginatedResult<T> {
  const { page = 1, pageSize = 20, maxPageSize = 100 } = options;
  const validPageSize = Math.min(Math.max(1, pageSize), maxPageSize);
  const validPage = Math.max(1, page);
  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / validPageSize);
  const startIndex = (validPage - 1) * validPageSize;

  return {
    data: items.slice(startIndex, startIndex + validPageSize),
    pagination: {
      page: validPage,
      pageSize: validPageSize,
      totalItems,
      totalPages,
      hasNextPage: validPage < totalPages,
      hasPreviousPage: validPage > 1,
    },
  };
}
