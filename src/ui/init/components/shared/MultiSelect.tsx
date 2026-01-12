/**
 * MultiSelect - Multi-select component with search/filter.
 *
 * Allows users to select multiple items from a list using space bar,
 * with optional search functionality for filtering long lists.
 */

import { useMemo, useState } from 'react';

import { Box, Text, useInput } from 'ink';

export interface MultiSelectItem<T> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
  group?: string;
}

export interface MultiSelectProps<T> {
  /** Items to select from */
  items: MultiSelectItem<T>[];
  /** Currently selected values */
  selected: T[];
  /** Callback when selection changes */
  onSelect: (selected: T[]) => void;
  /** Callback when confirmed (Enter) */
  onConfirm?: () => void;
  /** Whether search is enabled */
  searchable?: boolean;
  /** Placeholder text for search */
  searchPlaceholder?: string;
  /** Maximum visible items (for scrolling) */
  maxVisible?: number;
  /** Whether the component is focused */
  isFocused?: boolean;
  /** Whether to group items */
  grouped?: boolean;
  /** Minimum required selections */
  minSelections?: number;
}

/**
 * MultiSelect component for multiple item selection.
 */
export function MultiSelect<T>({
  items,
  selected,
  onSelect,
  onConfirm,
  searchable = true,
  searchPlaceholder = 'Type to filter...',
  maxVisible = 10,
  isFocused = true,
  grouped: _grouped = false,
  minSelections = 0,
}: MultiSelectProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery) {
      return items;
    }
    const query = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query) ||
        item.group?.toLowerCase().includes(query),
    );
  }, [items, searchQuery]);

  // Calculate visible window for scrolling
  const startIndex = Math.max(
    0,
    Math.min(highlightedIndex - Math.floor(maxVisible / 2), filteredItems.length - maxVisible),
  );
  const visibleItems = filteredItems.slice(startIndex, startIndex + maxVisible);

  // Check if value is selected
  const isSelected = (value: T) => selected.some((s) => s === value);

  // Toggle selection
  const toggleSelection = (value: T) => {
    if (isSelected(value)) {
      onSelect(selected.filter((s) => s !== value));
    } else {
      onSelect([...selected, value]);
    }
  };

  // Handle keyboard input
  useInput(
    (input, key) => {
      if (!isFocused) {
        return;
      }

      // Start search mode on '/'
      if (input === '/' && searchable && !isSearching) {
        setIsSearching(true);
        return;
      }

      // Handle search mode
      if (isSearching) {
        if (key.escape) {
          setIsSearching(false);
          setSearchQuery('');
          return;
        }
        if (key.backspace || key.delete) {
          setSearchQuery((q) => q.slice(0, -1));
          setHighlightedIndex(0);
          return;
        }
        if (key.return) {
          setIsSearching(false);
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          setSearchQuery((q) => q + input);
          setHighlightedIndex(0);
          return;
        }
        return;
      }

      // Navigation
      if (key.upArrow || input === 'k') {
        setHighlightedIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow || input === 'j') {
        setHighlightedIndex((i) => Math.min(filteredItems.length - 1, i + 1));
        return;
      }

      // Toggle selection with space
      if (input === ' ') {
        const highlightedItem = filteredItems[highlightedIndex];
        if (highlightedItem && !highlightedItem.disabled) {
          toggleSelection(highlightedItem.value);
        }
        return;
      }

      // Confirm with Enter
      if (key.return) {
        if (selected.length >= minSelections && onConfirm) {
          onConfirm();
        }
        return;
      }

      // Clear search
      if (key.escape && searchQuery) {
        setSearchQuery('');
        setHighlightedIndex(0);
        return;
      }

      // Select all with 'a'
      if (input === 'a') {
        const allValues = filteredItems.filter((i) => !i.disabled).map((i) => i.value);
        onSelect(allValues);
        return;
      }

      // Clear all with 'n'
      if (input === 'n') {
        onSelect([]);
        return;
      }
    },
    { isActive: isFocused },
  );

  const canConfirm = selected.length >= minSelections;

  return (
    <Box flexDirection="column">
      {/* Search input */}
      {searchable && (
        <Box marginBottom={1}>
          {isSearching ? (
            <Box>
              <Text color="yellow">/</Text>
              <Text>{searchQuery}</Text>
              <Text color="gray">█</Text>
            </Box>
          ) : searchQuery ? (
            <Box>
              <Text dimColor>Filter: </Text>
              <Text color="cyan">{searchQuery}</Text>
              <Text dimColor> ({filteredItems.length} matches)</Text>
            </Box>
          ) : (
            <Text dimColor>{searchPlaceholder}</Text>
          )}
        </Box>
      )}

      {/* Items list */}
      <Box flexDirection="column">
        {/* Scroll indicator (top) */}
        {startIndex > 0 && <Text dimColor> ↑ {startIndex} more above</Text>}

        {visibleItems.map((item, visibleIndex) => {
          const actualIndex = startIndex + visibleIndex;
          const isHighlighted = actualIndex === highlightedIndex;
          const itemSelected = isSelected(item.value);

          return (
            <Box key={String(item.value)} flexDirection="row">
              {/* Selection indicator */}
              <Text color={isHighlighted ? 'cyan' : undefined}>{isHighlighted ? '▸ ' : '  '}</Text>

              {/* Checkbox */}
              <Text color={itemSelected ? 'green' : undefined}>
                {itemSelected ? '[x] ' : '[ ] '}
              </Text>

              {/* Label */}
              <Text
                color={item.disabled ? undefined : isHighlighted ? 'cyan' : undefined}
                dimColor={item.disabled}
                bold={isHighlighted}
              >
                {item.label}
              </Text>

              {/* Description */}
              {item.description && <Text dimColor> - {item.description}</Text>}
            </Box>
          );
        })}

        {/* Scroll indicator (bottom) */}
        {startIndex + maxVisible < filteredItems.length && (
          <Text dimColor> ↓ {filteredItems.length - startIndex - maxVisible} more below</Text>
        )}

        {/* No results */}
        {filteredItems.length === 0 && <Text dimColor>No matches found</Text>}
      </Box>

      {/* Selection count and hints */}
      <Box marginTop={1} flexDirection="row" gap={2}>
        <Text color={canConfirm ? 'green' : 'yellow'}>
          {selected.length} selected
          {minSelections > 0 && !canConfirm && ` (min: ${minSelections})`}
        </Text>
        <Text dimColor>[Space] toggle [a] all [n] none [/] search</Text>
      </Box>
    </Box>
  );
}
