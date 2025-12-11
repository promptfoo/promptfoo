/**
 * ResultsTable - Main component for displaying evaluation results in a table.
 *
 * Features:
 * - Responsive column widths based on terminal size
 * - Keyboard navigation (arrow keys, vim bindings)
 * - Cell expansion for viewing full content
 * - Virtual scrolling for large result sets
 * - Compact mode for narrow terminals
 * - Pass/Fail/Error status coloring
 */

import { Box, Text } from 'ink';
import { useMemo } from 'react';
import { isRawModeSupported } from '../../hooks/useKeypress';
import { CellDetailOverlay } from './CellDetailOverlay';
import { TableHeader } from './TableHeader';
import { TableRow } from './TableRow';
import {
  getCellStatus,
  type EvaluateTable,
  type ResultsTableProps,
  type TableCellData,
  type TableRowData,
} from './types';
import { useTableLayout } from './useTableLayout';
import { useTableNavigation, getVisibleRowRange } from './useTableNavigation';

/**
 * Default configuration values.
 */
const DEFAULTS = {
  maxRows: 25,
  maxCellLength: 250,
};

/**
 * Truncate text to a maximum length.
 */
function truncateText(text: string, maxLength: number): { text: string; truncated: boolean } {
  const normalized = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return { text: normalized, truncated: false };
  }
  return { text: normalized.slice(0, maxLength - 1) + '\u2026', truncated: true };
}

/**
 * Process raw table data into renderable row data.
 */
function processTableData(data: EvaluateTable, maxCellLength: number): TableRowData[] {
  return data.body.map((row, index) => {
    // Process output cells
    const cells: TableCellData[] = row.outputs.map((output) => {
      const { text, truncated } = truncateText(output.text || '', maxCellLength);
      const status = getCellStatus(output.pass, output.failureReason);

      return {
        content: output.text || '',
        displayContent: text,
        status,
        isTruncated: truncated,
        output,
      };
    });

    return {
      index,
      testIdx: row.testIdx,
      cells,
      originalRow: row,
    };
  });
}

/**
 * Help text component showing available keyboard shortcuts.
 */
function HelpText({ isCompact }: { isCompact: boolean }) {
  if (!isRawModeSupported()) {
    return null;
  }

  if (isCompact) {
    return (
      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate | Enter expand | q quit</Text>
      </Box>
    );
  }

  return (
    <Box marginTop={1} flexDirection="column">
      <Text dimColor>↑↓←→/hjkl navigate | Enter expand | g/G first/last | q quit</Text>
    </Box>
  );
}

/**
 * Status bar showing current position and totals.
 */
function StatusBar({
  currentRow,
  totalRows,
  visibleStart,
  visibleEnd,
}: {
  currentRow: number;
  totalRows: number;
  visibleStart: number;
  visibleEnd: number;
}) {
  const hasMoreAbove = visibleStart > 0;
  const hasMoreBelow = visibleEnd < totalRows;

  return (
    <Box marginTop={1}>
      <Text dimColor>
        Row {currentRow + 1}/{totalRows}
        {hasMoreAbove && ' ↑ more above'}
        {hasMoreBelow && ' ↓ more below'}
      </Text>
    </Box>
  );
}

/**
 * Main ResultsTable component.
 */
