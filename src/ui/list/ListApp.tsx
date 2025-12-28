/**
 * ListApp - Interactive UI for browsing evals, prompts, and datasets.
 *
 * Provides keyboard navigation, search, and filtering capabilities.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

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
  /** Called to load more data */
  onLoadMore?: (offset: number, limit: number) => Promise<ListItem[]>;
  /** Called when search query changes */
  onSearch?: (query: string) => Promise<ListItem[]>;
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
  const descWidth = Math.max(20, width - 50);

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
  width: _width,
}: {
  item: DatasetItem;
  isSelected: boolean;
  width: number;
}) {
  return (
    <Box>
      <Box width={3}>
        <Text color={isSelected ? 'cyan' : undefined}>{isSelected ? '▶' : ' '}</Text>
      </Box>
      <Box width={10}>
        <Text color={isSelected ? 'cyan' : 'yellow'}>{item.id.slice(0, 8)}</Text>
      </Box>
      <Box width={15}>
        <Text color={isSelected ? 'white' : 'gray'}>{item.testCount} tests</Text>
      </Box>
      <Box width={15}>
        <Text dimColor>{item.evalCount} evals</Text>
      </Box>
      {item.bestPromptId && (
        <Box width={20}>
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
}: ListAppProps) {
  const { exit } = useApp();
  const [items, setItems] = useState<ListItem[]>(initialItems);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Terminal dimensions
  const [terminalWidth] = useState(process.stdout.columns || 80);
  const visibleRows = Math.max(5, (process.stdout.rows || 20) - 10);

  // Calculate scroll offset
  const scrollOffset = useMemo(() => {
    if (selectedIndex < visibleRows / 2) {
      return 0;
    }
    if (selectedIndex > items.length - visibleRows / 2) {
      return Math.max(0, items.length - visibleRows);
    }
    return Math.max(0, selectedIndex - Math.floor(visibleRows / 2));
  }, [selectedIndex, items.length, visibleRows]);

  const visibleItems = useMemo(() => {
    return items.slice(scrollOffset, scrollOffset + visibleRows);
  }, [items, scrollOffset, visibleRows]);

  // Load initial data
  useEffect(() => {
    if (initialItems.length === 0 && onLoadMore) {
      setLoading(true);
      onLoadMore(0, 50)
        .then((data) => {
          setItems(data);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setLoading(false);
        });
    }
  }, []);

  // Handle search
  const handleSearch = useCallback(async () => {
    if (!onSearch || !searchQuery.trim()) {
      setIsSearching(false);
      return;
    }

    setLoading(true);
    try {
      const results = await onSearch(searchQuery);
      setItems(results);
      setSelectedIndex(0);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setIsSearching(false);
    }
  }, [searchQuery, onSearch]);

  // Keyboard navigation
  useInput((input, key) => {
    if (isSearching) {
      if (key.escape) {
        setIsSearching(false);
        setSearchQuery('');
      }
      return;
    }

    // Navigation
    if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((prev) => Math.min(items.length - 1, prev + 1));
    } else if (key.pageUp) {
      setSelectedIndex((prev) => Math.max(0, prev - visibleRows));
    } else if (key.pageDown) {
      setSelectedIndex((prev) => Math.min(items.length - 1, prev + visibleRows));
    } else if (input === 'g') {
      setSelectedIndex(0);
    } else if (input === 'G') {
      setSelectedIndex(items.length - 1);
    }

    // Actions
    if (key.return && items[selectedIndex]) {
      onSelect?.(items[selectedIndex]);
    } else if (input === '/') {
      setIsSearching(true);
    } else if (input === 'q' || key.escape) {
      onExit?.();
      exit();
    } else if (input === 'r') {
      // Refresh
      if (onLoadMore) {
        setLoading(true);
        onLoadMore(0, 50)
          .then((data) => {
            setItems(data);
            setSelectedIndex(0);
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
          ({items.length} items{loading ? ', loading...' : ''})
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
        ) : items.length === 0 ? (
          <Text color="gray">No items found</Text>
        ) : (
          visibleItems.map((item, index) => renderItem(item, index))
        )}
      </Box>

      {/* Scroll indicator */}
      {items.length > visibleRows && (
        <Box marginTop={1}>
          <Text dimColor>
            Showing {scrollOffset + 1}-{Math.min(scrollOffset + visibleRows, items.length)} of{' '}
            {items.length}
          </Text>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>↑↓/jk: navigate | Enter: select | /: search | r: refresh | q: quit</Text>
      </Box>
    </Box>
  );
}

export interface ListController {
  setItems(items: ListItem[]): void;
  addItems(items: ListItem[]): void;
  setLoading(loading: boolean): void;
  setError(error: string | null): void;
}
