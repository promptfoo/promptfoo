/**
 * TableHeader - Renders the column headers for the results table.
 *
 * Features:
 * - Blue/bold styling for headers
 * - Separator line below headers
 * - Truncation for long headers
 * - Compact mode support
 */

import { Box, Text } from 'ink';
import React from 'react';
import type { TableColumn, TableHeaderProps } from './types';

/**
 * Pad text to a specific width.
 */
function padText(text: string, width: number): string {
  if (text.length >= width) {
    return text.slice(0, width);
  }
  return text + ' '.repeat(width - text.length);
}

/**
 * Single header cell component.
 */
function HeaderCell({ column }: { column: TableColumn }) {
  const paddedHeader = padText(column.header, column.width);

  return (
    <Text bold color="blue">
      {paddedHeader}
    </Text>
  );
}

/**
 * Separator between columns.
 */
function ColumnSeparator() {
  return <Text dimColor> | </Text>;
}

/**
 * Horizontal rule below headers.
 */
function HeaderDivider({ totalWidth }: { totalWidth: number }) {
  return (
    <Box>
      <Text dimColor>{'─'.repeat(totalWidth)}</Text>
    </Box>
  );
}

/**
 * TableHeader component renders the column headers.
 */
export function TableHeader({ columns, isCompact = false }: TableHeaderProps) {
  if (isCompact) {
    // In compact mode, show a simplified header
    return (
      <Box flexDirection="column">
        <Text bold color="blue">
          Results
        </Text>
        <Text dimColor>{'─'.repeat(40)}</Text>
      </Box>
    );
  }

  // Calculate total width for divider
  const totalWidth = columns.reduce((sum, col) => sum + col.width, 0) + (columns.length - 1) * 3;

  return (
    <Box flexDirection="column">
      <Box>
        {columns.map((column, idx) => (
          <React.Fragment key={column.id}>
            {idx > 0 && <ColumnSeparator />}
            <HeaderCell column={column} />
          </React.Fragment>
        ))}
      </Box>
      <HeaderDivider totalWidth={totalWidth} />
    </Box>
  );
}

/**
 * Minimal header for very narrow terminals.
 */
export function MinimalHeader() {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="blue">
        Evaluation Results
      </Text>
      <Text dimColor>{'─'.repeat(20)}</Text>
    </Box>
  );
}

export default TableHeader;
