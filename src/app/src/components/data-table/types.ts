import type { RowSelectionState, Table } from '@tanstack/react-table';

export interface DataTableProps<TData, TValue = unknown> {
  columns: import('@tanstack/react-table').ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  error?: string | null;
  onRowClick?: (row: TData) => void;
  emptyMessage?: string;
  className?: string;
  initialSorting?: import('@tanstack/react-table').SortingState;
  onExportCSV?: () => void;
  onExportJSON?: () => void;
  showToolbar?: boolean;
  showColumnToggle?: boolean;
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
}

export interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  globalFilter: string;
  setGlobalFilter: (value: string) => void;
  showColumnToggle?: boolean;
  showExport?: boolean;
  onExportCSV?: () => void;
  onExportJSON?: () => void;
  toolbarActions?: React.ReactNode;
}

export interface DataTablePaginationProps<TData> {
  table: Table<TData>;
}

export interface DataTableColumnToggleProps<TData> {
  table: Table<TData>;
}
