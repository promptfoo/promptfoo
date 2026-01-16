/**
 * SelectInput - Single selection list component with vim-style navigation.
 *
 * Provides keyboard navigation, search filtering, and group support.
 */

import { useEffect, useMemo, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import type { ProviderStatus, SelectItem } from '../../types';

export interface SelectInputProps<T = string> {
  /** Items to select from */
  items: SelectItem<T>[];
  /** Currently selected value */
  value: T | null;
  /** Called when selection changes */
  onChange: (value: T) => void;
  /** Called when user confirms selection */
  onSubmit?: (value: T) => void;
  /** Label shown above the list */
  label?: string;
  /** Whether the component is focused */
  isFocused?: boolean;
  /** Maximum visible rows */
  maxVisible?: number;
  /** Show search input */
  searchable?: boolean;
  /** Called when search mode state changes (for parent to disable conflicting handlers) */
  onSearchStateChange?: (isSearching: boolean) => void;
}

function StatusIndicator({ status }: { status?: ProviderStatus }) {
  if (!status) {
    return null;
  }

  switch (status) {
    case 'ready':
      return <Text color="green">✓</Text>;
    case 'missing-key':
      return <Text color="red">✗</Text>;
    case 'local':
      return <Text color="blue">●</Text>;
    default:
      return null;
  }
}

export function SelectInput<T = string>({
  items,
  value,
  onChange,
  onSubmit,
  label,
  isFocused = true,
  maxVisible = 10,
  searchable = false,
  onSearchStateChange,
}: SelectInputProps<T>) {
  // Find initial index based on value
  const initialIndex = useMemo(() => {
    if (value === null) {
      return 0;
    }
    const idx = items.findIndex((item) => item.value === value);
    return idx >= 0 ? idx : 0;
  }, [items, value]);

  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Notify parent when search state changes
  useEffect(() => {
    onSearchStateChange?.(isSearching);
  }, [isSearching, onSearchStateChange]);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) {
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

  // Group items by group property
  const groupedItems = useMemo(() => {
    const groups: { group: string | null; items: (SelectItem<T> & { originalIndex: number })[] }[] =
      [];
    let currentGroup: string | null = null;
    let currentItems: (SelectItem<T> & { originalIndex: number })[] = [];

    filteredItems.forEach((item, idx) => {
      const itemGroup = item.group ?? null;
      if (itemGroup !== currentGroup) {
        if (currentItems.length > 0) {
          groups.push({ group: currentGroup, items: currentItems });
        }
        currentGroup = itemGroup;
        currentItems = [];
      }
      currentItems.push({ ...item, originalIndex: idx });
    });

    if (currentItems.length > 0) {
      groups.push({ group: currentGroup, items: currentItems });
    }

    return groups;
  }, [filteredItems]);

  // Reset selection when items change
  useEffect(() => {
    if (selectedIndex >= filteredItems.length) {
      setSelectedIndex(Math.max(0, filteredItems.length - 1));
    }
  }, [filteredItems.length, selectedIndex]);

  // Keyboard navigation
  useInput(
    (input, key) => {
      if (!isFocused) {
        return;
      }

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
        if (key.backspace) {
          setSearchQuery((prev) => prev.slice(0, -1));
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          setSearchQuery((prev) => prev + input);
          return;
        }
        return;
      }

      // Navigation
      if (key.upArrow || input === 'k') {
        setSelectedIndex((prev) => {
          const newIndex = Math.max(0, prev - 1);
          // Skip disabled items
          let idx = newIndex;
          while (idx > 0 && filteredItems[idx]?.disabled) {
            idx--;
          }
          return filteredItems[idx]?.disabled ? prev : idx;
        });
      } else if (key.downArrow || input === 'j') {
        setSelectedIndex((prev) => {
          const newIndex = Math.min(filteredItems.length - 1, prev + 1);
          // Skip disabled items
          let idx = newIndex;
          while (idx < filteredItems.length - 1 && filteredItems[idx]?.disabled) {
            idx++;
          }
          return filteredItems[idx]?.disabled ? prev : idx;
        });
      } else if (input === 'g') {
        // Jump to first
        setSelectedIndex(0);
      } else if (input === 'G') {
        // Jump to last
        setSelectedIndex(filteredItems.length - 1);
      } else if (key.pageUp) {
        setSelectedIndex((prev) => Math.max(0, prev - maxVisible));
      } else if (key.pageDown) {
        setSelectedIndex((prev) => Math.min(filteredItems.length - 1, prev + maxVisible));
      }

      // Search
      if (searchable && input === '/') {
        setIsSearching(true);
        return;
      }

      // Selection
      if (key.return && filteredItems[selectedIndex] && !filteredItems[selectedIndex].disabled) {
        const selectedItem = filteredItems[selectedIndex];
        onChange(selectedItem.value);
        onSubmit?.(selectedItem.value);
      }
    },
    { isActive: isFocused },
  );

  // Flatten grouped items for rendering with scroll
  const flatItems = useMemo(() => {
    const result: (
      | { type: 'group'; name: string; flatIndex: number }
      | { type: 'item'; item: SelectItem<T>; index: number; flatIndex: number }
    )[] = [];
    let itemIndex = 0;
    let flatIndex = 0;
    for (const group of groupedItems) {
      if (group.group) {
        result.push({ type: 'group', name: group.group, flatIndex });
        flatIndex++;
      }
      for (const item of group.items) {
        result.push({ type: 'item', item, index: itemIndex, flatIndex });
        itemIndex++;
        flatIndex++;
      }
    }
    return result;
  }, [groupedItems]);

  // Find the flat index of the selected item (accounting for group headers)
  const selectedFlatIndex = useMemo(() => {
    const entry = flatItems.find((e) => e.type === 'item' && e.index === selectedIndex);
    return entry?.flatIndex ?? 0;
  }, [flatItems, selectedIndex]);

  // Compute scroll offset in flat space (accounting for group headers)
  const flatScrollOffset = useMemo(() => {
    const totalFlat = flatItems.length;
    if (selectedFlatIndex < maxVisible / 2) {
      return 0;
    }
    if (selectedFlatIndex > totalFlat - maxVisible / 2) {
      return Math.max(0, totalFlat - maxVisible);
    }
    return Math.max(0, selectedFlatIndex - Math.floor(maxVisible / 2));
  }, [selectedFlatIndex, flatItems.length, maxVisible]);

  // Apply scroll offset to flat items
  const visibleItems = flatItems.slice(flatScrollOffset, flatScrollOffset + maxVisible);

  return (
    <Box flexDirection="column">
      {label && (
        <Box marginBottom={1}>
          <Text bold color="cyan">
            {label}
          </Text>
        </Box>
      )}

      {isSearching && (
        <Box marginBottom={1}>
          <Text color="cyan">Search: </Text>
          <Text>{searchQuery}</Text>
          <Text color="gray">█</Text>
        </Box>
      )}

      {searchQuery && !isSearching && (
        <Box marginBottom={1}>
          <Text dimColor>
            Filtered: {filteredItems.length} of {items.length}
          </Text>
        </Box>
      )}

      <Box flexDirection="column" height={Math.min(maxVisible, flatItems.length)}>
        {filteredItems.length === 0 ? (
          <Text color="gray">{searchQuery ? 'No matches found' : 'No items'}</Text>
        ) : (
          visibleItems.map((entry, idx) => {
            if (entry.type === 'group') {
              return (
                <Box key={`group-${entry.name}-${idx}`} marginTop={idx > 0 ? 1 : 0}>
                  <Text bold dimColor>
                    {entry.name}
                  </Text>
                </Box>
              );
            }

            const { item, index } = entry;
            const isSelected = index === selectedIndex;

            return (
              <Box key={`item-${index}`}>
                <Box width={3}>
                  <Text color={isSelected ? 'cyan' : undefined}>{isSelected ? '▶' : ' '}</Text>
                </Box>
                <Box flexGrow={1}>
                  <Text
                    color={item.disabled ? 'gray' : isSelected ? 'cyan' : undefined}
                    dimColor={item.disabled}
                  >
                    {item.label}
                  </Text>
                  {item.description && (
                    <Text dimColor>
                      {' '}
                      - {item.description.slice(0, 40)}
                      {item.description.length > 40 ? '…' : ''}
                    </Text>
                  )}
                </Box>
                {item.status && (
                  <Box marginLeft={1}>
                    <StatusIndicator status={item.status} />
                  </Box>
                )}
              </Box>
            );
          })
        )}
      </Box>

      {flatItems.length > maxVisible && (
        <Box marginTop={1}>
          <Text dimColor>
            {flatScrollOffset + 1}-{Math.min(flatScrollOffset + maxVisible, flatItems.length)} of{' '}
            {flatItems.length}
          </Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          ↑↓/jk: navigate | Enter: select{searchable ? ' | /: search' : ''} | g/G: first/last
        </Text>
      </Box>
    </Box>
  );
}
