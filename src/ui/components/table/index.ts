/**
 * Table components for displaying evaluation results.
 */

export { CellDetailOverlay, MinimalCellDetail } from './CellDetailOverlay';
// Main component
export { ResultsTable, StaticResultsTable } from './ResultsTable';
// Rendering utilities
export {
  createResultsTableInstance,
  type RenderResultsTableOptions,
  renderResultsTable,
  shouldUseInkTable,
} from './renderResultsTable';
export { getStatusBadgeWidth, StatusBadge, StatusIndicator } from './StatusBadge';
export { IndexCell, TableCell, TextCell } from './TableCell';
// Sub-components
export { MinimalHeader, TableHeader } from './TableHeader';
export { CompactRow, RowDivider, TableRow } from './TableRow';
export { getCellStatus } from './types';
// Hooks
export { calculateTableLayout, useTableLayout } from './useTableLayout';
export { getVisibleRowRange, useTableNavigation } from './useTableNavigation';

// Types
export type {
  CellDetailOverlayProps,
  CellStatus,
  CompletedPrompt,
  EvaluateTable,
  EvaluateTableOutput,
  EvaluateTableRow,
  ResultsTableProps,
  StatusBadgeProps,
  TableCellData,
  TableCellProps,
  TableColumn,
  TableHeaderProps,
  TableLayout,
  TableNavigationState,
  TableRowData,
  TableRowProps,
} from './types';
