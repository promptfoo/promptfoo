/**
 * TableRow - Renders a single row in the results table.
 *
 * Features:
 * - Index cell (row number)
 * - Variable cells
 * - Output cells with status badges
 * - Row/cell selection highlighting
 * - Compact card mode for narrow terminals
 */

import { Box, Text } from 'ink';
import type { ReactNode } from 'react';
import { StatusBadge, StatusIndicator } from './StatusBadge';
import { IndexCell, TableCell, TextCell } from './TableCell';
import type { TableRowData, TableRowProps } from './types';

/**
 * Separator between columns.
 */
function ColumnSeparator({ isSelected = false }: { isSelected?: boolean }) {
  return <Text dimColor={!isSelected}> | </Text>;
}

/**
 * Standard table row layout with columns.
 */
export function TableRow({
  rowData,
  columns,
  isSelected = false,
  selectedCol,
  isCompact = false,
}: TableRowProps) {
  if (isCompact) {
    return <CompactRow rowData={rowData} isSelected={isSelected} />;
  }

  let varIdx = 0;
  let outputIdx = 0;

  return (
    <Box>
      {columns.map((column, colIdx) => {
        const isCellSelected = isSelected && selectedCol === colIdx;

        let cellContent: ReactNode;

        switch (column.type) {
          case 'index':
            cellContent = (
              <IndexCell index={rowData.index} width={column.width} isSelected={isCellSelected} />
            );
            break;

          case 'var': {
            const varValue = rowData.originalRow.vars[varIdx++] || '';
            cellContent = (
              <TextCell content={varValue} width={column.width} isSelected={isCellSelected} />
            );
            break;
          }

          case 'output': {
            const cellData = rowData.cells[outputIdx++];
            if (cellData) {
              cellContent = (
                <TableCell
                  data={cellData}
                  width={column.width}
                  isSelected={isCellSelected}
                  showBadge={true}
                />
              );
            } else {
              cellContent = (
                <TextCell content="-" width={column.width} isSelected={isCellSelected} dimColor />
              );
            }
            break;
          }
        }

        return (
          <Box key={column.id} flexShrink={0}>
            {colIdx > 0 && <ColumnSeparator isSelected={isSelected} />}
            {cellContent}
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * Compact card-style row for narrow terminals.
 */
export function CompactRow({
  rowData,
  isSelected = false,
}: {
  rowData: TableRowData;
  isSelected?: boolean;
}) {
  const { index, originalRow, cells } = rowData;

  return (
    <Box
      flexDirection="column"
      borderStyle={isSelected ? 'single' : 'round'}
      borderColor={isSelected ? 'cyan' : 'gray'}
      paddingX={1}
      marginBottom={1}
    >
      {/* Row header */}
      <Box>
        <Text bold color={isSelected ? 'cyan' : undefined}>
          Test #{index + 1}
        </Text>
        {/* Show summary status */}
        <Text> </Text>
        {cells.map((cell, i) => (
          <Text key={i}>
            {i > 0 && ' '}
            <StatusIndicator status={cell.status} />
          </Text>
        ))}
      </Box>

      {/* Variables */}
      {originalRow.vars.length > 0 && (
        <Box marginTop={1}>
          <Text dimColor>Vars: </Text>
          <Text>
            {originalRow.vars
              .slice(0, 3)
              .map((v, i) => (i > 0 ? ', ' : '') + truncateForCompact(v, 20))
              .join('')}
            {originalRow.vars.length > 3 && '...'}
          </Text>
        </Box>
      )}

      {/* Outputs */}
      {cells.map((cell, i) => (
        <Box key={i} flexDirection="column" marginTop={1}>
          <Box>
            <StatusBadge status={cell.status} />
            <Text> </Text>
            <Text dimColor>{cell.output?.provider || `Output ${i + 1}`}</Text>
          </Box>
          <Box marginLeft={2}>
            <Text wrap="truncate-end">{truncateForCompact(cell.content, 60)}</Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/**
 * Truncate text for compact display.
 */
function truncateForCompact(text: string, maxLength: number): string {
  const normalized = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return normalized.slice(0, maxLength - 1) + '\u2026';
}

/**
 * Row divider line.
 */
export function RowDivider({ width }: { width: number }) {
  return (
    <Box>
      <Text dimColor>{'─'.repeat(width)}</Text>
    </Box>
  );
}

export default TableRow;
