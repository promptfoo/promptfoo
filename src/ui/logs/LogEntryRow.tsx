/**
 * Log entry row component with collapse/expand support.
 */

import React from 'react';

import { Box, Text } from 'ink';
import { truncate } from '../utils/format';
import { formatTimestamp, getLevelColor, hasMeaningfulContinuation } from './logParser';

import type { EntryGroup } from './types';

export interface LogEntryRowProps {
  /** The entry group to display */
  group: EntryGroup;

  /** Whether this entry is currently selected */
  isSelected: boolean;

  /** Whether continuation lines are expanded */
  isExpanded: boolean;

  /** Search query for highlighting */
  searchQuery: string;

  /** Whether to show relative timestamps */
  showRelativeTime: boolean;

  /** Maximum width for the row */
  maxWidth: number;

  /** Current time for relative timestamps */
  now?: Date;

  /** Maximum continuation lines to show when expanded (0 = all) */
  maxContinuationLines?: number;
}

/**
 * Highlight search matches within text.
 */
function HighlightedText({
  text,
  search,
  color,
  inverse,
}: {
  text: string;
  search: string;
  color: string;
  inverse?: boolean;
}): React.ReactElement {
  if (!search) {
    return (
      <Text color={color} inverse={inverse}>
        {text}
      </Text>
    );
  }

  // Find all matches (case-insensitive)
  const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);

  return (
    <Text inverse={inverse}>
      {parts.map((part, i) => {
        const isMatch = part.toLowerCase() === search.toLowerCase();
        return (
          <Text
            key={i}
            color={isMatch ? 'black' : color}
            backgroundColor={isMatch ? 'yellow' : undefined}
            bold={isMatch}
          >
            {part}
          </Text>
        );
      })}
    </Text>
  );
}

/**
 * Get level indicator character and color.
 */
function getLevelIndicator(level: string): { char: string; color: string } {
  switch (level) {
    case 'error':
      return { char: 'E', color: 'red' };
    case 'warn':
      return { char: 'W', color: 'yellow' };
    case 'info':
      return { char: 'I', color: 'white' };
    case 'debug':
      return { char: 'D', color: 'cyan' };
    default:
      return { char: '?', color: 'gray' };
  }
}

/**
 * Render a single log entry row with optional expansion.
 */
export function LogEntryRow({
  group,
  isSelected,
  isExpanded,
  searchQuery,
  showRelativeTime,
  maxWidth,
  now = new Date(),
  maxContinuationLines = 10,
}: LogEntryRowProps): React.ReactElement {
  const { entry, count } = group;
  const hasContent = hasMeaningfulContinuation(entry);
  const levelInfo = getLevelIndicator(entry.level);
  const color = getLevelColor(entry.level);

  // Layout widths
  const expanderWidth = 2; // "▸ " or "▾ " or "  "
  const timestampWidth = 9; // "  2s ago " or "HH:MM:SS "
  const levelWidth = 4; // "[E] " or "[D] "
  const sourceWidth = entry.source ? Math.min(entry.source.length + 3, 20) : 0; // "[source] "
  const countWidth = count > 1 ? String(count).length + 2 : 0; // " ×N"
  const paddingWidth = 4; // borders and spacing

  const messageWidth =
    maxWidth -
    expanderWidth -
    timestampWidth -
    levelWidth -
    sourceWidth -
    countWidth -
    paddingWidth;

  // Format timestamp
  const timestamp = formatTimestamp(entry.timestamp, showRelativeTime, now);

  // Determine expand indicator
  let expandIndicator = '  ';
  if (hasContent) {
    expandIndicator = isExpanded ? '▾ ' : '▸ ';
  }

  // Truncate message
  const truncatedMessage = truncate(entry.message, Math.max(10, messageWidth));

  // Build the main row
  const mainRow = (
    <Box>
      {/* Expand indicator */}
      <Text dimColor={!hasContent}>{expandIndicator}</Text>

      {/* Timestamp */}
      <Text dimColor inverse={isSelected}>
        {timestamp}
      </Text>
      <Text inverse={isSelected}> </Text>

      {/* Level indicator */}
      <Text color={levelInfo.color} inverse={isSelected}>
        [{levelInfo.char}]
      </Text>
      <Text inverse={isSelected}> </Text>

      {/* Source (if present) */}
      {entry.source && (
        <>
          <Text dimColor inverse={isSelected}>
            [{truncate(entry.source, 16)}]
          </Text>
          <Text inverse={isSelected}> </Text>
        </>
      )}

      {/* Message with highlighting */}
      <HighlightedText
        text={truncatedMessage}
        search={searchQuery}
        color={color}
        inverse={isSelected}
      />

      {/* Duplicate count badge */}
      {count > 1 && (
        <Text color="magenta" bold inverse={isSelected}>
          {' '}
          ×{count}
        </Text>
      )}
    </Box>
  );

  // If not expanded, just return the main row
  if (!isExpanded || !hasContent) {
    return mainRow;
  }

  // Render expanded continuation lines
  const continuationLines = entry.continuationLines;
  const showAll = maxContinuationLines === 0 || continuationLines.length <= maxContinuationLines;
  const linesToShow = showAll
    ? continuationLines
    : continuationLines.slice(0, maxContinuationLines);
  const hiddenCount = continuationLines.length - linesToShow.length;

  const continuationWidth = maxWidth - 6; // Indent for continuation

  return (
    <Box flexDirection="column">
      {mainRow}
      {linesToShow.map((line, idx) => (
        <Box key={idx} paddingLeft={2}>
          <Text dimColor>{truncate(line, continuationWidth)}</Text>
        </Box>
      ))}
      {hiddenCount > 0 && (
        <Box paddingLeft={2}>
          <Text dimColor italic>
            ... +{hiddenCount} more lines (Enter for full view)
          </Text>
        </Box>
      )}
    </Box>
  );
}

export default LogEntryRow;
