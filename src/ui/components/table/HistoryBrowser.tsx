/**
 * HistoryBrowser - Overlay component for browsing past evaluations.
 *
 * Features:
 * - Lists past evaluations with pass rates and metadata
 * - Keyboard navigation (arrow keys, vim bindings)
 * - Search/filter functionality
 * - Load selected eval to replace current view
 */

import { Box, Text, useInput, useStdout } from 'ink';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  type EvalListItem,
  fetchEvalList,
  fetchEvalTable,
  formatRelativeTime,
  formatShortId,
  getPassRateIndicator,
} from '../../utils/history';
import type { EvaluateTable } from './types';

export interface HistoryBrowserProps {
  /** Currently displayed eval ID (to highlight as current) */
  currentEvalId?: string;
  /** Callback when user selects an eval - receives the table data */
  onSelect: (table: EvaluateTable, evalId: string) => void;
  /** Callback when user cancels (Escape) */
  onCancel: () => void;
}

type BrowserState = 'loading' | 'browsing' | 'fetching' | 'error';

/**
 * Format pass/fail counts for display.
 */
function formatCounts(passCount: number, failCount: number, errorCount: number): string {
  const total = passCount + failCount + errorCount;
  return `(${passCount}/${total})`;
}

/**
 * History browser overlay component.
 */
