/**
 * ListApp - Interactive UI for browsing evals, prompts, and datasets.
 *
 * Provides keyboard navigation, search, and filtering capabilities.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Box, Text, useApp, useInput } from 'ink';
import { TextInput } from '../init/components/shared/TextInput';

export type ResourceType = 'evals' | 'prompts' | 'datasets';

export interface EvalItem {
  id: string;
  description?: string;
  prompts: string[];
  vars: string[];
  createdAt: Date;
  isRedteam?: boolean;
  /** Pass count from results */
  passCount?: number;
  /** Fail count from results */
  failCount?: number;
  /** Error count from results */
  errorCount?: number;
  /** Total test count (defined in config) */
  testCount?: number;
  /** Number of prompts in the eval */
  promptCount?: number;
  /** Provider IDs used in this eval */
  providers?: string[];
}

export interface PromptItem {
  id: string;
  raw: string;
  evalCount: number;
  recentEvalId?: string;
}

export interface DatasetItem {
  id: string;
  testCount: number;
  evalCount: number;
  bestPromptId?: string;
  recentEvalId?: string;
}

export type ListItem = EvalItem | PromptItem | DatasetItem;

export interface ListAppProps {
  /** Resource type to list */
  resourceType: ResourceType;
  /** Initial data to display */
  items?: ListItem[];
  /** Called when user selects an item */
  onSelect?: (item: ListItem) => void;
  /** Called when user wants to exit */
  onExit?: () => void;
  /** Called to load more data (pagination) */
  onLoadMore?: (offset: number, limit: number) => Promise<ListItem[]>;
  /** Called when search query changes */
  onSearch?: (query: string) => Promise<ListItem[]>;
  /** Whether there are more items to load */
  hasMore?: boolean;
  /** Page size for pagination */
  pageSize?: number;
  /** Total count of items (for "X of Y" display) */
  totalCount?: number;
}

function truncate(str: string, length: number): string {
  if (str.length <= length) {
    return str;
  }
  return str.slice(0, length - 1) + '…';
}

function formatDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return 'today';
  }
  if (days === 1) {
    return 'yesterday';
  }
  if (days < 7) {
    return `${days}d ago`;
  }
  if (days < 30) {
    return `${Math.floor(days / 7)}w ago`;
  }
  return `${Math.floor(days / 30)}mo ago`;
}

function EvalRow({
  item,
  isSelected,
  width,
}: {
  item: EvalItem;
  isSelected: boolean;
  width: number;
}) {
  // Reserve space for fixed columns: selector(3) + id(20) + date(10) + stats(15) + redteam(8)
  const fixedWidth = 56 + (item.isRedteam ? 8 : 0);
  const descWidth = Math.max(15, width - fixedWidth);

  // Calculate pass rate - only show if there are actual results
  const total = (item.passCount ?? 0) + (item.failCount ?? 0) + (item.errorCount ?? 0);
  const hasResults = total > 0;
  const passRate = hasResults ? Math.round(((item.passCount ?? 0) / total) * 100) : null;

  return (
    <Box>
      <Box width={3}>
        <Text color={isSelected ? 'cyan' : undefined}>{isSelected ? '▶' : ' '}</Text>
      </Box>
      <Box width={20}>
        <Text color={isSelected ? 'cyan' : 'yellow'}>{truncate(item.id, 18)}</Text>
      </Box>
      <Box width={descWidth}>
        <Text color={isSelected ? 'white' : 'gray'}>
          {truncate(item.description || '(no description)', descWidth - 2)}
        </Text>
      </Box>
      <Box width={15}>
        {hasResults ? (
          <>
            <Text
              color={
                passRate !== null && passRate >= 80
                  ? 'green'
                  : passRate !== null && passRate >= 50
                    ? 'yellow'
                    : 'red'
              }
            >
              {passRate}%
            </Text>
            <Text dimColor>
              {' '}
              ({item.passCount}/{total})
            </Text>
          </>
        ) : (
          <Text dimColor>pending</Text>
        )}
      </Box>
      <Box width={10}>
        <Text dimColor>{formatDate(item.createdAt)}</Text>
      </Box>
      {item.isRedteam && (
        <Box width={8}>
          <Text color="red">redteam</Text>
        </Box>
      )}
    </Box>
  );
}

