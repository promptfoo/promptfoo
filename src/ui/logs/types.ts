/**
 * Type definitions for the log viewer.
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'unknown';

/**
 * A parsed log entry representing a single log event with optional continuation lines.
 */
export interface LogEntry {
  /** Unique entry index (not line index) */
  id: number;

  /** First line number in original file (1-indexed for display) */
  startLine: number;

  /** Last line number in original file */
  endLine: number;

  /** Parsed timestamp, null if unparseable */
  timestamp: Date | null;

  /** Log level extracted from the line */
  level: LogLevel;

  /** Source file reference, e.g., "logger.ts:1" */
  source: string | null;

  /** The main log message (content after metadata) */
  message: string;

  /** The full first line (original text) */
  firstLine: string;

  /** Continuation lines (stack traces, JSON, etc.) */
  continuationLines: string[];

  /** Hash for duplicate detection */
  contentHash: string;
}

/**
 * A group of consecutive duplicate entries.
 */
export interface EntryGroup {
  /** The representative entry */
  entry: LogEntry;

  /** Number of duplicates (including the first one) */
  count: number;

  /** All entries in this group (for expansion) */
  entries: LogEntry[];
}

/**
 * Filter state for the log viewer.
 */
export interface LogFilter {
  /** Text search query */
  searchQuery: string;

  /** Level filter */
  levelFilter: LogLevel | 'all';

  /** Source file filter (null = all sources) */
  sourceFilter: Set<string> | null;
}

/**
 * View mode for the log viewer.
 */
export type ViewMode = 'normal' | 'search' | 'detail' | 'source-filter';

/**
 * Props for the LogEntryRow component.
 */
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

  /** Callback when expand/collapse is toggled */
  onToggleExpand?: () => void;
}