export const HistoryBrowser = memo(function HistoryBrowser({
  currentEvalId,
  onSelect,
  onCancel,
}: HistoryBrowserProps) {
  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows || 24;

  // Calculate visible rows (leave room for header, footer, padding)
  const visibleRows = Math.max(5, terminalHeight - 10);

  const [state, setState] = useState<BrowserState>('loading');
  const [evals, setEvals] = useState<EvalListItem[]>([]);
  const [filteredEvals, setFilteredEvals] = useState<EvalListItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loadingEvalId, setLoadingEvalId] = useState<string | null>(null);

  // Load evals on mount
  useEffect(() => {
    async function loadEvals() {
      try {
        const evalList = await fetchEvalList(50);
        setEvals(evalList);
        setFilteredEvals(evalList);
        setState('browsing');
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load evaluations');
        setState('error');
      }
    }
    loadEvals();
  }, []);

  // Filter evals when search query changes
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredEvals(evals);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = evals.filter(
      (eval_) =>
        eval_.id.toLowerCase().includes(query) ||
        eval_.description?.toLowerCase().includes(query) ||
        eval_.author?.toLowerCase().includes(query),
    );
    setFilteredEvals(filtered);
    setSelectedIndex(0);
    setScrollOffset(0);
  }, [searchQuery, evals]);

  // Handle loading a selected eval
  const handleLoadEval = useCallback(async () => {
    const selectedEval = filteredEvals[selectedIndex];
    if (!selectedEval) {
      return;
    }

    setState('fetching');
    setLoadingEvalId(selectedEval.id);

    try {
      const table = await fetchEvalTable(selectedEval.id);
      if (table) {
        onSelect(table, selectedEval.id);
      } else {
        setErrorMessage(`Could not load eval: ${selectedEval.id}`);
        setState('error');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load evaluation');
      setState('error');
    }
  }, [filteredEvals, selectedIndex, onSelect]);

  // Keyboard navigation
  useInput(
    (input, key) => {
      // Handle search mode
      if (isSearching) {
        if (key.escape) {
          setIsSearching(false);
          setSearchQuery('');
          return;
        }
        if (key.return) {
          setIsSearching(false);
          return;
        }
        if (key.backspace || key.delete) {
          setSearchQuery((prev) => prev.slice(0, -1));
          return;
        }
        // Add printable characters
        if (input && !key.ctrl && !key.meta) {
          setSearchQuery((prev) => prev + input);
        }
        return;
      }

      // Handle browsing mode
      if (state !== 'browsing') {
        // Allow escape even in loading/error states
        if (key.escape || input.toLowerCase() === 'q') {
          onCancel();
        }
        return;
      }

      // Cancel
      if (key.escape || input.toLowerCase() === 'q') {
        onCancel();
        return;
      }

      // Enter search mode
      if (input === '/') {
        setIsSearching(true);
        return;
      }

      // Navigate up
      if (key.upArrow || input === 'k') {
        setSelectedIndex((prev) => {
          const newIndex = Math.max(0, prev - 1);
          // Adjust scroll if needed
          if (newIndex < scrollOffset) {
            setScrollOffset(newIndex);
          }
          return newIndex;
        });
        return;
      }

      // Navigate down
      if (key.downArrow || input === 'j') {
        setSelectedIndex((prev) => {
          const newIndex = Math.min(filteredEvals.length - 1, prev + 1);
          // Adjust scroll if needed
          if (newIndex >= scrollOffset + visibleRows) {
            setScrollOffset(newIndex - visibleRows + 1);
          }
          return newIndex;
        });
        return;
      }

      // Jump to top
      if (input === 'g') {
        setSelectedIndex(0);
        setScrollOffset(0);
        return;
      }

      // Jump to bottom
      if (input === 'G') {
        const lastIndex = filteredEvals.length - 1;
        setSelectedIndex(lastIndex);
        setScrollOffset(Math.max(0, lastIndex - visibleRows + 1));
        return;
      }

      // Page up
      if (key.pageUp) {
        setSelectedIndex((prev) => {
          const newIndex = Math.max(0, prev - visibleRows);
          setScrollOffset(Math.max(0, scrollOffset - visibleRows));
          return newIndex;
        });
        return;
      }

      // Page down
      if (key.pageDown) {
        setSelectedIndex((prev) => {
          const newIndex = Math.min(filteredEvals.length - 1, prev + visibleRows);
          setScrollOffset(Math.min(filteredEvals.length - visibleRows, scrollOffset + visibleRows));
          return newIndex;
        });
        return;
      }

      // Select
      if (key.return) {
        handleLoadEval();
        return;
      }
    },
    { isActive: true },
  );

  // Get visible slice of evals
  const visibleEvals = useMemo(() => {
    return filteredEvals.slice(scrollOffset, scrollOffset + visibleRows);
  }, [filteredEvals, scrollOffset, visibleRows]);

  // Loading state
  if (state === 'loading') {
    return (
      <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan">
        <Box marginBottom={1}>
          <Text bold>Evaluation History</Text>
        </Box>
        <Text color="cyan">Loading evaluations...</Text>
      </Box>
    );
  }

  // Error state
  if (state === 'error') {
    return (
      <Box flexDirection="column" padding={1} borderStyle="round" borderColor="red">
        <Box marginBottom={1}>
          <Text bold>Evaluation History</Text>
        </Box>
        <Text color="red">{errorMessage}</Text>
        <Box marginTop={1}>
          <Text dimColor>Press Esc to close</Text>
        </Box>
      </Box>
    );
  }

  // Fetching selected eval
  if (state === 'fetching') {
    return (
      <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan">
        <Box marginBottom={1}>
          <Text bold>Evaluation History</Text>
        </Box>
        <Text color="cyan">Loading {loadingEvalId}...</Text>
      </Box>
    );
  }

  // No evals found
  if (evals.length === 0) {
    return (
      <Box flexDirection="column" padding={1} borderStyle="round" borderColor="gray">
        <Box marginBottom={1}>
          <Text bold>Evaluation History</Text>
        </Box>
        <Text dimColor>No evaluations found</Text>
        <Box marginTop={1}>
          <Text dimColor>Press Esc to close</Text>
        </Box>
      </Box>
    );
  }

  // No search results
  if (filteredEvals.length === 0 && searchQuery) {
    return (
      <Box flexDirection="column" padding={1} borderStyle="round" borderColor="gray">
        <Box marginBottom={1} justifyContent="space-between">
          <Text bold>Evaluation History</Text>
          <Text dimColor>0/{evals.length}</Text>
        </Box>
        {isSearching ? (
          <Box>
            <Text color="cyan">/</Text>
            <Text>{searchQuery}</Text>
            <Text color="cyan">_</Text>
          </Box>
        ) : searchQuery ? (
          <Box>
            <Text dimColor>Filter: </Text>
            <Text>{searchQuery}</Text>
          </Box>
        ) : null}
        <Box marginTop={1}>
          <Text dimColor>No matches for "{searchQuery}"</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press Esc to clear search</Text>
        </Box>
      </Box>
    );
  }

  // Main browsing view
  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan">
      {/* Header */}
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold>Evaluation History</Text>
        <Text dimColor>
          [{selectedIndex + 1}/{filteredEvals.length}]
        </Text>
      </Box>

      {/* Search input */}
      {isSearching ? (
        <Box marginBottom={1}>
          <Text color="cyan">/</Text>
          <Text>{searchQuery}</Text>
          <Text color="cyan">_</Text>
        </Box>
      ) : searchQuery ? (
        <Box marginBottom={1}>
          <Text dimColor>Filter: </Text>
          <Text>{searchQuery}</Text>
        </Box>
      ) : null}

      {/* Eval list */}
      {visibleEvals.map((eval_, index) => {
        const actualIndex = scrollOffset + index;
        const isSelected = actualIndex === selectedIndex;
        const isCurrent = eval_.id === currentEvalId;
        const { symbol, color } = getPassRateIndicator(eval_.passRate);
        const shortId = formatShortId(eval_.id);
        const relativeTime = formatRelativeTime(eval_.createdAt);
        const counts = formatCounts(eval_.passCount, eval_.failCount, eval_.errorCount);

        return (
          <Box key={eval_.id} flexDirection="column">
            <Box>
              <Text color={isSelected ? 'cyan' : undefined}>
                {isSelected ? '>' : ' '}{' '}
              </Text>
              <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                {shortId}
              </Text>
              <Text> </Text>
              <Text color={color}>{symbol}</Text>
              <Text> </Text>
              <Text color={isSelected ? 'cyan' : undefined}>
                {eval_.passRate.toFixed(0).padStart(3)}%
              </Text>
              <Text> </Text>
              <Text dimColor>{counts.padEnd(10)}</Text>
              <Text> </Text>
              <Text dimColor>{relativeTime}</Text>
              {isCurrent && (
                <>
                  <Text> </Text>
                  <Text color="yellow">(current)</Text>
                </>
              )}
            </Box>
            {/* Description on second line if present */}
            {eval_.description && (
              <Box marginLeft={3}>
                <Text dimColor>
                  {eval_.description.length > 50
                    ? eval_.description.slice(0, 47) + '...'
                    : eval_.description}
                </Text>
              </Box>
            )}
          </Box>
        );
      })}

      {/* Scroll indicator */}
      {filteredEvals.length > visibleRows && (
        <Box marginTop={1}>
          <Text dimColor>
            {scrollOffset > 0 ? '↑ ' : '  '}
            {scrollOffset + visibleRows < filteredEvals.length ? ' ↓' : '  '}
          </Text>
        </Box>
      )}

      {/* Help text */}
      <Box marginTop={1}>
        <Text dimColor>↑↓/jk navigate | Enter load | / search | Esc cancel</Text>
      </Box>
    </Box>
  );
});

export default HistoryBrowser;
