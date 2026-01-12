/**
 * useTableLayout - Hook for calculating table layout and column widths.
 *
 * This hook computes responsive column widths based on:
 * - Terminal width
 * - Number of variable columns
 * - Number of output columns
 * - Content characteristics
 */

import { useMemo } from 'react';

import { LIMITS, TABLE_LAYOUT } from '../../constants';
import { useTerminalSize } from '../../hooks/useTerminalSize';

import type { CompletedPrompt, EvaluateTable, TableColumn, TableLayout } from './types';

/**
 * Layout configuration constants.
 * Uses centralized constants from ../../constants.ts
 */
const LAYOUT_CONFIG = {
  /** Minimum terminal width for table mode */
  MIN_TABLE_WIDTH: TABLE_LAYOUT.MIN_TABLE_WIDTH,
  /** Index column width */
  INDEX_WIDTH: TABLE_LAYOUT.INDEX_WIDTH,
  /** Minimum variable column width */
  MIN_VAR_WIDTH: TABLE_LAYOUT.MIN_VAR_WIDTH,
  /** Maximum variable column width */
  MAX_VAR_WIDTH: TABLE_LAYOUT.MAX_VAR_WIDTH,
  /** Minimum output column width */
  MIN_OUTPUT_WIDTH: TABLE_LAYOUT.MIN_OUTPUT_WIDTH,
  /** Border/separator overhead per column */
  BORDER_OVERHEAD: 3, // ' | ' between columns
  /** Status badge width + space */
  BADGE_WIDTH: TABLE_LAYOUT.BADGE_WIDTH,
  /** Number of visible rows before scrolling */
  DEFAULT_VISIBLE_ROWS: LIMITS.MAX_VISIBLE_ROWS,
};

/**
 * Calculate optimal column widths based on available space.
 */
function calculateColumnWidths(
  terminalWidth: number,
  varNames: string[],
  prompts: CompletedPrompt[],
  showIndex: boolean,
): TableColumn[] {
  const columns: TableColumn[] = [];

  // Start with index column if enabled
  if (showIndex) {
    columns.push({
      id: '__index__',
      header: '#',
      type: 'index',
      width: LAYOUT_CONFIG.INDEX_WIDTH,
      minWidth: LAYOUT_CONFIG.INDEX_WIDTH,
      maxWidth: LAYOUT_CONFIG.INDEX_WIDTH,
    });
  }

  // Add variable columns
  for (const varName of varNames) {
    columns.push({
      id: `var:${varName}`,
      header: varName,
      type: 'var',
      width: 0, // Will be calculated
      minWidth: LAYOUT_CONFIG.MIN_VAR_WIDTH,
      maxWidth: LAYOUT_CONFIG.MAX_VAR_WIDTH,
    });
  }

  // Add output columns
  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    const provider = prompt.provider || 'unknown';
    const label = prompt.label || `Prompt ${i + 1}`;
    const header = `[${provider}] ${label}`;

    columns.push({
      id: `output:${i}`,
      header,
      type: 'output',
      width: 0, // Will be calculated
      minWidth: LAYOUT_CONFIG.MIN_OUTPUT_WIDTH,
      prompt,
    });
  }

  // Calculate available width
  const totalBorderOverhead = (columns.length + 1) * LAYOUT_CONFIG.BORDER_OVERHEAD;
  const fixedWidth = columns.filter((c) => c.type === 'index').reduce((sum, c) => sum + c.width, 0);
  const availableWidth = terminalWidth - totalBorderOverhead - fixedWidth;

  // Count flexible columns
  const varColumns = columns.filter((c) => c.type === 'var');
  const outputColumns = columns.filter((c) => c.type === 'output');
  const flexColumnCount = varColumns.length + outputColumns.length;

  if (flexColumnCount === 0) {
    return columns;
  }

  // Distribute width: vars get 30%, outputs get 70%
  const varTotalWidth = Math.floor(availableWidth * 0.3);
  const outputTotalWidth = availableWidth - varTotalWidth;

  // Distribute among variable columns
  if (varColumns.length > 0) {
    const varWidth = Math.floor(varTotalWidth / varColumns.length);
    for (const col of varColumns) {
      col.width = Math.max(col.minWidth!, Math.min(col.maxWidth!, varWidth));
    }
  }

  // Distribute among output columns
  if (outputColumns.length > 0) {
    const outputWidth = Math.floor(outputTotalWidth / outputColumns.length);
    for (const col of outputColumns) {
      col.width = Math.max(col.minWidth!, outputWidth);
    }
  }

  // Adjust if we have leftover or overflow
  const totalUsed = columns.reduce((sum, c) => sum + c.width, 0);
  const diff = availableWidth + fixedWidth - totalUsed;

  if (diff > 0 && outputColumns.length > 0) {
    // Distribute extra space to output columns
    const extra = Math.floor(diff / outputColumns.length);
    for (const col of outputColumns) {
      col.width += extra;
    }
  }

  return columns;
}

