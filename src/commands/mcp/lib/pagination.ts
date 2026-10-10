export function paginate<T>(
  items: T[],
  options: {
    page?: number;
    pageSize?: number;
  } = {},
) {
  const { page = 1, pageSize = 20 } = options;

  // Validate and constrain parameters
  const validPageSize = Math.min(Math.max(1, pageSize), 100);
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
