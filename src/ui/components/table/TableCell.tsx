/**
 * TableCell - Renders a single cell in the results table.
 *
 * Features:
 * - Content truncation with ellipsis
 * - Status-based coloring for output cells
 * - Optional status badge prefix
 * - Selection highlighting
 * - Newline normalization
 */

import { Box, Text } from 'ink';
import { memo } from 'react';
import { StatusBadge, getStatusBadgeWidth } from './StatusBadge';
import type { TableCellProps } from './types';

/**
 * Normalize content for display - replace newlines with spaces.
 */
function normalizeContent(content: string): string {
  return content.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Truncate text to fit within a given width.
 * Handles Unicode properly by using code points instead of UTF-16 code units.
 */
function truncateText(text: string, maxWidth: number): { text: string; truncated: boolean } {
  // Use spread operator to properly count code points, not code units
  // This prevents cutting through surrogate pairs (emojis, etc.)
  const codePoints = [...text];
  if (codePoints.length <= maxWidth) {
    return { text, truncated: false };
  }
  if (maxWidth <= 3) {
    return { text: '...'.slice(0, maxWidth), truncated: true };
  }
  // Join code points back together to preserve multi-byte characters
  return { text: codePoints.slice(0, maxWidth - 1).join('') + '…', truncated: true };
}

/**
 * Pad text to a specific width.
 * Handles Unicode properly by using code points instead of UTF-16 code units.
 */
function padText(text: string, width: number, align: 'left' | 'right' | 'center' = 'left'): string {
  // Use spread operator to properly count code points, not code units
  const codePoints = [...text];
  if (codePoints.length >= width) {
    return text;
  }

  const padding = width - codePoints.length;

  switch (align) {
    case 'right':
      return ' '.repeat(padding) + text;
    case 'center': {
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
    }
    default:
      return text + ' '.repeat(padding);
  }
}

/**
 * TableCell component renders a single cell with optional status badge.
 * Memoized to prevent re-renders when parent state changes but cell data is unchanged.
 */
export const TableCell = memo(function TableCell({
  data,
  width,
  isSelected = false,
  showBadge = true,
}: TableCellProps) {
  const { content, status } = data;

  // Normalize content (remove newlines)
  const normalized = normalizeContent(content);

  // Calculate available width for content
  const badgeWidth = showBadge && status ? getStatusBadgeWidth(status) + 1 : 0; // +1 for space
  const contentWidth = Math.max(1, width - badgeWidth);

  // Truncate if needed
  const { text: displayText } = truncateText(normalized, contentWidth);

  // Pad to fill cell width
  const paddedText = padText(displayText, contentWidth);

  // Determine text color based on status
  const getTextColor = (): string | undefined => {
    if (!status) {
      return undefined;
    }
    switch (status) {
      case 'pass':
        return 'green';
      case 'fail':
      case 'error':
        return 'red';
      default:
        return undefined;
    }
  };

  const textColor = getTextColor();

  return (
    <Box width={width}>
      {showBadge && status && (
        <>
          <StatusBadge status={status} />
          <Text> </Text>
        </>
      )}
      <Text
        color={isSelected ? 'cyan' : showBadge && status ? undefined : textColor}
        bold={isSelected}
        inverse={isSelected}
      >
        {paddedText}
      </Text>
    </Box>
  );
});

/**
 * Simple text cell without status handling (for variable columns).
 * Uses different highlight style than output cells (no inverse) to
 * indicate different interaction behavior.
 * Memoized to prevent re-renders when parent state changes but cell data is unchanged.
 */
export const TextCell = memo(function TextCell({
  content,
  width,
  isSelected = false,
  dimColor = false,
}: {
  content: string;
  width: number;
  isSelected?: boolean;
  dimColor?: boolean;
}) {
  const normalized = normalizeContent(content);
  const { text: displayText } = truncateText(normalized, width);
  const paddedText = padText(displayText, width);

  // Note: No inverse for var cells - they're expandable but have simpler content
  // This visually differentiates them from output cells which have full detail overlays
  return (
    <Text
      color={isSelected ? 'cyan' : undefined}
      bold={isSelected}
      dimColor={dimColor && !isSelected}
    >
      {paddedText}
    </Text>
  );
});

/**
 * Index cell with right-aligned number.
 * Index cells are not expandable, so they always show as dimColor
 * and don't get the selection highlight that other cells get.
 * Memoized since index rarely changes.
 */
export const IndexCell = memo(function IndexCell({
  index,
  width,
  isSelected: _isSelected = false,
}: {
  index: number;
  width: number;
  isSelected?: boolean;
}) {
  const text = String(index + 1); // 1-based display
  const paddedText = padText(text, width, 'right');

  // Index cells don't expand, so show minimal selection indicator
  return <Text dimColor>{paddedText}</Text>;
});

export default TableCell;
