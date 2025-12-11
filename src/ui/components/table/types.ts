/**
 * Type definitions for the Ink Results Table components.
 */

import type {
  CompletedPrompt,
  EvaluateTable,
  EvaluateTableOutput,
  EvaluateTableRow,
  ResultFailureReason,
} from '../../../types';

/**
 * Status type for table cells.
 */
export type CellStatus = 'pass' | 'fail' | 'error' | null;

/**
 * Convert ResultFailureReason to CellStatus.
 *
 * ResultFailureReason values:
 * - NONE: 0 (passed or unknown failure)
 * - ASSERT: 1 (assertion failed)
 * - ERROR: 2 (error occurred)
 */
export function getCellStatus(pass: boolean, failureReason: ResultFailureReason): CellStatus {
  if (pass) {
    return 'pass';
  }
  // Check failure reason using numeric values
  // ASSERT = 1
  if (failureReason === 1) {
    return 'fail';
  }
  // ERROR = 2
  if (failureReason === 2) {
    return 'error';
  }
  // NONE = 0 (or any other value) - test failed but we don't know why
  return 'fail';
}

/**
 * Column definition for the table.
 */
export interface TableColumn {
  /** Unique identifier */
  id: string;
  /** Display header text */
  header: string;
  /** Column type */
  type: 'index' | 'var' | 'output';
  /** Calculated width in characters */
  width: number;
  /** Minimum width */
  minWidth?: number;
  /** Maximum width */
  maxWidth?: number;
  /** For output columns, the provider info */
  prompt?: CompletedPrompt;
}

/**
 * Processed cell data for rendering.
 */
export interface TableCellData {
  /** Raw content */
  content: string;
  /** Truncated content for display */
  displayContent: string;
  /** Cell status for coloring */
  status: CellStatus;
  /** Whether content was truncated */
  isTruncated: boolean;
  /** Original output data (for output cells) */
  output?: EvaluateTableOutput;
}

/**
 * Processed row data for rendering.
 */
export interface TableRowData {
  /** Row index (0-based) */
  index: number;
  /** Original test index */
  testIdx: number;
  /** Cell data for each column */
  cells: TableCellData[];
  /** Original row data */
  originalRow: EvaluateTableRow;
}

/**
 * Table layout configuration.
 */
export interface TableLayout {
  /** Total terminal width */
  terminalWidth: number;
  /** Available width for content (minus borders) */
  contentWidth: number;
  /** Column definitions with calculated widths */
  columns: TableColumn[];
  /** Whether to use compact/stacked mode */
  isCompact: boolean;
  /** Number of visible rows */
  visibleRowCount: number;
}

/**
 * Filter mode for quick filtering results.
 */
export type FilterMode = 'all' | 'passes' | 'failures' | 'errors' | 'different';

/**
 * Column filter operator.
 */
export type FilterOperator = '=' | '!=' | '>' | '>=' | '<' | '<=' | '~' | '!~';

/**
 * Column filter configuration.
 */
export interface ColumnFilter {
  /** Column to filter on */
  column: string;
  /** Filter operator */
  operator: FilterOperator;
  /** Filter value */
  value: string | number;
}

/**
 * Filter state for the table.
 */
export interface TableFilterState {
  /** Quick filter mode */
  mode: FilterMode;
  /** Search query (null if not searching) */
  searchQuery: string | null;
  /** Whether search input is active */
  isSearching: boolean;
  /** Column filters */
  columnFilters: ColumnFilter[];
  /** Whether command input is active */
  isCommandMode: boolean;
  /** Current command input */
  commandInput: string;
  /** Command error message (null if no error) */
  commandError: string | null;
}

/**
 * Navigation state for interactive table.
 */
export interface TableNavigationState {
  /** Currently selected row index */
  selectedRow: number;
  /** Currently selected column index */
  selectedCol: number;
  /** Expanded cell coordinates (null if none) */
  expandedCell: { row: number; col: number } | null;
  /** Scroll offset for virtual scrolling */
  scrollOffset: number;
  /** Filter state */
  filter: TableFilterState;
}

/**
 * Props for the main ResultsTable component.
 */
export interface ResultsTableProps {
  /** The evaluation table data */
  data: EvaluateTable;
  /** Maximum rows to display (default: 25) */
  maxRows?: number;
  /** Maximum cell content length before truncation (default: 250) */
  maxCellLength?: number;
  /** Whether to show row index column (default: true) */
  showIndex?: boolean;
  /** Enable interactive keyboard navigation (default: true in TTY) */
  interactive?: boolean;
  /** Callback when a row is selected */
  onRowSelect?: (row: EvaluateTableRow, index: number) => void;
  /** Callback when user exits the table */
  onExit?: () => void;
}

/**
 * Props for TableHeader component.
 */
export interface TableHeaderProps {
  columns: TableColumn[];
  isCompact?: boolean;
}

/**
 * Props for TableRow component.
 */
export interface TableRowProps {
  rowData: TableRowData;
  columns: TableColumn[];
  isSelected?: boolean;
  selectedCol?: number;
  isCompact?: boolean;
}

/**
 * Props for TableCell component.
 */
export interface TableCellProps {
  data: TableCellData;
  width: number;
  isSelected?: boolean;
  showBadge?: boolean;
}

/**
 * Props for StatusBadge component.
 */
export interface StatusBadgeProps {
  status: CellStatus;
}

/**
 * Props for CellDetailOverlay component.
 */
export interface CellDetailOverlayProps {
  cellData: TableCellData;
  column: TableColumn;
  rowData: TableRowData;
  /** Variable names from table head */
  varNames: string[];
  /** Total number of rows (for displaying position context) */
  totalRows: number;
  /** Handler for navigating to adjacent cells */
  onNavigate?: (direction: 'up' | 'down' | 'left' | 'right') => void;
  onClose: () => void;
}

/**
 * Re-export types from main types for convenience.
 */
export type { CompletedPrompt, EvaluateTable, EvaluateTableOutput, EvaluateTableRow };
