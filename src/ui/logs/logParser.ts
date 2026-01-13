/**
 * Log parsing utilities for the interactive log viewer.
 *
 * Parses log lines into semantic entries with:
 * - Timestamp extraction
 * - Level detection
 * - Source file extraction
 * - Continuation line grouping (stack traces)
 * - Duplicate detection
 */

import type { EntryGroup, LogEntry, LogLevel } from './types';

/**
 * Pattern to match a log entry line.
 * Format: 2026-01-13T04:02:20.142Z [LEVEL] [source:line]: message
 * or:     2026-01-13T04:02:20.142Z [LEVEL]: message
 */
const LOG_ENTRY_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+\[(ERROR|WARN|INFO|DEBUG)\](?:\s+\[([^\]]+)\])?:?\s*(.*)$/;

/**
 * Check if a line is the start of a new log entry.
 */
export function isLogEntryStart(line: string): boolean {
  return LOG_ENTRY_PATTERN.test(line);
}

/**
 * Parse a log level string to LogLevel type.
 */
function parseLevel(levelStr: string): LogLevel {
  const normalized = levelStr.toUpperCase();
  switch (normalized) {
    case 'ERROR':
      return 'error';
    case 'WARN':
      return 'warn';
    case 'INFO':
      return 'info';
    case 'DEBUG':
      return 'debug';
    default:
      return 'unknown';
  }
}

/**
 * Generate a content hash for duplicate detection.
 * Excludes timestamp so identical messages group together.
 */
function generateContentHash(level: LogLevel, source: string | null, message: string): string {
  return `${level}|${source ?? ''}|${message}`;
}

/**
 * Parse a single log entry from a line.
 */
function parseEntryLine(line: string): {
  timestamp: Date | null;
  level: LogLevel;
  source: string | null;
  message: string;
} | null {
  const match = line.match(LOG_ENTRY_PATTERN);
  if (!match) {
    return null;
  }

  const [, timestampStr, levelStr, source, message] = match;

  let timestamp: Date | null = null;
  try {
    timestamp = new Date(timestampStr);
    if (isNaN(timestamp.getTime())) {
      timestamp = null;
    }
  } catch {
    timestamp = null;
  }

  return {
    timestamp,
    level: parseLevel(levelStr),
    source: source ?? null,
    message: message.trim(),
  };
}

/**
 * Parse log lines into structured entries.
 *
 * Groups continuation lines (stack traces, JSON) with their parent entry.
 */
export function parseLogEntries(lines: string[]): LogEntry[] {
  const entries: LogEntry[] = [];
  let currentEntry: LogEntry | null = null;
  let entryId = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1; // 1-indexed for display

    const parsed = parseEntryLine(line);

    if (parsed) {
      // This is a new log entry
      if (currentEntry) {
        entries.push(currentEntry);
      }

      currentEntry = {
        id: entryId++,
        startLine: lineNumber,
        endLine: lineNumber,
        timestamp: parsed.timestamp,
        level: parsed.level,
        source: parsed.source,
        message: parsed.message,
        firstLine: line,
        continuationLines: [],
        contentHash: generateContentHash(parsed.level, parsed.source, parsed.message),
      };
    } else if (currentEntry) {
      // This is a continuation line
      currentEntry.continuationLines.push(line);
      currentEntry.endLine = lineNumber;
    } else {
      // Orphan line before any entry - create an unknown entry
      currentEntry = {
        id: entryId++,
        startLine: lineNumber,
        endLine: lineNumber,
        timestamp: null,
        level: 'unknown',
        source: null,
        message: line,
        firstLine: line,
        continuationLines: [],
        contentHash: generateContentHash('unknown', null, line),
      };
    }
  }

  // Don't forget the last entry
  if (currentEntry) {
    entries.push(currentEntry);
  }

  return entries;
}

/**
 * Group consecutive duplicate entries.
 *
 * Entries are considered duplicates if they have the same contentHash
 * (same level, source, and message - excluding timestamp).
 */