function PromptRow({
  item,
  isSelected,
  width,
}: {
  item: PromptItem;
  isSelected: boolean;
  width: number;
}) {
  const promptWidth = Math.max(30, width - 35);

  return (
    <Box>
      <Box width={3}>
        <Text color={isSelected ? 'cyan' : undefined}>{isSelected ? '▶' : ' '}</Text>
      </Box>
      <Box width={10}>
        <Text color={isSelected ? 'cyan' : 'yellow'}>{item.id.slice(0, 8)}</Text>
      </Box>
      <Box width={promptWidth}>
        <Text color={isSelected ? 'white' : 'gray'}>
          {truncate(item.raw.replace(/\n/g, ' '), promptWidth - 2)}
        </Text>
      </Box>
      <Box width={12}>
        <Text dimColor>{item.evalCount} evals</Text>
      </Box>
    </Box>
  );
}

function DatasetRow({
  item,
  isSelected,
  width,
}: {
  item: DatasetItem;
  isSelected: boolean;
  width: number;
}) {
  // Use responsive width for best prompt column
  const bestPromptWidth = Math.max(15, width - 50);

  return (
    <Box>
      <Box width={3}>
        <Text color={isSelected ? 'cyan' : undefined}>{isSelected ? '▶' : ' '}</Text>
      </Box>
      <Box width={10}>
        <Text color={isSelected ? 'cyan' : 'yellow'}>{item.id.slice(0, 8)}</Text>
      </Box>
      <Box width={12}>
        <Text color={isSelected ? 'white' : 'gray'}>{item.testCount} tests</Text>
      </Box>
      <Box width={12}>
        <Text dimColor>{item.evalCount} evals</Text>
      </Box>
      {item.bestPromptId && (
        <Box width={bestPromptWidth}>
          <Text dimColor>best: {item.bestPromptId.slice(0, 8)}</Text>
        </Box>
      )}
    </Box>
  );
}

function SearchBar({
  value,
  onChange,
  onSubmit,
  isActive,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isActive: boolean;
}) {
  return (
    <Box>
      <Text color={isActive ? 'cyan' : 'gray'}>Search: </Text>
      {isActive ? (
        <TextInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          isFocused={isActive}
          placeholder="Type to search..."
        />
      ) : (
        <Text color="gray">{value || '(press / to search)'}</Text>
      )}
    </Box>
  );
}

