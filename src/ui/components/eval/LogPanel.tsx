/**
 * LogPanel component for displaying captured log entries in verbose mode.
 *
 * This component shows a scrollable log display that appears when the user
 * toggles verbose mode with the 'v' key.
 */

import { Box, Text } from 'ink';
import { useMemo } from 'react';
import type { LogEntry } from '../../contexts/EvalContext';

export interface LogPanelProps {
  /** Log entries to display */
  logs: LogEntry[];
  /** Maximum number of logs to show */
  maxLines?: number;
  /** Whether to show timestamps */
  showTimestamps?: boolean;
  /** Whether the panel is in verbose mode (shows debug level) */
  verbose?: boolean;
}

// Log level colors
const LEVEL_COLORS: Record<LogEntry['level'], string> = {
  debug: 'gray',
  info: 'blue',
  warn: 'yellow',
  error: 'red',
};

// Log level labels (fixed width for alignment)
const LEVEL_LABELS: Record<LogEntry['level'], string> = {
  debug: 'DBG',
  info: 'INF',
  warn: 'WRN',
  error: 'ERR',
};

/**
 * Format a timestamp for display.
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Truncate a message to fit in a single line.
 */
function truncateMessage(message: string, maxLength: number): string {
  // Remove newlines and normalize whitespace
  const normalized = message.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return normalized.slice(0, maxLength - 3) + '...';
}

/**
 * Single log entry row.
 */
function LogEntryRow({
  entry,
  showTimestamp,
  maxMessageLength,
}: {
  entry: LogEntry;
  showTimestamp: boolean;
  maxMessageLength: number;
}) {
  const levelColor = LEVEL_COLORS[entry.level];
  const levelLabel = LEVEL_LABELS[entry.level];

  return (
    <Box>
      {showTimestamp && (
        <Text dimColor>
          {formatTimestamp(entry.timestamp)}{' '}
        </Text>
      )}
      <Text color={levelColor}>[{levelLabel}]</Text>
      <Text> {truncateMessage(entry.message, maxMessageLength)}</Text>
    </Box>
  );
}

/**
 * Log panel component that displays recent log entries.
 */
export function LogPanel({
  logs,
  maxLines = 10,
  showTimestamps = false,
  verbose = false,
}: LogPanelProps) {
  // Filter logs based on verbose mode
  const filteredLogs = useMemo(() => {
    if (verbose) {
      // Show all logs in verbose mode
      return logs;
    }
    // In normal mode, only show warn and error
    return logs.filter((log) => log.level === 'warn' || log.level === 'error');
  }, [logs, verbose]);

  // Get the most recent logs up to maxLines
  const displayLogs = useMemo(() => {
    return filteredLogs.slice(-maxLines);
  }, [filteredLogs, maxLines]);

  // Calculate max message length (terminal width minus overhead)
  // Timestamp: 9 chars + space = 10
  // Level: 5 chars ([XXX]) + space = 6
  // Total overhead: ~16 chars, assume 80 char width
  const maxMessageLength = showTimestamps ? 54 : 64;

  if (displayLogs.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        marginTop={1}
      >
        <Box>
          <Text dimColor>Logs {verbose ? '(verbose)' : ''}</Text>
        </Box>
        <Box>
          <Text dimColor>No logs to display</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      marginTop={1}
    >
      <Box>
        <Text dimColor>
          Logs {verbose ? '(verbose)' : '(warnings/errors only)'} - {displayLogs.length} entries
        </Text>
      </Box>
      {displayLogs.map((entry, index) => (
        <LogEntryRow
          key={`${entry.timestamp}-${index}`}
          entry={entry}
          showTimestamp={showTimestamps}
          maxMessageLength={maxMessageLength}
        />
      ))}
    </Box>
  );
}

export default LogPanel;
