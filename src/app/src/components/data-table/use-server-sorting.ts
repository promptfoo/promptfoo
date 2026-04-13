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
  // Undefined means "allow all"; an explicitly empty allowlist intentionally blocks all fields.
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
  const allowedFieldSet = allowedFields ? new Set<TSortField>(allowedFields) : undefined;
  const sorting: SortingState = sortModel.map((sort) => ({
    id: sort.field,
    desc: sort.sort === 'desc',
  }));

  const onSortingChange = (nextSorting: SortingState) => {
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
  };

  return { sorting, onSortingChange };
}