export function ListApp({
  resourceType,
  items: initialItems = [],
  onSelect,
  onExit,
  onLoadMore,
  onSearch,
  hasMore: initialHasMore = true,
  pageSize = 50,
  totalCount: initialTotalCount,
}: ListAppProps) {
  const { exit } = useApp();
  const [items, setItems] = useState<ListItem[]>(initialItems);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [error, setError] = useState<string | null>(null);
  // totalCount is passed once at mount and doesn't change during the session
  const totalCount = initialTotalCount;
  // Track if user wants to jump to absolute end (G command with infinite scroll)
  const jumpToEndRef = useRef(false);

  // Terminal dimensions
  const [terminalWidth] = useState(process.stdout.columns || 80);
  const visibleRows = Math.max(5, (process.stdout.rows || 20) - 10);

  // Client-side filtering when onSearch is not provided
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) {
      return items;
    }
    const query = searchQuery.toLowerCase();
    return items.filter((item) => {
      // Search across all relevant fields
      if ('description' in item && item.description?.toLowerCase().includes(query)) {
        return true;
      }
      if (item.id.toLowerCase().includes(query)) {
        return true;
      }
      if ('raw' in item && (item as PromptItem).raw.toLowerCase().includes(query)) {
        return true;
      }
      if ('vars' in item) {
        const evalItem = item as EvalItem;
        if (evalItem.vars.some((v) => v.toLowerCase().includes(query))) {
          return true;
        }
        if (evalItem.prompts.some((p) => p.toLowerCase().includes(query))) {
          return true;
        }
      }
      return false;
    });
  }, [items, searchQuery]);

  // Calculate scroll offset using filtered items
  const scrollOffset = useMemo(() => {
    if (selectedIndex < visibleRows / 2) {
      return 0;
    }
    if (selectedIndex > filteredItems.length - visibleRows / 2) {
      return Math.max(0, filteredItems.length - visibleRows);
    }
    return Math.max(0, selectedIndex - Math.floor(visibleRows / 2));
  }, [selectedIndex, filteredItems.length, visibleRows]);

  const visibleItems = useMemo(() => {
    return filteredItems.slice(scrollOffset, scrollOffset + visibleRows);
  }, [filteredItems, scrollOffset, visibleRows]);

  // Load initial data
  useEffect(() => {
    if (initialItems.length === 0 && onLoadMore) {
      setLoading(true);
      void onLoadMore(0, pageSize)
        .then((data) => {
          setItems(data);
          setHasMore(data.length >= pageSize);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setLoading(false);
        });
    }
  }, [initialItems.length, onLoadMore, pageSize]);

  // Handle search - reset selection and exit search mode
  const handleSearch = useCallback(async () => {
    // Reset selection when search is submitted
    setSelectedIndex(0);

    // If onSearch callback provided, use server-side search
    if (onSearch && searchQuery.trim()) {
      setLoading(true);
      try {
        const results = await onSearch(searchQuery);
        setItems(results);
        setHasMore(results.length >= pageSize);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
    // Client-side filtering happens automatically via filteredItems memo
    setIsSearching(false);
  }, [searchQuery, onSearch, pageSize]);

  // Load more items (pagination)
  const handleLoadMore = useCallback(async () => {
    if (!onLoadMore || loadingMore || !hasMore) {
      return;
    }

    setLoadingMore(true);
    try {
      const newItems = await onLoadMore(items.length, pageSize);
      if (newItems.length === 0) {
        setHasMore(false);
      } else {
        setItems((prev) => [...prev, ...newItems]);
        setHasMore(newItems.length >= pageSize);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }, [onLoadMore, loadingMore, hasMore, items.length, pageSize]);

  // Effect to handle "jump to end" - continuously load until we reach the true end
  useEffect(() => {
    if (!jumpToEndRef.current) {
      return;
    }

    if (!hasMore) {
      // Reached the end - position cursor at absolute last item
      setSelectedIndex(items.length - 1);
      jumpToEndRef.current = false;
    } else if (!loadingMore && onLoadMore) {
      // More items exist and not currently loading - load next batch
      void handleLoadMore();
    }
  }, [hasMore, loadingMore, items.length, onLoadMore, handleLoadMore]);

  // Helper to navigate down with auto-load
  const navigateDown = useCallback(
    (amount: number) => {
      setSelectedIndex((prev) => {
        const newIndex = Math.min(filteredItems.length - 1, prev + amount);
        // Load more when approaching bottom (within 5 items) - only when not filtering
        if (hasMore && !searchQuery.trim() && newIndex >= items.length - 5) {
          void handleLoadMore();
        }
        return newIndex;
      });
    },
    [filteredItems.length, hasMore, searchQuery, items.length, handleLoadMore],
  );

  // Keyboard navigation
  useInput((input, key) => {
    if (isSearching) {
      if (key.escape) {
        setIsSearching(false);
        setSearchQuery('');
      }
      return;
    }

    const halfPage = Math.floor(visibleRows / 2);

    // Cancel jump-to-end on any manual navigation
    const cancelJumpToEnd = () => {
      jumpToEndRef.current = false;
    };

    // Navigation - use filteredItems for bounds
    if (key.upArrow || input === 'k') {
      cancelJumpToEnd();
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow || input === 'j') {
      cancelJumpToEnd();
      navigateDown(1);
    } else if (key.pageUp || (key.ctrl && input === 'b')) {
      cancelJumpToEnd();
      // Full page up - PageUp or Ctrl+b (vim/less)
      setSelectedIndex((prev) => Math.max(0, prev - visibleRows));
    } else if (key.pageDown || (key.ctrl && input === 'f')) {
      cancelJumpToEnd();
      // Full page down - PageDown or Ctrl+f (vim/less)
      navigateDown(visibleRows);
    } else if (key.ctrl && input === 'u') {
      cancelJumpToEnd();
      // Half page up - Ctrl+u (vim/less)
      setSelectedIndex((prev) => Math.max(0, prev - halfPage));
    } else if (key.ctrl && input === 'd') {
      cancelJumpToEnd();
      // Half page down - Ctrl+d (vim/less)
      navigateDown(halfPage);
    } else if (key.ctrl && input === 'e') {
      cancelJumpToEnd();
      // Scroll down one line - Ctrl+e (vim)
      navigateDown(1);
    } else if (key.ctrl && input === 'y') {
      cancelJumpToEnd();
      // Scroll up one line - Ctrl+y (vim)
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (input === 'g') {
      setSelectedIndex(0);
      jumpToEndRef.current = false; // Cancel any pending jump-to-end
    } else if (input === 'G') {
      if (hasMore && !searchQuery.trim()) {
        // More items exist - start continuous loading to reach true end
        jumpToEndRef.current = true;
        void handleLoadMore();
      } else {
        // Already at end or filtering - just go to last item
        setSelectedIndex(filteredItems.length - 1);
      }
    }

    // Actions
    if (key.return && filteredItems[selectedIndex]) {
      onSelect?.(filteredItems[selectedIndex]);
    } else if (input === '/') {
      setIsSearching(true);
    } else if (input === 'q' || key.escape) {
      onExit?.();
      exit();
    } else if (input === 'r') {
      // Refresh
      if (onLoadMore) {
        setLoading(true);
        void onLoadMore(0, pageSize)
          .then((data) => {
            setItems(data);
            setSelectedIndex(0);
            setHasMore(data.length >= pageSize);
            setLoading(false);
          })
          .catch((err) => {
            setError(err.message);
            setLoading(false);
          });
      }
    }
  });

  const resourceLabels: Record<ResourceType, string> = {
    evals: 'Evaluations',
    prompts: 'Prompts',
    datasets: 'Datasets',
  };

  const renderItem = (item: ListItem, index: number) => {
    const isSelected = index + scrollOffset === selectedIndex;
    const key = 'id' in item ? item.id : String(index);

    if (resourceType === 'evals') {
      return (
        <EvalRow key={key} item={item as EvalItem} isSelected={isSelected} width={terminalWidth} />
      );
    } else if (resourceType === 'prompts') {
      return (
        <PromptRow
          key={key}
          item={item as PromptItem}
          isSelected={isSelected}
          width={terminalWidth}
        />
      );
    } else {
      return (
        <DatasetRow
          key={key}
          item={item as DatasetItem}
          isSelected={isSelected}
          width={terminalWidth}
        />
      );
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {resourceLabels[resourceType]}
        </Text>
        <Text> </Text>
        <Text dimColor>
          ({searchQuery.trim() ? `${filteredItems.length} filtered` : `${items.length} loaded`}
          {totalCount && !searchQuery.trim() ? ` of ${totalCount} total` : ''}
          {loading ? ', loading...' : ''})
        </Text>
      </Box>

      {/* Search bar */}
      <Box marginBottom={1}>
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          onSubmit={handleSearch}
          isActive={isSearching}
        />
      </Box>

      {/* Error message */}
      {error && (
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {/* Items list */}
      <Box flexDirection="column" height={visibleRows}>
        {loading && items.length === 0 ? (
          <Text color="gray">Loading...</Text>
        ) : filteredItems.length === 0 ? (
          <Text color="gray">{searchQuery.trim() ? 'No matches found' : 'No items found'}</Text>
        ) : (
          visibleItems.map((item, index) => renderItem(item, index))
        )}
      </Box>

      {/* Scroll indicator */}
      {filteredItems.length > visibleRows && (
        <Box marginTop={1}>
          <Text dimColor>
            Showing {scrollOffset + 1}-{Math.min(scrollOffset + visibleRows, filteredItems.length)}
            {totalCount && !searchQuery.trim()
              ? ` of ${totalCount}`
              : ` of ${filteredItems.length}`}
          </Text>
          {loadingMore && <Text color="yellow"> Loading...</Text>}
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>↑↓/jk: navigate | ^d/^u: half page | ^f/^b: full page | g/G: start/end</Text>
        <Text dimColor>Enter: select | /: search | r: refresh | q: quit</Text>
      </Box>
    </Box>
  );
}
