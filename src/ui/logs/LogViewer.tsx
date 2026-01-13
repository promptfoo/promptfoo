/**
 * Interactive log viewer component with semantic entry parsing.
 *
 * Features:
 * - Entry-based view (not line-based)
 * - Collapsible stack traces
 * - Duplicate grouping with ×N badges
 * - Relative timestamps
 * - Source file filtering
 * - Vim-style navigation
 * - Live tail mode
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Box, Text, useApp, useInput } from 'ink';
import { useTerminalSize } from '../hooks/useTerminalSize';
import { truncate } from '../utils/format';
import { LogEntryRow } from './LogEntryRow';
import {
  filterEntries,
  getLevelColor,
  getLevelCounts,
  getSourceCounts,
  groupDuplicateEntries,
  hasMeaningfulContinuation,
  parseLogEntries,
} from './logParser';
import { SourceFilter } from './SourceFilter';

import type { EntryGroup, LogEntry, LogLevel, ViewMode } from './types';

export interface LogViewerProps {
  /** Raw log lines to display */
  lines: string[];
  /** File path being viewed */
  filePath: string;
  /** File size in bytes */
  fileSize: number;
  /** Whether this is the current session's log */
  isCurrentSession?: boolean;
  /** Initial search query */
  initialSearch?: string;
  /** Whether live tail mode is enabled */
  isLive?: boolean;
  /** Callback when user exits */
  onExit?: () => void;
}

// Re-export types for external use
export type { LogEntry, LogLevel };

/**
 * Format file size for display.
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Detail view for a single log entry.
 */
function EntryDetail({
  entry,
  onClose,
  width,
  height,
}: {
  entry: LogEntry;
  onClose: () => void;
  width: number;
  height: number;
}): React.ReactElement {
  const [scrollOffset, setScrollOffset] = useState(0);
  const color = getLevelColor(entry.level);

  // Build all lines: first line + continuation
  const allLines: string[] = [entry.firstLine, ...entry.continuationLines];

  // Wrap long lines
  const wrapWidth = width - 6;
  const wrappedLines: string[] = [];
  for (const line of allLines) {
    if (line.length <= wrapWidth) {
      wrappedLines.push(line);
    } else {
      let remaining = line;
      while (remaining.length > 0) {
        wrappedLines.push(remaining.slice(0, wrapWidth));
        remaining = remaining.slice(wrapWidth);
      }
    }
  }

  const contentHeight = height - 6;
  const visibleLines = wrappedLines.slice(scrollOffset, scrollOffset + contentHeight);
  const maxOffset = Math.max(0, wrappedLines.length - contentHeight);

  useInput((input, key) => {
    if (key.escape || key.return || input === 'q') {
      onClose();
    } else if (input === 'j' || key.downArrow) {
      setScrollOffset((prev) => Math.min(maxOffset, prev + 1));
    } else if (input === 'k' || key.upArrow) {
      setScrollOffset((prev) => Math.max(0, prev - 1));
    } else if (key.pageDown) {
      setScrollOffset((prev) => Math.min(maxOffset, prev + contentHeight));
    } else if (key.pageUp) {
      setScrollOffset((prev) => Math.max(0, prev - contentHeight));
    } else if (input === 'g') {
      setScrollOffset(0);
    } else if (input === 'G') {
      setScrollOffset(maxOffset);
    }
  });

  return (
    <Box flexDirection="column" width={width}>
      <Box borderStyle="double" paddingX={1} flexDirection="column">
        <Text bold>
          Entry {entry.id + 1} | Lines {entry.startLine}-{entry.endLine} |{' '}
          {entry.continuationLines.length + 1} total lines
        </Text>
        {entry.timestamp && (
          <Text dimColor>
            {entry.timestamp.toISOString()} | {entry.source ?? 'no source'}
          </Text>
        )}
      </Box>
      <Box
        flexDirection="column"
        height={contentHeight}
        borderStyle="single"
        borderTop={false}
        borderBottom={false}
        paddingX={1}
      >
        {visibleLines.map((text, i) => (
          <Text key={i} color={i === 0 ? color : 'gray'}>
            {text}
          </Text>
        ))}
      </Box>
      <Box borderStyle="single" borderTop={false} paddingX={1} justifyContent="space-between">
        <Text dimColor>j/k:scroll g/G:top/bottom Enter/Esc/q:close</Text>
        {wrappedLines.length > contentHeight && (
          <Text dimColor>
            {scrollOffset + 1}-{Math.min(scrollOffset + contentHeight, wrappedLines.length)}/
            {wrappedLines.length}
          </Text>
        )}
      </Box>
    </Box>
  );
}

