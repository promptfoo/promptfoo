import type {
  ColumnDef,
  ColumnFiltersState,
  ExpandedState,
  Row,
  RowSelectionState,
  SortingState,
  Table,
  VisibilityState,
} from '@tanstack/react-table';

// Extend TanStack Table's ColumnMeta to include our custom filter metadata
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData, TValue> {
    filterVariant?: 'select';
    filterOptions?: Array<{ label: string; value: string }>;
    /** Column alignment - affects both header and cell content. When 'right', sort icon appears on the left of the header label. */
    align?: 'left' | 'right';
  }
}

interface DataTablePropsBase<TData, TValue = unknown> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  error?: string | null;
  onRowClick?: (row: TData) => void;
  emptyMessage?: string;
  className?: string;
  initialSorting?: SortingState;
  initialColumnVisibility?: VisibilityState;
  onExportCSV?: () => void;
  onExportJSON?: () => void;
  showToolbar?: boolean;
  showColumnToggle?: boolean;
  showFilter?: boolean;
  showExport?: boolean;
  showPagination?: boolean;
  initialPageSize?: number;
  // Row selection
  enableRowSelection?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (selection: RowSelectionState) => void;
  getRowId?: (row: TData) => string;
  expanded?: ExpandedState;
  onExpandedChange?: (expanded: ExpandedState) => void;
  expandedRowClassName?: string;
  // Custom toolbar actions
  toolbarActions?: React.ReactNode;
  // Fixed height with scroll
  maxHeight?: string;
  // Row expansion
  renderSubComponent?: (row: Row<TData>) => React.ReactNode;
  singleExpand?: boolean;
  getRowCanExpand?: (row: Row<TData>) => boolean;
  // Server-side pagination
  pageCount?: number;
  pageIndex?: number;
  pageSize?: number;
  onPaginationChange?: (pagination: { pageIndex: number; pageSize: number }) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

// Discriminated union for filtering — when manualFiltering is true, columnFilters
// and onColumnFiltersChange are required; otherwise they must not be passed.
type DataTableManualFilteringProps = {
  manualFiltering: true;
  columnFilters: ColumnFiltersState;
  onColumnFiltersChange: (filters: ColumnFiltersState) => void;
};

type DataTableAutoFilteringProps = {
  manualFiltering?: false;
  columnFilters?: never;
  onColumnFiltersChange?: never;
};

type DataTableFilteringProps = DataTableManualFilteringProps | DataTableAutoFilteringProps;

type DataTableManualPaginationFields = {
  /**
   * `true` enables server-driven/manual pagination: the caller owns pagination state
   * and provides the current page rows, total row count, and pagination handlers.
   */
  manualPagination: true;
  rowCount: number;
  pageCount: number;
  pageIndex: number;
  pageSize: number;
  onPaginationChange: (pagination: { pageIndex: number; pageSize: number }) => void;
  onPageSizeChange: (pageSize: number) => void;
};

type DataTableAutoPaginationFields = {
  manualPagination?: false;
  rowCount?: never;
  pageCount?: never;
  pageIndex?: never;
  pageSize?: never;
  onPaginationChange?: never;
  onPageSizeChange?: never;
};

export type DataTableManualPaginationProps<TData, TValue = unknown> = DataTablePropsBase<
  TData,
  TValue
> &
  DataTableFilteringProps &
  DataTableManualPaginationFields;

export type DataTableAutoPaginationProps<TData, TValue = unknown> = DataTablePropsBase<
  TData,
  TValue
> &
  DataTableFilteringProps &
  DataTableAutoPaginationFields;

export type DataTableProps<TData, TValue = unknown> =
  | DataTableManualPaginationProps<TData, TValue>
  | DataTableAutoPaginationProps<TData, TValue>;

export interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  columnFilters: ColumnFiltersState;
  globalFilter: string;
  setGlobalFilter: (value: string) => void;
  showColumnToggle?: boolean;
  showFilter?: boolean;
  showExport?: boolean;
  onExportCSV?: () => void;
  onExportJSON?: () => void;
  toolbarActions?: React.ReactNode;
}

export interface DataTablePaginationProps<TData> {
  table: Table<TData>;
  pageIndex: number;
  pageSize: number;
  pageCount: number;
  totalRows: number;
  onPageSizeChange: (pageSize: number) => void;
}

export interface DataTableColumnToggleProps<TData> {
  table: Table<TData>;
}
