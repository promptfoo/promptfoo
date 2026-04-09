import * as React from 'react';

import type { SortingState } from '@tanstack/react-table';

export type DataTableServerSort<TSortField extends string> = {
  field: TSortField;
  sort: 'asc' | 'desc';
};

interface UseDataTableServerSortingOptions<TSortField extends string> {
  sortModel: DataTableServerSort<TSortField>[];
  setSortModel: (model: DataTableServerSort<TSortField>[]) => void;
  defaultSortField: TSortField;
  allowedFields?: ReadonlySet<TSortField> | readonly TSortField[];
}

function isAllowedSortField<TSortField extends string>(
  field: string,
  allowedFields?: ReadonlySet<TSortField>,
): field is TSortField {
  if (!allowedFields) {
    return true;
  }

  return allowedFields.has(field as TSortField);
}

export function useDataTableServerSorting<TSortField extends string>({
  sortModel,
  setSortModel,
  defaultSortField,
  allowedFields,
}: UseDataTableServerSortingOptions<TSortField>) {
  const allowedFieldSet = React.useMemo(
    () => (allowedFields ? new Set<TSortField>(allowedFields) : undefined),
    [allowedFields],
  );

  const sorting = React.useMemo<SortingState>(
    () => sortModel.map((sort) => ({ id: sort.field, desc: sort.sort === 'desc' })),
    [sortModel],
  );

  const onSortingChange = React.useCallback(
    (nextSorting: SortingState) => {
      const nextSort = nextSorting[0];
      const nextSortField = nextSort?.id ?? defaultSortField;
      if (!isAllowedSortField(nextSortField, allowedFieldSet)) {
        return;
      }

      setSortModel([
        {
          field: nextSortField,
          sort: nextSort?.desc === false ? 'asc' : 'desc',
        },
      ]);
    },
    [allowedFieldSet, defaultSortField, setSortModel],
  );

  return { sorting, onSortingChange };
}
