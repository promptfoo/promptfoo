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
 */
function truncateText(text: string, maxWidth: number): { text: string; truncated: boolean } {
  if (text.length <= maxWidth) {
    return { text, truncated: false };
  }
  if (maxWidth <= 3) {
    return { text: '...'.slice(0, maxWidth), truncated: true };
  }
  return { text: text.slice(0, maxWidth - 1) + '\u2026', truncated: true }; // \u2026 = …
}

/**
 * Pad text to a specific width.
 */
function padText(text: string, width: number, align: 'left' | 'right' | 'center' = 'left'): string {
  if (text.length >= width) {
    return text;
  }

  const padding = width - text.length;

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
 */
export function TableCell({ data, width, isSelected = false, showBadge = true }: TableCellProps) {
  const { content, status, isTruncated } = data;

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
      {isTruncated && !isSelected && <Text dimColor>\u2026</Text>}
    </Box>
  );
}

/**
 * Simple text cell without status handling (for variable columns).
 * Uses different highlight style than output cells (no inverse) to
 * indicate different interaction behavior.
 */
export function TextCell({
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
}

/**
 * Index cell with right-aligned number.
 * Index cells are not expandable, so they always show as dimColor
 * and don't get the selection highlight that other cells get.
 */
export function IndexCell({
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
}

export default TableCell;
