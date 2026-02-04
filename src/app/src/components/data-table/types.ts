import type {
  ColumnDef,
  RowSelectionState,
  SortingState,
  Table,
  VisibilityState,
} from '@tanstack/react-table';

// Extend TanStack Table's ColumnMeta to include our custom filter metadata
declare module '@tanstack/react-table' {
  // biome-ignore lint: /correctness/noUnusedVariables
  interface ColumnMeta<TData, TValue> {
    filterVariant?: 'select';
    filterOptions?: Array<{ label: string; value: string }>;
    /** Column alignment - affects both header and cell content. When 'right', sort icon appears on the left of the header label. */
    align?: 'left' | 'right';
  }
}

export interface DataTableProps<TData, TValue = unknown> {
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
  // Custom toolbar actions
  toolbarActions?: React.ReactNode;
  // Fixed height with scroll
  maxHeight?: string;
}

export interface DataTableToolbarProps<TData> {
  table: Table<TData>;
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
