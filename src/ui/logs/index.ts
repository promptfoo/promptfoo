/**
 * Interactive log viewer module.
 *
 * This module provides an Ink-based interactive log viewer with:
 * - Entry-based parsing (not line-based)
 * - Collapsible stack traces
 * - Duplicate grouping
 * - Relative timestamps
 * - Source file filtering
 * - Vim-style navigation
 */

export { LogViewer } from './LogViewer';
export {
  filterEntries,
  formatRelativeTime,
  formatTimestamp,
  getLevelColor,
  getLevelCounts,
  getSourceCounts,
  groupDuplicateEntries,
  hasMeaningfulContinuation,
  isLogEntryStart,
  parseLogEntries,
} from './logParser';
export { runInteractiveLogViewer } from './logsRunner';

export type { LogViewerProps } from './LogViewer';
export type { LogViewerOptions } from './logsRunner';
export type { EntryGroup, LogEntry, LogFilter, LogLevel, ViewMode } from './types';
