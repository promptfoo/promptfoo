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
import { useEffect, useMemo } from 'react';
import { isRawModeSupported } from '../../hooks/useKeypress';
import { CellDetailOverlay, VarDetailOverlay } from './CellDetailOverlay';
import { CommandInput } from './CommandInput';
import { filterRows, getFilterModeLabel, hasActiveFilter, parseSearchQuery } from './filterUtils';
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
function HelpText({ isCompact }: { isCompact: boolean }) {
  if (!isRawModeSupported()) {
    return null;
  }

  if (isCompact) {
    return (
      <Box marginTop={1}>
        <Text dimColor>↑↓ nav | Enter expand | a/p/f/e filter | q quit</Text>
      </Box>
    );
  }

  return (
    <Box marginTop={1} flexDirection="column">
      <Text dimColor>
        ↑↓←→/hjkl nav | Enter expand | g/G first/last | <Text color="cyan">[a]</Text>ll{' '}
        <Text color="cyan">[p]</Text>ass <Text color="cyan">[f]</Text>ail{' '}
        <Text color="cyan">[e]</Text>rr <Text color="cyan">[d]</Text>iff |{' '}
        <Text color="cyan">/</Text> search | <Text color="cyan">:</Text> filter | q quit
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

  // Set up keyboard navigation (initially with full row count, will be adjusted after filtering)
  const isInteractive = interactive && isRawModeSupported();
  const navigation = useTableNavigation({
    rowCount: processedRows.length,
    colCount: layout.columns.length,
    visibleRows: layout.visibleRowCount,
    hasIndexColumn: showIndex,
    isActive: isInteractive && !layout.isCompact,
    onExit,
    onExpand: (row, _col) => {
      if (onRowSelect && processedRows[row]) {
        onRowSelect(processedRows[row].originalRow, row);
      }
    },
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
          varNames={data.head.vars}
          onNavigate={(direction) => {
            navigation.dispatch({ type: 'NAVIGATE_EXPANDED', direction });
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
          <HelpText isCompact={true} />
        )}
      </Box>
    );
  }

  // Standard table mode
  return (
    <Box flexDirection="column">
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
          <HelpText isCompact={false} />
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
