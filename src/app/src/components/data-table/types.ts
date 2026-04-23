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
  /**
   * @deprecated The shared DataTable is virtualized instead of paginated. This is accepted
   * temporarily so downstream consumers can upgrade before deleting old call-site props.
   */
  showPagination?: boolean;
  /**
   * @deprecated Use virtualRowEstimate / virtualOverscan for virtualized tables.
   */
  initialPageSize?: number;
  rowDisplayMode?: 'client-virtualized' | 'server-virtualized';
  virtualRowEstimate?: number;
  virtualOverscan?: number;
  serverVirtualization?: DataTableServerVirtualization<TData>;
  /**
   * @deprecated Use rowDisplayMode="server-virtualized" with serverVirtualization.
   */
  manualPagination?: boolean;
  /**
   * @deprecated Use serverVirtualization.rowCount.
   */
  rowCount?: number;
  /**
   * @deprecated Legacy pagination input. Ignored by the virtualized renderer.
   */
  pageCount?: number;
  /**
   * @deprecated Legacy pagination input. Ignored by the virtualized renderer.
   */
  pageIndex?: number;
  /**
   * @deprecated Legacy pagination input. Ignored by the virtualized renderer.
   */
  pageSize?: number;
  /**
   * @deprecated Legacy pagination input. Ignored by the virtualized renderer.
   */
  onPaginationChange?: (pagination: { pageIndex: number; pageSize: number }) => void;
  /**
   * @deprecated Legacy pagination input. Ignored by the virtualized renderer.
   */
  onPageSizeChange?: (pageSize: number) => void;
  manualSorting?: boolean;
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
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
}

export interface DataTableServerVirtualization<TData> {
  rowCount: number;
  pageSize: number;
  getRow: (index: number) => TData | undefined;
  loadRows: (range: {
    startIndex: number;
    endIndex: number;
    signal: AbortSignal;
  }) => void | Promise<void>;
  isRowLoading?: (index: number) => boolean;
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

export type DataTableProps<TData, TValue = unknown> = DataTablePropsBase<TData, TValue> &
  DataTableFilteringProps;

export interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  columnFilters: ColumnFiltersState;
  columnVisibility: VisibilityState;
  setColumnVisibility: React.Dispatch<React.SetStateAction<VisibilityState>>;
  globalFilter: string;
  setGlobalFilter: (value: string) => void;
  showColumnToggle?: boolean;
  showFilter?: boolean;
  showGlobalFilter?: boolean;
  showExport?: boolean;
  onExportCSV?: () => void;
  onExportJSON?: () => void;
  toolbarActions?: React.ReactNode;
}

export interface DataTableColumnToggleProps<TData> {
  table: Table<TData>;
  columnVisibility: VisibilityState;
  setColumnVisibility: React.Dispatch<React.SetStateAction<VisibilityState>>;
}