/**
 * Main log viewer component.
 */
export function LogViewer({
  lines,
  filePath,
  fileSize,
  isCurrentSession = false,
  initialSearch = '',
  isLive = false,
  onExit,
}: LogViewerProps): React.ReactElement {
  const { exit } = useApp();
  const { width, height } = useTerminalSize();

  // Parse entries from lines
  const allEntries = useMemo(() => parseLogEntries(lines), [lines]);

  // State
  const [mode, setMode] = useState<ViewMode>('normal');
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [searchInput, setSearchInput] = useState('');
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<Set<string> | null>(null);
  const [showRelativeTime, setShowRelativeTime] = useState(true);
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set());
  const [expandAll, setExpandAll] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [scrollOffset, setScrollOffset] = useState<number | null>(null);
  const [detailEntry, setDetailEntry] = useState<LogEntry | null>(null);
  const [followMode, setFollowMode] = useState(isLive);
  const [now, setNow] = useState(new Date());

  // Update "now" periodically for relative timestamps
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(interval);
  }, []);

  // Get level and source counts
  const levelCounts = useMemo(() => getLevelCounts(allEntries), [allEntries]);
  const sourceCounts = useMemo(() => getSourceCounts(allEntries), [allEntries]);

  // Filter entries
  const filteredEntries = useMemo(
    () =>
      filterEntries(allEntries, {
        levelFilter,
        sourceFilter,
        searchQuery,
      }),
    [allEntries, levelFilter, sourceFilter, searchQuery],
  );

  // Group duplicates
  const entryGroups = useMemo(() => groupDuplicateEntries(filteredEntries), [filteredEntries]);

  // Calculate visible rows (accounting for expanded entries)
  const visibleRows = useMemo(() => {
    const rows: { group: EntryGroup; isExpanded: boolean }[] = [];
    for (const group of entryGroups) {
      const isExpanded = expandAll || expandedEntries.has(group.entry.id);
      rows.push({ group, isExpanded });
    }
    return rows;
  }, [entryGroups, expandedEntries, expandAll]);

  // Calculate layout
  const headerHeight = useMemo(() => {
    let h = 2; // Base header
    if (isCurrentSession || isLive) {
      h += 1;
    }
    const hasFilter = searchQuery || levelFilter !== 'all' || sourceFilter;
    if (hasFilter) {
      h += 1;
    }
    return h;
  }, [isCurrentSession, isLive, searchQuery, levelFilter, sourceFilter]);

  const footerHeight = 2;
  const contentHeight = Math.max(1, height - headerHeight - footerHeight);

  // Initialize scroll to bottom
  useEffect(() => {
    if (scrollOffset === null && visibleRows.length > 0) {
      const maxOffset = Math.max(0, visibleRows.length - contentHeight);
      setScrollOffset(maxOffset);
      setCursor(visibleRows.length - 1);
    }
  }, [scrollOffset, visibleRows.length, contentHeight]);

  // Auto-scroll in follow mode
  useEffect(() => {
    if (followMode && visibleRows.length > 0) {
      const maxOffset = Math.max(0, visibleRows.length - contentHeight);
      setScrollOffset(maxOffset);
      setCursor(visibleRows.length - 1);
    }
  }, [followMode, visibleRows.length, contentHeight]);

  // Ensure cursor and scroll are in bounds
  useEffect(() => {
    if (scrollOffset !== null && visibleRows.length > 0) {
      const maxOffset = Math.max(0, visibleRows.length - contentHeight);
      if (scrollOffset > maxOffset) {
        setScrollOffset(maxOffset);
      }
      if (cursor >= visibleRows.length) {
        setCursor(Math.max(0, visibleRows.length - 1));
      }
    }
  }, [visibleRows.length, contentHeight, scrollOffset, cursor]);

  const currentOffset = scrollOffset ?? 0;
  const displayRows = useMemo(
    () => visibleRows.slice(currentOffset, currentOffset + contentHeight),
    [visibleRows, currentOffset, contentHeight],
  );

  // Navigation handlers
  const scrollUp = useCallback((amount = 1) => {
    setFollowMode(false);
    setScrollOffset((prev) => Math.max(0, (prev ?? 0) - amount));
    setCursor((prev) => Math.max(0, prev - amount));
  }, []);

  const scrollDown = useCallback(
    (amount = 1) => {
      const maxOffset = Math.max(0, visibleRows.length - contentHeight);
      const maxCursor = visibleRows.length - 1;
      setScrollOffset((prev) => Math.min(maxOffset, (prev ?? 0) + amount));
      setCursor((prev) => Math.min(maxCursor, prev + amount));
    },
    [visibleRows.length, contentHeight],
  );

  const scrollToTop = useCallback(() => {
    setFollowMode(false);
    setScrollOffset(0);
    setCursor(0);
  }, []);

  const scrollToBottom = useCallback(() => {
    const maxOffset = Math.max(0, visibleRows.length - contentHeight);
    setScrollOffset(maxOffset);
    setCursor(visibleRows.length - 1);
  }, [visibleRows.length, contentHeight]);

  const toggleExpand = useCallback((entryId: number) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setLevelFilter('all');
    setSourceFilter(null);
    setScrollOffset(0);
    setCursor(0);
  }, []);

  const handleExit = useCallback(() => {
    if (onExit) {
      onExit();
    }
    exit();
  }, [exit, onExit]);

  // Handle keyboard input
  useInput((input, key) => {
    // Detail mode handled by EntryDetail
    if (mode === 'detail') {
      return;
    }

    // Source filter mode handled by SourceFilter
    if (mode === 'source-filter') {
      return;
    }

    // Search mode
    if (mode === 'search') {
      if (key.return) {
        setSearchQuery(searchInput);
        setMode('normal');
        setScrollOffset(0);
        setCursor(0);
      } else if (key.escape) {
        setSearchInput(searchQuery);
        setMode('normal');
      } else if (key.backspace || key.delete) {
        setSearchInput((prev) => prev.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setSearchInput((prev) => prev + input);
      }
      return;
    }

    // Normal mode
    if (key.escape) {
      if (searchQuery || levelFilter !== 'all' || sourceFilter) {
        clearFilters();
      } else {
        handleExit();
      }
    } else if (input === 'q') {
      handleExit();
    } else if (input === 'j' || key.downArrow) {
      scrollDown(1);
    } else if (input === 'k' || key.upArrow) {
      scrollUp(1);
    } else if (input === 'd' && key.ctrl) {
      scrollDown(Math.floor(contentHeight / 2));
    } else if (input === 'u' && key.ctrl) {
      scrollUp(Math.floor(contentHeight / 2));
    } else if (input === 'g') {
      scrollToTop();
    } else if (input === 'G') {
      scrollToBottom();
    } else if (key.pageDown) {
      scrollDown(contentHeight);
    } else if (key.pageUp) {
      scrollUp(contentHeight);
    } else if (input === '/') {
      setMode('search');
      setSearchInput(searchQuery);
    } else if (input === 'c') {
      clearFilters();
    } else if (input === 's') {
      setMode('source-filter');
    } else if (input === 't') {
      setShowRelativeTime((prev) => !prev);
    } else if (input === 'x') {
      setExpandAll((prev) => !prev);
      setExpandedEntries(new Set());
    } else if (input === 'f') {
      setFollowMode((prev) => !prev);
      if (!followMode) {
        scrollToBottom();
      }
    } else if (key.return || input === 'l' || key.rightArrow) {
      // Toggle expand or open detail
      const currentGroup = visibleRows[cursor];
      if (currentGroup) {
        const entry = currentGroup.group.entry;
        if (hasMeaningfulContinuation(entry)) {
          if (expandAll || expandedEntries.has(entry.id)) {
            // Already expanded - open detail view
            setDetailEntry(entry);
            setMode('detail');
          } else {
            // Expand
            toggleExpand(entry.id);
          }
        } else {
          // No continuation - open detail view
          setDetailEntry(entry);
          setMode('detail');
        }
      }
    } else if (input === 'h' || key.leftArrow) {
      // Collapse
      const currentGroup = visibleRows[cursor];
      if (currentGroup) {
        const entry = currentGroup.group.entry;
        if (expandedEntries.has(entry.id)) {
          toggleExpand(entry.id);
        }
      }
    }
    // Level filter shortcuts
    else if (input === 'e') {
      setLevelFilter((prev) => (prev === 'error' ? 'all' : 'error'));
      setScrollOffset(0);
      setCursor(0);
    } else if (input === 'w') {
      setLevelFilter((prev) => (prev === 'warn' ? 'all' : 'warn'));
      setScrollOffset(0);
      setCursor(0);
    } else if (input === 'i') {
      setLevelFilter((prev) => (prev === 'info' ? 'all' : 'info'));
      setScrollOffset(0);
      setCursor(0);
    } else if (input === 'D') {
      setLevelFilter((prev) => (prev === 'debug' ? 'all' : 'debug'));
      setScrollOffset(0);
      setCursor(0);
    } else if (input === 'a') {
      setLevelFilter('all');
    }
  });

  // Render detail view
  if (mode === 'detail' && detailEntry) {
    return (
      <EntryDetail
        entry={detailEntry}
        onClose={() => {
          setDetailEntry(null);
          setMode('normal');
        }}
        width={width}
        height={height}
      />
    );
  }

  // Build filter status text
  const filterParts: string[] = [];
  if (levelFilter !== 'all') {
    filterParts.push(`Level: ${levelFilter.toUpperCase()}`);
  }
  if (sourceFilter && sourceFilter.size > 0) {
    const sourceNames = Array.from(sourceFilter).slice(0, 2);
    const suffix = sourceFilter.size > 2 ? ` +${sourceFilter.size - 2}` : '';
    filterParts.push(`Source: ${sourceNames.join(', ')}${suffix}`);
  }
  if (searchQuery) {
    filterParts.push(`"${searchQuery}"`);
  }
  const filterText = filterParts.length > 0 ? filterParts.join(' + ') : null;

  // Level counts for status
  const levelStatus = `E:${levelCounts.error} W:${levelCounts.warn} D:${levelCounts.debug}`;

  // Position text
  const totalEntries = entryGroups.length;
  const scrollPercent =
    totalEntries <= contentHeight
      ? 100
      : Math.round((currentOffset / Math.max(1, totalEntries - contentHeight)) * 100);
  const positionText = totalEntries <= contentHeight ? 'All' : `${scrollPercent}%`;

  // Help text
  const helpText = 'j/k:nav →/←:expand e/w/D:level s:source /:search q:quit';

  return (
    <Box flexDirection="column" width={width}>
      {/* Source filter modal */}
      {mode === 'source-filter' && (
        <Box position="absolute" marginLeft={Math.floor((width - 50) / 2)} marginTop={2}>
          <SourceFilter
            sources={sourceCounts}
            selectedSources={sourceFilter}
            onApply={(sources) => {
              setSourceFilter(sources);
              setMode('normal');
              setScrollOffset(0);
              setCursor(0);
            }}
            onCancel={() => setMode('normal')}
            maxWidth={50}
            maxHeight={height - 6}
          />
        </Box>
      )}

      {/* Header */}
      <Box borderStyle="single" borderBottom={false} paddingX={1} flexDirection="column">
        <Box justifyContent="space-between">
          <Text bold>{truncate(filePath, width - 30)}</Text>
          <Text dimColor>
            {formatSize(fileSize)} | {levelStatus}
          </Text>
        </Box>
        {(isCurrentSession || isLive) && (
          <Box>
            {isCurrentSession && <Text color="yellow">Current session</Text>}
            {isLive && followMode && (
              <Text color="green" bold>
                {' '}
                LIVE
              </Text>
            )}
            {isLive && !followMode && <Text dimColor> (paused - press f to follow)</Text>}
          </Box>
        )}
        {filterText && (
          <Text>
            <Text dimColor>Filter: </Text>
            <Text color="cyan" bold>
              {filterText}
            </Text>
            <Text dimColor>
              {' '}
              ({filteredEntries.length}/{allEntries.length} entries)
            </Text>
          </Text>
        )}
      </Box>

      {/* Log content */}
      <Box
        flexDirection="column"
        height={contentHeight}
        borderStyle="single"
        borderTop={false}
        borderBottom={false}
        paddingX={1}
      >
        {displayRows.length === 0 ? (
          <Text dimColor>{filterText ? 'No entries matching filter' : 'Log file is empty'}</Text>
        ) : (
          displayRows.map(({ group, isExpanded }, idx) => {
            const actualIdx = currentOffset + idx;
            const isSelected = actualIdx === cursor;

            return (
              <LogEntryRow
                key={group.entry.id}
                group={group}
                isSelected={isSelected}
                isExpanded={isExpanded}
                searchQuery={searchQuery}
                showRelativeTime={showRelativeTime}
                maxWidth={width - 4}
                now={now}
              />
            );
          })
        )}
      </Box>

      {/* Footer */}
      <Box borderStyle="single" borderTop={false} paddingX={1} justifyContent="space-between">
        {mode === 'search' ? (
          <Text>
            <Text color="cyan">/</Text>
            <Text>{searchInput}</Text>
            <Text dimColor>_ (Enter:apply Esc:cancel)</Text>
          </Text>
        ) : (
          <Text dimColor>{helpText}</Text>
        )}
        <Text dimColor>
          {currentOffset + 1}-{Math.min(currentOffset + contentHeight, totalEntries)}/{totalEntries}{' '}
          entries ({positionText})
        </Text>
      </Box>
    </Box>
  );
}

export default LogViewer;