export function groupDuplicateEntries(entries: LogEntry[]): EntryGroup[] {
  if (entries.length === 0) {
    return [];
  }

  const groups: EntryGroup[] = [];
  let currentGroup: EntryGroup = {
    entry: entries[0],
    count: 1,
    entries: [entries[0]],
  };

  for (let i = 1; i < entries.length; i++) {
    const entry = entries[i];

    if (entry.contentHash === currentGroup.entry.contentHash) {
      // Same as previous - add to group
      currentGroup.count++;
      currentGroup.entries.push(entry);
    } else {
      // Different - start new group
      groups.push(currentGroup);
      currentGroup = {
        entry,
        count: 1,
        entries: [entry],
      };
    }
  }

  // Don't forget the last group
  groups.push(currentGroup);

  return groups;
}

/**
 * Format a relative time string.
 *
 * @param date - The date to format
 * @param now - Current time (for testing)
 * @returns Formatted string like "2s ago", "5m ago", "1h ago"
 */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 0) {
    return 'future';
  }
  if (diffSec < 5) {
    return 'now';
  }
  if (diffSec < 60) {
    return `${diffSec}s ago`;
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    return `${diffHour}h ago`;
  }

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) {
    return `${diffDay}d ago`;
  }

  // Fall back to short date
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format a timestamp for display.
 *
 * @param date - The date to format
 * @param relative - Whether to use relative format
 * @param now - Current time (for testing)
 */
export function formatTimestamp(
  date: Date | null,
  relative: boolean = true,
  now: Date = new Date(),
): string {
  if (!date) {
    return '        '; // 8 spaces for alignment
  }

  if (relative) {
    const relStr = formatRelativeTime(date, now);
    // Pad to 8 chars for alignment
    return relStr.padStart(8, ' ');
  }

  // Absolute format: HH:MM:SS
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Get unique sources from entries with counts.
 */
export function getSourceCounts(entries: LogEntry[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    const source = entry.source ?? '(no source)';
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }

  return counts;
}

/**
 * Get level counts from entries.
 */
export function getLevelCounts(
  entries: LogEntry[],
): Record<'error' | 'warn' | 'info' | 'debug', number> {
  const counts = { error: 0, warn: 0, info: 0, debug: 0 };

  for (const entry of entries) {
    if (entry.level !== 'unknown') {
      counts[entry.level]++;
    }
  }

  return counts;
}

/**
 * Filter entries by level, source, and search query.
 */
export function filterEntries(
  entries: LogEntry[],
  options: {
    levelFilter?: LogLevel | 'all';
    sourceFilter?: Set<string> | null;
    searchQuery?: string;
  },
): LogEntry[] {
  let result = entries;

  // Level filter
  if (options.levelFilter && options.levelFilter !== 'all') {
    result = result.filter((e) => e.level === options.levelFilter);
  }

  // Source filter
  if (options.sourceFilter && options.sourceFilter.size > 0) {
    result = result.filter((e) => {
      const source = e.source ?? '(no source)';
      return options.sourceFilter!.has(source);
    });
  }

  // Search filter
  if (options.searchQuery) {
    const query = options.searchQuery.toLowerCase();
    result = result.filter((e) => {
      // Search in message
      if (e.message.toLowerCase().includes(query)) {
        return true;
      }
      // Search in first line
      if (e.firstLine.toLowerCase().includes(query)) {
        return true;
      }
      // Search in continuation lines
      return e.continuationLines.some((line) => line.toLowerCase().includes(query));
    });
  }

  return result;
}

/**
 * Get color for a log level.
 */
export function getLevelColor(level: LogLevel): string {
  switch (level) {
    case 'error':
      return 'red';
    case 'warn':
      return 'yellow';
    case 'info':
      return 'white';
    case 'debug':
      return 'cyan';
    default:
      return 'gray';
  }
}

/**
 * Check if an entry has meaningful continuation (not just empty lines).
 */
export function hasMeaningfulContinuation(entry: LogEntry): boolean {
  return entry.continuationLines.some((line) => line.trim().length > 0);
}
