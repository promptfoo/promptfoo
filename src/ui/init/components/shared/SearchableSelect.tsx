/**
 * SearchableSelect - Single-select component with search/filter.
 *
 * Allows users to select one item from a list, with optional
 * search functionality for filtering long lists.
 */

import { useMemo, useState } from 'react';

import { Box, Text, useInput } from 'ink';

export interface SelectItem<T> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SearchableSelectProps<T> {
  /** Items to select from */
  items: SelectItem<T>[];
  /** Currently selected value */
  value?: T;
  /** Callback when selection changes */
  onSelect: (value: T) => void;
  /** Whether search is enabled */
  searchable?: boolean;
  /** Placeholder text for search */
  searchPlaceholder?: string;
  /** Maximum visible items (for scrolling) */
  maxVisible?: number;
  /** Whether the component is focused */
  isFocused?: boolean;
}

/**
 * SearchableSelect component for single item selection.
 */
export function SearchableSelect<T>({
  items,
  value,
  onSelect,
  searchable = true,
  searchPlaceholder = 'Type to filter...',
  maxVisible = 8,
  isFocused = true,
}: SearchableSelectProps<T>) {
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
        item.label.toLowerCase().includes(query) || item.description?.toLowerCase().includes(query),
    );
  }, [items, searchQuery]);

  // Calculate visible window for scrolling
  const startIndex = Math.max(
    0,
    Math.min(highlightedIndex - Math.floor(maxVisible / 2), filteredItems.length - maxVisible),
  );
  const visibleItems = filteredItems.slice(startIndex, startIndex + maxVisible);

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
          // Keep the filter applied
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

      // Selection
      if (key.return) {
        const selectedItem = filteredItems[highlightedIndex];
        if (selectedItem && !selectedItem.disabled) {
          onSelect(selectedItem.value);
        }
        return;
      }

      // Clear search
      if (key.escape && searchQuery) {
        setSearchQuery('');
        setHighlightedIndex(0);
        return;
      }
    },
    { isActive: isFocused },
  );

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
            <Text dimColor>{searchPlaceholder} [/] to search</Text>
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
          const isSelected = value !== undefined && item.value === value;

          return (
            <Box key={String(item.value)} flexDirection="row">
              {/* Selection indicator */}
              <Text color={isHighlighted ? 'cyan' : undefined}>{isHighlighted ? '▸ ' : '  '}</Text>

              {/* Checkbox (if currently selected) */}
              <Text color={isSelected ? 'green' : undefined}>{isSelected ? '● ' : '○ '}</Text>

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
    </Box>
  );
}
