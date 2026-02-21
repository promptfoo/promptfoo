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

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Box, Text } from 'ink';
import { LIMITS, TIMING } from '../../constants';
import { isRawModeSupported } from '../../hooks/useKeypress';
import { copyToClipboard } from '../../utils/clipboard';
import { convertTableToFormat } from '../../utils/export';
import { formatCost, formatLatency, getScoreColor, truncateText } from '../../utils/format';
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
  type EvaluateTable,
  getCellStatus,
  type ResultsTableProps,
  type TableCellData,
  type TableFilterState,
  type TableRowData,
} from './types';
import { useTableLayout } from './useTableLayout';
import { getVisibleRowRange, useTableNavigation } from './useTableNavigation';

/**
 * Default configuration values from centralized constants.
 */
const DEFAULTS = {
  maxRows: LIMITS.MAX_VISIBLE_ROWS,
  maxCellLength: LIMITS.MAX_CELL_LENGTH,
};

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
          ↑↓ nav | Enter expand | a/p/f/e filter | x export | y copy
          {showHistory ? ' | H history' : ''} | ? help | q quit
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
        <Text color="cyan">[y]</Text> copy
        {showHistory ? (
          <>
            {' '}
            | <Text color="cyan">[H]</Text>istory
          </>
        ) : null}{' '}
        | <Text color="cyan">[?]</Text> help | q quit
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
 * Calculate summary statistics from table row data.
 *
 * Aggregates pass/fail/error counts, average scores, total cost, and
 * average latency across all cells in the provided rows.
 *
 * @param rows - Array of table row data containing cells with test results
 * @returns Summary statistics object containing:
 *   - passCount: Number of passing tests
 *   - failCount: Number of failing tests
 *   - errorCount: Number of tests with errors
 *   - totalTests: Total number of tests (pass + fail + error)
 *   - avgScore: Average score across all cells (null if no scores)
 *   - totalCost: Sum of all costs
 *   - avgLatencyMs: Average latency in milliseconds (null if no latency data)
 *
 * @example
 * ```ts
 * const stats = calculateSummaryStats(tableRows);
 * console.log(`Pass rate: ${(stats.passCount / stats.totalTests * 100).toFixed(1)}%`);
 * ```
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
const NOTIFICATION_STYLES: Record<string, { color: string; icon: string }> = {
  success: { color: 'green', icon: '✓' },
  error: { color: 'red', icon: '✗' },
  info: { color: 'cyan', icon: 'ℹ' },
};

function NotificationBar({
  message,
  type,
}: {
  message: string;
  type: 'success' | 'error' | 'info';
}) {
  const { color, icon } = NOTIFICATION_STYLES[type];

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

  const passRateNum =
    stats.totalTests > 0 ? Math.round((stats.passCount / stats.totalTests) * 100) : 0;
  const passRateColor = getScoreColor(passRateNum);

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
      <Text color={passRateColor}>{passRateNum}%</Text>
      {stats.avgScore !== null && (
        <>
          <Text dimColor> │ </Text>
          <Text dimColor>Avg score: </Text>
          <Text color={getScoreColor(stats.avgScore * 100)}>
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
 * Input bar that shows search, command, or help text depending on current mode.
 */
function InputBar({
  filter,
  filteredCount,
  totalCount,
  isCompact,
  showHistory,
}: {
  filter: TableFilterState;
  filteredCount: number;
  totalCount: number;
  isCompact: boolean;
  showHistory: boolean;
}) {
  if (filter.isSearching) {
    return (
      <SearchInput
        query={filter.searchQuery || ''}
        isActive={filter.isSearching}
        matchCount={filteredCount}
        totalCount={totalCount}
      />
    );
  }
  if (filter.isCommandMode) {
    return (
      <CommandInput
        input={filter.commandInput}
        isActive={filter.isCommandMode}
        error={filter.commandError}
      />
    );
  }
  return <HelpText isCompact={isCompact} showHistory={showHistory} />;
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
      const timer = setTimeout(() => setNotification(null), TIMING.NOTIFICATION_TIMEOUT_MS);
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

  // Handle copy operation (async to avoid blocking UI)
  // Note: uses `data` directly since filteredRows is computed later.
  // When filters are active, we add a comment noting results are from the full dataset.
  const handleCopy = useCallback(async () => {
    const content = convertTableToFormat(data, 'json');
    const result = await copyToClipboard(content);

    if (result.success) {
      setNotification({ message: 'Results copied to clipboard', type: 'success' });
    } else {
      setNotification({ message: result.error || 'Failed to copy', type: 'error' });
    }
  }, [data]);

  // Track filtered row count for navigation bounds.
  // Uses state to break circular dependency: filteredRows depends on navigation.filter,
  // but useTableNavigation needs the filtered count for correct bounds.
  const [filteredRowCount, setFilteredRowCount] = useState(processedRows.length);

  const isInteractive = interactive && isRawModeSupported();
  const navigation = useTableNavigation({
    rowCount: filteredRowCount,
    colCount: layout.columns.length,
    visibleRows: layout.visibleRowCount,
    hasIndexColumn: showIndex,
    isActive: isInteractive && !layout.isCompact && !isExporting && !isHistoryOpen && !isHelpOpen,
    onExit,
    onExpand: (row, _col) => {
      if (onRowSelect && filteredRows[row]) {
        onRowSelect(filteredRows[row].originalRow, row);
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

  // Sync filtered row count to navigation bounds
  const { dispatch: navDispatch } = navigation;
  useEffect(() => {
    setFilteredRowCount(filteredRows.length);
    // Always clamp - handles both reducing rows and zero-row case
    navDispatch({ type: 'CLAMP_SELECTION', maxRow: filteredRows.length });
  }, [filteredRows.length, navDispatch]);

  // Auto-close expansion on index columns (cannot dispatch during render)
  useEffect(() => {
    if (navigation.expandedCell) {
      const column = layout.columns[navigation.expandedCell.col];
      if (column?.type === 'index') {
        navDispatch({ type: 'CLOSE_EXPAND' });
      }
    }
  }, [navigation.expandedCell, layout.columns, navDispatch]);

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

    // Guard against out-of-bounds column/row indices
    if (!column || !rowData) {
      // Auto-close invalid expansion
      navigation.dispatch({ type: 'CLOSE_EXPAND' });
    }

    // Handle var column expansion - show full content with navigation
    if (column?.type === 'var' && rowData) {
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

    // Find the appropriate cell data for output columns
    let cellData: TableCellData | undefined;
    let outputIdx = 0;
    if (column?.type === 'output') {
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
        <InputBar
          filter={navigation.filter}
          filteredCount={filteredRows.length}
          totalCount={processedRows.length}
          isCompact={true}
          showHistory={!!onTableDataChange}
        />
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
      {isInteractive && (
        <InputBar
          filter={navigation.filter}
          filteredCount={filteredRows.length}
          totalCount={processedRows.length}
          isCompact={false}
          showHistory={!!onTableDataChange}
        />
      )}
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
