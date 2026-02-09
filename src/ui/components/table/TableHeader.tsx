/**
 * TableHeader - Renders the column headers for the results table.
 *
 * Features:
 * - Blue/bold styling for headers
 * - Separator line below headers
 * - Truncation for long headers
 * - Compact mode support
 */

import React, { memo } from 'react';

import { Box, Text } from 'ink';
import { padText } from '../../utils/format';

import type { TableColumn, TableHeaderProps } from './types';

/**
 * Single header cell component.
 */
function HeaderCell({ column }: { column: TableColumn }) {
  const paddedHeader = padText(column.header, column.width, 'left', true);

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
 * Memoized since headers rarely change (only when columns change).
 */
export const TableHeader = memo(function TableHeader({
  columns,
  isCompact = false,
}: TableHeaderProps) {
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
});
