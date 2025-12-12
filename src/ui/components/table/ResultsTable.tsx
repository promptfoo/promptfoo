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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { isRawModeSupported } from '../../hooks/useKeypress';
import { copyToClipboard } from '../../utils/clipboard';
import { convertTableToFormat } from '../../utils/export';
import { formatCost, formatLatency } from '../../utils/format';
import { VarDetailOverlay } from './CellDetailOverlay';
import { CommandInput } from './CommandInput';
import { DetailsPanel } from './DetailsPanel';
import { ExportMenu } from './ExportMenu';
import { filterRows, getFilterModeLabel, hasActiveFilter, parseSearchQuery } from './filterUtils';
import { HelpOverlay } from './HelpOverlay';
import { HistoryBrowser } from './HistoryBrowser';
import { SearchInput } from './SearchInput';
import { TableHeader } from './TableHeader';
import { TableRow } from './TableRow';
import {
  getCellStatus,
  type EvaluateTable,
  type ResultsTableProps,
  type TableCellData,
  type TableFilterState,
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
 * Handles Unicode properly by not cutting through multi-byte characters.
 */
function truncateText(text: string, maxLength: number): { text: string; truncated: boolean } {
  const normalized = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  // Use spread operator to properly split by code points, not code units
  // This prevents cutting through surrogate pairs (emojis, etc.)
  const codePoints = [...normalized];
  if (codePoints.length <= maxLength) {
    return { text: normalized, truncated: false };
  }
  return { text: codePoints.slice(0, maxLength - 1).join('') + '\u2026', truncated: true };
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
function HelpText({ isCompact, showHistory }: { isCompact: boolean; showHistory?: boolean }) {
  if (!isRawModeSupported()) {
    return null;
  }

  if (isCompact) {
    return (
      <Box marginTop={1}>
        <Text dimColor>
          ↑↓ nav | Enter expand | a/p/f/e filter | x export | y copy{showHistory ? ' | H history' : ''} | ? help | q quit
        </Text>
      </Box>
    );
  }

  return (
    <Box marginTop={1} flexDirection="column">
      <Text dimColor>
        ↑↓←→ nav | PgUp/Dn page | <Text color="cyan">[a]</Text>ll <Text color="cyan">[p]</Text>ass{' '}
        <Text color="cyan">[f]</Text>ail <Text color="cyan">[e]</Text>rr{' '}
        <Text color="cyan">[d]</Text>iff | <Text color="cyan">/</Text> search |{' '}
        <Text color="cyan">:</Text> cmd | <Text color="cyan">[x]</Text> export |{' '}
        <Text color="cyan">[y]</Text> copy{showHistory ? (<> | <Text color="cyan">[H]</Text>istory</>) : null} |{' '}
        <Text color="cyan">[?]</Text> help | q quit
      </Text>
    </Box>
  );
}

/**
 * Filter status bar showing current filter and counts.
 */
function FilterStatusBar({
  filterState,
  filteredCount,
  totalCount,
}: {
  filterState: TableFilterState;
  filteredCount: number;
  totalCount: number;
}) {
  const isFiltered = hasActiveFilter(filterState);

  if (!isFiltered) {
    return null;
  }

  // Parse search query to check for regex errors
  const parsedSearch = filterState.searchQuery ? parseSearchQuery(filterState.searchQuery) : null;
  const hasRegexError = parsedSearch?.isRegex && parsedSearch?.error;

  const parts: string[] = [];

  // Add filter mode if not 'all'
  if (filterState.mode !== 'all') {
    parts.push(getFilterModeLabel(filterState.mode));
  }

  // Add column filter count if present
  if (filterState.columnFilters.length > 0) {
    parts.push(
      `${filterState.columnFilters.length} filter${filterState.columnFilters.length > 1 ? 's' : ''}`,
    );
  }

  const filterLabel = parts.join(' + ');

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="yellow">Filter: </Text>
        {filterLabel && <Text color="cyan">{filterLabel}</Text>}
        {filterLabel && filterState.searchQuery && <Text color="cyan"> + </Text>}
        {filterState.searchQuery &&
          (parsedSearch?.isRegex ? (
            <Text color={hasRegexError ? 'red' : 'magenta'}>
              /{parsedSearch.pattern}/{parsedSearch.flags}
            </Text>
          ) : (
            <Text color="cyan">"{filterState.searchQuery}"</Text>
          ))}
        <Text dimColor>
          {' '}
          ({filteredCount} of {totalCount})
        </Text>
      </Box>
      {hasRegexError && (
        <Box>
          <Text color="red">⚠ Invalid regex: {parsedSearch?.error}</Text>
        </Box>
      )}
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
 * Calculate summary statistics from rows.
 */
export function calculateSummaryStats(rows: TableRowData[]): {
  passCount: number;
  failCount: number;
  errorCount: number;
  totalTests: number;
  avgScore: number | null;
  totalCost: number;
  avgLatencyMs: number | null;
} {
  let passCount = 0;
  let failCount = 0;
  let errorCount = 0;
  let totalScore = 0;
  let scoreCount = 0;
  let totalCost = 0;
  let totalLatency = 0;
  let latencyCount = 0;

  for (const row of rows) {
    for (const cell of row.cells) {
      if (cell.status === 'pass') {
        passCount++;
      } else if (cell.status === 'fail') {
        failCount++;
      } else if (cell.status === 'error') {
        errorCount++;
      }

      // Calculate average score from output data
      if (cell.output?.score !== undefined) {
        totalScore += cell.output.score;
        scoreCount++;
      }

      // Accumulate cost (include all costs, even zero)
      if (cell.output?.cost !== undefined && cell.output.cost > 0) {
        totalCost += cell.output.cost;
      }

      // Accumulate latency for average calculation
      if (cell.output?.latencyMs !== undefined && cell.output.latencyMs > 0) {
        totalLatency += cell.output.latencyMs;
        latencyCount++;
      }
    }
  }

  return {
    passCount,
    failCount,
    errorCount,
    totalTests: passCount + failCount + errorCount,
    avgScore: scoreCount > 0 ? totalScore / scoreCount : null,
    totalCost,
    avgLatencyMs: latencyCount > 0 ? totalLatency / latencyCount : null,
  };
}

/**
 * Notification bar for showing temporary messages (e.g., "Copied!" or "Exported to file.json").
 */
function NotificationBar({
  message,
  type,
}: {
  message: string;
  type: 'success' | 'error' | 'info';
}) {
  const color = type === 'success' ? 'green' : type === 'error' ? 'red' : 'cyan';
  const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ';

  return (
    <Box marginBottom={1}>
      <Text color={color}>
        {icon} {message}
      </Text>
    </Box>
  );
}

/**
 * Summary statistics footer showing aggregate stats.
 */
function SummaryStatsFooter({ rows, isFiltered }: { rows: TableRowData[]; isFiltered: boolean }) {
  const stats = useMemo(() => calculateSummaryStats(rows), [rows]);

  // Only show if there are actual results
  if (stats.totalTests === 0) {
    return null;
  }

  const passRate =
    stats.totalTests > 0 ? ((stats.passCount / stats.totalTests) * 100).toFixed(0) : '0';

  return (
    <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
      <Text dimColor>{isFiltered ? 'Filtered' : 'Total'}: </Text>
      <Text color="green">{stats.passCount}✓</Text>
      <Text dimColor> </Text>
      <Text color="red">{stats.failCount}✗</Text>
      {stats.errorCount > 0 && (
        <>
          <Text dimColor> </Text>
          <Text color="yellow">{stats.errorCount}⚠</Text>
        </>
      )}
      <Text dimColor> │ </Text>
      <Text dimColor>Pass rate: </Text>
      <Text
        color={parseInt(passRate) >= 80 ? 'green' : parseInt(passRate) >= 50 ? 'yellow' : 'red'}
      >
        {passRate}%
      </Text>
      {stats.avgScore !== null && (
        <>
          <Text dimColor> │ </Text>
          <Text dimColor>Avg score: </Text>
          <Text color={stats.avgScore >= 0.8 ? 'green' : stats.avgScore >= 0.5 ? 'yellow' : 'red'}>
            {(stats.avgScore * 100).toFixed(1)}%
          </Text>
        </>
      )}
      {stats.totalCost > 0 && (
        <>
          <Text dimColor> │ </Text>
          <Text dimColor>Cost: </Text>
          <Text>{formatCost(stats.totalCost)}</Text>
        </>
      )}
      {stats.avgLatencyMs !== null && (
        <>
          <Text dimColor> │ </Text>
          <Text dimColor>Avg latency: </Text>
          <Text>{formatLatency(stats.avgLatencyMs)}</Text>
        </>
      )}
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
  currentEvalId,
  onTableDataChange,
}: ResultsTableProps) {
  // Export/copy/history/help state
  const [isExporting, setIsExporting] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  // Clear notification after delay
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Calculate layout based on terminal size
  const layout = useTableLayout(data, {
    showIndex,
    maxVisibleRows: maxRows,
  });

  // Process data for rendering
  const processedRows = useMemo(() => processTableData(data, maxCellLength), [data, maxCellLength]);

  // Handle copy operation
  const handleCopy = useCallback(() => {
    // Copy filtered results as JSON
    const content = convertTableToFormat(data, 'json');
    const result = copyToClipboard(content);

    if (result.success) {
      setNotification({ message: 'Results copied to clipboard', type: 'success' });
    } else {
      setNotification({ message: result.error || 'Failed to copy', type: 'error' });
    }
  }, [data]);

  // Set up keyboard navigation (initially with full row count, will be adjusted after filtering)
  const isInteractive = interactive && isRawModeSupported();
  const navigation = useTableNavigation({
    rowCount: processedRows.length,
    colCount: layout.columns.length,
    visibleRows: layout.visibleRowCount,
    hasIndexColumn: showIndex,
    isActive: isInteractive && !layout.isCompact && !isExporting && !isHistoryOpen && !isHelpOpen,
    onExit,
    onExpand: (row, _col) => {
      if (onRowSelect && processedRows[row]) {
        onRowSelect(processedRows[row].originalRow, row);
      }
    },
    onExport: () => setIsExporting(true),
    onCopy: handleCopy,
    onHistory: onTableDataChange ? () => setIsHistoryOpen(true) : undefined,
    onHelp: () => setIsHelpOpen(true),
  });

  // Apply filters to rows
  const filteredRows = useMemo(
    () => filterRows(processedRows, navigation.filter),
    [processedRows, navigation.filter],
  );

  // Clamp selection when filtered rows change
  useEffect(() => {
    if (filteredRows.length > 0) {
      navigation.dispatch({ type: 'CLAMP_SELECTION', maxRow: filteredRows.length });
    }
  }, [filteredRows.length, navigation.dispatch]);

  // Calculate visible row range based on filtered rows
  const { start: visibleStart, end: visibleEnd } = getVisibleRowRange(
    navigation.scrollOffset,
    layout.visibleRowCount,
    filteredRows.length,
  );

  // Get visible rows from filtered set
  const visibleRows = filteredRows.slice(visibleStart, visibleEnd);

  // Handle export menu
  if (isExporting) {
    return (
      <ExportMenu
        data={data}
        onComplete={(success, message) => {
          setIsExporting(false);
          setNotification({
            message,
            type: success ? 'success' : 'error',
          });
        }}
        onCancel={() => setIsExporting(false)}
      />
    );
  }

  // Handle history browser
  if (isHistoryOpen && onTableDataChange) {
    return (
      <HistoryBrowser
        currentEvalId={currentEvalId}
        onSelect={(table, evalId) => {
          setIsHistoryOpen(false);
          onTableDataChange(table, evalId);
          setNotification({
            message: `Loaded eval ${evalId}`,
            type: 'success',
          });
        }}
        onCancel={() => setIsHistoryOpen(false)}
      />
    );
  }

  // Handle help overlay
  if (isHelpOpen) {
    return (
      <HelpOverlay
        onClose={() => setIsHelpOpen(false)}
        historyAvailable={!!onTableDataChange}
        terminalWidth={layout.terminalWidth}
      />
    );
  }

  // Handle empty data
  if (data.body.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>No results to display</Text>
      </Box>
    );
  }

  // Handle empty filtered results
  if (filteredRows.length === 0 && hasActiveFilter(navigation.filter)) {
    return (
      <Box flexDirection="column" padding={1}>
        <FilterStatusBar
          filterState={navigation.filter}
          filteredCount={0}
          totalCount={processedRows.length}
        />
        <Text dimColor>No results match the current filter</Text>
        <Box marginTop={1}>
          <Text dimColor>Press </Text>
          <Text color="cyan">a</Text>
          <Text dimColor> to show all results</Text>
        </Box>
      </Box>
    );
  }

  // Render expanded cell overlay if active
  if (navigation.expandedCell) {
    const { row, col } = navigation.expandedCell;
    // Map filtered row index to the actual row data
    const rowData = filteredRows[row];
    const column = layout.columns[col];

    // Handle var column expansion - show full content with navigation
    if (column.type === 'var' && rowData) {
      const varIdx = layout.columns.filter((c, i) => c.type === 'var' && i < col).length;
      const varContent = rowData.originalRow.vars[varIdx] || '';
      const varName = data.head.vars[varIdx] || column.header;
      return (
        <VarDetailOverlay
          varName={varName}
          content={varContent}
          rowIndex={rowData.index}
          totalRows={filteredRows.length}
          onNavigate={(direction) => {
            navigation.dispatch({ type: 'NAVIGATE_EXPANDED', direction });
          }}
          onClose={() => navigation.dispatch({ type: 'CLOSE_EXPAND' })}
        />
      );
    }

    // Handle index column - no expansion needed, close immediately
    if (column.type === 'index') {
      navigation.dispatch({ type: 'CLOSE_EXPAND' });
    }

    // Find the appropriate cell data for output columns
    let cellData: TableCellData | undefined;
    let outputIdx = 0;
    if (column.type === 'output') {
      outputIdx = layout.columns.filter((c, i) => c.type === 'output' && i < col).length;
      cellData = rowData.cells[outputIdx];
    }

    if (cellData && rowData) {
      return (
        <DetailsPanel
          cellData={cellData}
          column={column}
          rowData={rowData}
          allRows={filteredRows}
          varNames={data.head.vars}
          currentRowIndex={row}
          currentColIndex={col}
          outputCellIndex={outputIdx}
          onNavigate={(newRowIndex, newColIndex) => {
            navigation.dispatch({
              type: 'SET_EXPANDED_POSITION',
              row: newRowIndex,
              col: newColIndex,
            });
          }}
          onClose={() => navigation.dispatch({ type: 'CLOSE_EXPAND' })}
        />
      );
    }
  }

  // Compact mode for narrow terminals
  if (layout.isCompact) {
    return (
      <Box flexDirection="column">
        {/* Notification bar */}
        {notification && (
          <NotificationBar message={notification.message} type={notification.type} />
        )}

        <FilterStatusBar
          filterState={navigation.filter}
          filteredCount={filteredRows.length}
          totalCount={processedRows.length}
        />
        <TableHeader columns={layout.columns} isCompact={true} />
        {visibleRows.map((rowData, displayIdx) => (
          <TableRow
            key={rowData.testIdx}
            rowData={rowData}
            columns={layout.columns}
            isSelected={navigation.selectedRow === visibleStart + displayIdx}
            isCompact={true}
          />
        ))}
        {filteredRows.length > visibleEnd && (
          <Text dimColor>... {filteredRows.length - visibleEnd} more rows</Text>
        )}
        {navigation.filter.isSearching ? (
          <SearchInput
            query={navigation.filter.searchQuery || ''}
            isActive={navigation.filter.isSearching}
            matchCount={filteredRows.length}
            totalCount={processedRows.length}
          />
        ) : navigation.filter.isCommandMode ? (
          <CommandInput
            input={navigation.filter.commandInput}
            isActive={navigation.filter.isCommandMode}
            error={navigation.filter.commandError}
          />
        ) : (
          <HelpText isCompact={true} showHistory={!!onTableDataChange} />
        )}
      </Box>
    );
  }

  // Standard table mode
  return (
    <Box flexDirection="column">
      {/* Notification bar */}
      {notification && <NotificationBar message={notification.message} type={notification.type} />}

      {/* Filter status bar */}
      <FilterStatusBar
        filterState={navigation.filter}
        filteredCount={filteredRows.length}
        totalCount={processedRows.length}
      />

      <TableHeader columns={layout.columns} />

      {visibleRows.map((rowData, displayIdx) => (
        <TableRow
          key={rowData.testIdx}
          rowData={rowData}
          columns={layout.columns}
          isSelected={navigation.selectedRow === visibleStart + displayIdx}
          selectedCol={
            navigation.selectedRow === visibleStart + displayIdx
              ? navigation.selectedCol
              : undefined
          }
        />
      ))}

      {/* Show "more rows" indicator */}
      {filteredRows.length > visibleEnd && (
        <Box marginTop={1}>
          <Text dimColor>
            ... {filteredRows.length - visibleEnd} more row
            {filteredRows.length - visibleEnd !== 1 ? 's' : ''} not shown
          </Text>
        </Box>
      )}

      {/* Status bar */}
      {isInteractive && filteredRows.length > layout.visibleRowCount && (
        <StatusBar
          currentRow={navigation.selectedRow}
          totalRows={filteredRows.length}
          visibleStart={visibleStart}
          visibleEnd={visibleEnd}
        />
      )}

      {/* Summary statistics footer */}
      <SummaryStatsFooter rows={filteredRows} isFiltered={hasActiveFilter(navigation.filter)} />

      {/* Search input, command input, or help text */}
      {isInteractive &&
        (navigation.filter.isSearching ? (
          <SearchInput
            query={navigation.filter.searchQuery || ''}
            isActive={navigation.filter.isSearching}
            matchCount={filteredRows.length}
            totalCount={processedRows.length}
          />
        ) : navigation.filter.isCommandMode ? (
          <CommandInput
            input={navigation.filter.commandInput}
            isActive={navigation.filter.isCommandMode}
            error={navigation.filter.commandError}
          />
        ) : (
          <HelpText isCompact={false} showHistory={!!onTableDataChange} />
        ))}
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