/**
 * Process header text for display, truncating if needed.
 * Handles Unicode properly by using code points instead of UTF-16 code units.
 */
function processHeaderText(header: string, maxWidth: number): string {
  // Use spread operator to properly count code points, not code units
  const codePoints = [...header];
  if (codePoints.length <= maxWidth) {
    return header;
  }
  if (maxWidth <= 3) {
    return '...'.slice(0, maxWidth);
  }
  return codePoints.slice(0, maxWidth - 1).join('') + '…';
}

/**
 * Hook to calculate table layout based on terminal size and data.
 */
export function useTableLayout(
  data: EvaluateTable,
  options: {
    showIndex?: boolean;
    maxVisibleRows?: number;
  } = {},
): TableLayout {
  const { showIndex = true, maxVisibleRows = LAYOUT_CONFIG.DEFAULT_VISIBLE_ROWS } = options;
  const { width: terminalWidth, height: terminalHeight } = useTerminalSize();

  return useMemo(() => {
    const { head, body } = data;

    // Check if terminal is too narrow for table mode
    const isCompact = terminalWidth < LAYOUT_CONFIG.MIN_TABLE_WIDTH;

    // Calculate columns
    const columns = calculateColumnWidths(terminalWidth, head.vars, head.prompts, showIndex);

    // Process headers for display width
    for (const col of columns) {
      col.header = processHeaderText(col.header, col.width);
    }

    // Calculate content width (sum of column widths)
    const contentWidth = columns.reduce((sum, c) => sum + c.width, 0);

    // Calculate visible rows based on terminal height
    // Reserve space for: header (2 lines), borders (2), status line (1), padding (2)
    const reservedLines = LIMITS.RESERVED_UI_LINES;
    const availableLines = Math.max(5, terminalHeight - reservedLines);
    const visibleRowCount = Math.min(maxVisibleRows, availableLines, body.length);

    return {
      terminalWidth,
      contentWidth,
      columns,
      isCompact,
      visibleRowCount,
    };
  }, [data, terminalWidth, terminalHeight, showIndex, maxVisibleRows]);
}

/**
 * Calculate layout without hook (for non-React contexts or testing).
 */
export function calculateTableLayout(
  data: EvaluateTable,
  terminalWidth: number,
  terminalHeight: number,
  options: {
    showIndex?: boolean;
    maxVisibleRows?: number;
  } = {},
): TableLayout {
  const { showIndex = true, maxVisibleRows = LAYOUT_CONFIG.DEFAULT_VISIBLE_ROWS } = options;
  const { head, body } = data;

  const isCompact = terminalWidth < LAYOUT_CONFIG.MIN_TABLE_WIDTH;
  const columns = calculateColumnWidths(terminalWidth, head.vars, head.prompts, showIndex);

  for (const col of columns) {
    col.header = processHeaderText(col.header, col.width);
  }

  const contentWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const reservedLines = LIMITS.RESERVED_UI_LINES;
  const availableLines = Math.max(5, terminalHeight - reservedLines);
  const visibleRowCount = Math.min(maxVisibleRows, availableLines, body.length);

  return {
    terminalWidth,
    contentWidth,
    columns,
    isCompact,
    visibleRowCount,
  };
}