export function ResultsTable({
  data,
  maxRows = DEFAULTS.maxRows,
  maxCellLength = DEFAULTS.maxCellLength,
  showIndex = true,
  interactive = true,
  onRowSelect,
  onExit,
}: ResultsTableProps) {
  // Calculate layout based on terminal size
  const layout = useTableLayout(data, {
    showIndex,
    maxVisibleRows: maxRows,
  });

  // Process data for rendering
  const processedRows = useMemo(() => processTableData(data, maxCellLength), [data, maxCellLength]);

  // Set up keyboard navigation
  const isInteractive = interactive && isRawModeSupported();
  const navigation = useTableNavigation({
    rowCount: processedRows.length,
    colCount: layout.columns.length,
    visibleRows: layout.visibleRowCount,
    isActive: isInteractive && !layout.isCompact,
    onExit,
    onExpand: (row, _col) => {
      if (onRowSelect && processedRows[row]) {
        onRowSelect(processedRows[row].originalRow, row);
      }
    },
  });

  // Calculate visible row range
  const { start: visibleStart, end: visibleEnd } = getVisibleRowRange(
    navigation.scrollOffset,
    layout.visibleRowCount,
    processedRows.length,
  );

  // Get visible rows
  const visibleRows = processedRows.slice(visibleStart, visibleEnd);

  // Handle empty data
  if (data.body.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>No results to display</Text>
      </Box>
    );
  }

  // Render expanded cell overlay if active
  if (navigation.expandedCell) {
    const { row, col } = navigation.expandedCell;
    const rowData = processedRows[row];
    const column = layout.columns[col];

    // Handle var column expansion - show full content in a simple overlay
    if (column.type === 'var' && rowData) {
      const varIdx = layout.columns.filter((c, i) => c.type === 'var' && i < col).length;
      const varContent = rowData.originalRow.vars[varIdx] || '';
      return (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="cyan"
          paddingX={1}
          paddingY={1}
        >
          <Box justifyContent="space-between">
            <Text bold>{column.header}</Text>
            <Text dimColor>[Esc] Close</Text>
          </Box>
          <Box marginTop={1}>
            <Text wrap="wrap">{varContent || '(empty)'}</Text>
          </Box>
        </Box>
      );
    }

    // Handle index column - no expansion needed, close immediately
    if (column.type === 'index') {
      navigation.dispatch({ type: 'CLOSE_EXPAND' });
    }

    // Find the appropriate cell data for output columns
    let cellData: TableCellData | undefined;
    if (column.type === 'output') {
      const outputIdx = layout.columns.filter((c, i) => c.type === 'output' && i < col).length;
      cellData = rowData.cells[outputIdx];
    }

    if (cellData && rowData) {
      return (
        <CellDetailOverlay
          cellData={cellData}
          column={column}
          rowData={rowData}
          onClose={() => navigation.dispatch({ type: 'CLOSE_EXPAND' })}
        />
      );
    }
  }

  // Compact mode for narrow terminals
  if (layout.isCompact) {
    return (
      <Box flexDirection="column">
        <TableHeader columns={layout.columns} isCompact={true} />
        {visibleRows.map((rowData) => (
          <TableRow
            key={rowData.testIdx}
            rowData={rowData}
            columns={layout.columns}
            isSelected={navigation.selectedRow === rowData.index}
            isCompact={true}
          />
        ))}
        {processedRows.length > visibleEnd && (
          <Text dimColor>... {processedRows.length - visibleEnd} more rows</Text>
        )}
        <HelpText isCompact={true} />
      </Box>
    );
  }

  // Standard table mode
  return (
    <Box flexDirection="column">
      <TableHeader columns={layout.columns} />

      {visibleRows.map((rowData) => (
        <TableRow
          key={rowData.testIdx}
          rowData={rowData}
          columns={layout.columns}
          isSelected={navigation.selectedRow === rowData.index}
          selectedCol={
            navigation.selectedRow === rowData.index ? navigation.selectedCol : undefined
          }
        />
      ))}

      {/* Show "more rows" indicator */}
      {processedRows.length > visibleEnd && (
        <Box marginTop={1}>
          <Text dimColor>
            ... {processedRows.length - visibleEnd} more row
            {processedRows.length - visibleEnd !== 1 ? 's' : ''} not shown
          </Text>
        </Box>
      )}

      {/* Status bar */}
      {isInteractive && processedRows.length > layout.visibleRowCount && (
        <StatusBar
          currentRow={navigation.selectedRow}
          totalRows={processedRows.length}
          visibleStart={visibleStart}
          visibleEnd={visibleEnd}
        />
      )}

      {/* Help text */}
      {isInteractive && <HelpText isCompact={false} />}
    </Box>
  );
}

/**
 * Static (non-interactive) results table for non-TTY environments.
 */
export function StaticResultsTable({
  data,
  maxRows = DEFAULTS.maxRows,
  maxCellLength = DEFAULTS.maxCellLength,
}: {
  data: EvaluateTable;
  maxRows?: number;
  maxCellLength?: number;
}) {
  return (
    <ResultsTable data={data} maxRows={maxRows} maxCellLength={maxCellLength} interactive={false} />
  );
}

export default ResultsTable;
