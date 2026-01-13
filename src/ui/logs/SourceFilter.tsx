/**
 * Source filter panel for the log viewer.
 */

import React, { useCallback, useState } from 'react';

import { Box, Text, useInput } from 'ink';

export interface SourceFilterProps {
  /** Available sources with their counts */
  sources: Map<string, number>;

  /** Currently selected sources (null = all) */
  selectedSources: Set<string> | null;

  /** Callback when filter is applied */
  onApply: (sources: Set<string> | null) => void;

  /** Callback when filter is cancelled */
  onCancel: () => void;

  /** Maximum width */
  maxWidth: number;

  /** Maximum height */
  maxHeight: number;
}

/**
 * Source filter panel component.
 *
 * Shows a list of sources with checkboxes. Space toggles selection,
 * Enter applies the filter, Escape cancels.
 */
export function SourceFilter({
  sources,
  selectedSources,
  onApply,
  onCancel,
  maxWidth,
  maxHeight,
}: SourceFilterProps): React.ReactElement {
  // Convert sources to sorted array
  const sourceList = Array.from(sources.entries()).sort((a, b) => b[1] - a[1]); // Sort by count desc

  // Internal state for selections (start with current selection or all)
  const [selected, setSelected] = useState<Set<string>>(() => {
    if (selectedSources) {
      return new Set(selectedSources);
    }
    // Default to all selected
    return new Set(sourceList.map(([name]) => name));
  });

  const [cursor, setCursor] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Calculate visible items
  const headerHeight = 2;
  const footerHeight = 2;
  const contentHeight = Math.max(1, maxHeight - headerHeight - footerHeight);
  const visibleSources = sourceList.slice(scrollOffset, scrollOffset + contentHeight);

  // Handle keyboard input
  useInput(
    useCallback(
      (input, key) => {
        if (key.escape) {
          onCancel();
          return;
        }

        if (key.return) {
          // Apply filter - if all selected, pass null (no filter)
          if (selected.size === sourceList.length) {
            onApply(null);
          } else if (selected.size === 0) {
            // Can't filter to nothing - treat as cancel
            onCancel();
          } else {
            onApply(selected);
          }
          return;
        }

        if (input === 'j' || key.downArrow) {
          const newCursor = Math.min(cursor + 1, sourceList.length - 1);
          setCursor(newCursor);
          // Scroll if cursor is below visible area
          if (newCursor >= scrollOffset + contentHeight) {
            setScrollOffset(newCursor - contentHeight + 1);
          }
          return;
        }

        if (input === 'k' || key.upArrow) {
          const newCursor = Math.max(cursor - 1, 0);
          setCursor(newCursor);
          // Scroll if cursor is above visible area
          if (newCursor < scrollOffset) {
            setScrollOffset(newCursor);
          }
          return;
        }

        if (input === ' ') {
          // Toggle selection
          const sourceName = sourceList[cursor][0];
          setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(sourceName)) {
              next.delete(sourceName);
            } else {
              next.add(sourceName);
            }
            return next;
          });
          return;
        }

        if (input === 'a') {
          // Select all
          setSelected(new Set(sourceList.map(([name]) => name)));
          return;
        }

        if (input === 'n') {
          // Select none
          setSelected(new Set());
          return;
        }
      },
      [cursor, sourceList, scrollOffset, contentHeight, selected, onApply, onCancel],
    ),
  );

  const panelWidth = Math.min(maxWidth - 4, 50);

  return (
    <Box flexDirection="column" width={panelWidth} borderStyle="double" borderColor="cyan">
      {/* Header */}
      <Box paddingX={1} justifyContent="space-between">
        <Text bold color="cyan">
          Filter by Source
        </Text>
        <Text dimColor>
          {selected.size}/{sourceList.length}
        </Text>
      </Box>

      {/* Source list */}
      <Box flexDirection="column" height={contentHeight} paddingX={1}>
        {visibleSources.map(([sourceName, count], idx) => {
          const actualIdx = scrollOffset + idx;
          const isSelected = selected.has(sourceName);
          const isCursor = actualIdx === cursor;

          return (
            <Box key={sourceName}>
              <Text inverse={isCursor}>
                <Text color={isSelected ? 'green' : 'gray'}>{isSelected ? '[✓]' : '[ ]'}</Text>
                <Text> </Text>
                <Text>{sourceName.length > 25 ? sourceName.slice(0, 22) + '...' : sourceName}</Text>
              </Text>
              <Text dimColor> ({count})</Text>
            </Box>
          );
        })}
        {sourceList.length === 0 && <Text dimColor>No sources found</Text>}
      </Box>

      {/* Footer */}
      <Box
        paddingX={1}
        borderStyle="single"
        borderTop={true}
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
      >
        <Text dimColor>Space:toggle a:all n:none Enter:apply Esc:cancel</Text>
      </Box>
    </Box>
  );
}

export default SourceFilter;
