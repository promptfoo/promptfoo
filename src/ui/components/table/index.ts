/**
 * Table components for displaying evaluation results.
 */

// Main component
export { ResultsTable, StaticResultsTable } from './ResultsTable';

// Rendering utilities
export {
  renderResultsTable,
  createResultsTableInstance,
  shouldUseInkTable,
  type RenderResultsTableOptions,
} from './renderResultsTable';

// Sub-components
export { TableHeader, MinimalHeader } from './TableHeader';
export { TableRow, CompactRow, RowDivider } from './TableRow';
export { TableCell, TextCell, IndexCell } from './TableCell';
export { StatusBadge, StatusIndicator, getStatusBadgeWidth } from './StatusBadge';
export { CellDetailOverlay, MinimalCellDetail } from './CellDetailOverlay';

// Hooks
export { useTableLayout, calculateTableLayout } from './useTableLayout';
export { useTableNavigation, getVisibleRowRange } from './useTableNavigation';

// Types
export type {
  CellStatus,
  TableColumn,
  TableCellData,
  TableRowData,
  TableLayout,
  TableNavigationState,
  ResultsTableProps,
  TableHeaderProps,
  TableRowProps,
  TableCellProps,
  StatusBadgeProps,
  CellDetailOverlayProps,
  EvaluateTable,
  EvaluateTableRow,
  EvaluateTableOutput,
  CompletedPrompt,
} from './types';

export { getCellStatus } from './types';
