/**
 * SearchIndicator - Shared search input display for selection components.
 *
 * Displays the current search state: active search input, applied filter,
 * or placeholder text. Used by SearchableSelect, MultiSelect, and
 * HierarchicalSelect.
 */

import { Box, Text } from 'ink';

export interface SearchIndicatorProps {
  /** Whether the user is currently typing a search query */
  isSearching: boolean;
  /** The current search query */
  searchQuery: string;
  /** Number of items matching the query */
  matchCount?: number;
  /** Placeholder text when no search is active */
  placeholder?: string;
}

/**
 * SearchIndicator component for displaying search state.
 */
export function SearchIndicator({
  isSearching,
  searchQuery,
  matchCount,
  placeholder = 'Type to filter... [/] to search',
}: SearchIndicatorProps): React.ReactElement | null {
  if (isSearching) {
    return (
      <Box>
        <Text color="yellow">/</Text>
        <Text>{searchQuery}</Text>
        <Text color="gray">█</Text>
      </Box>
    );
  }

  if (searchQuery) {
    return (
      <Box>
        <Text dimColor>Filter: </Text>
        <Text color="cyan">{searchQuery}</Text>
        {matchCount !== undefined && <Text dimColor> ({matchCount} matches)</Text>}
      </Box>
    );
  }

  return <Text dimColor>{placeholder}</Text>;
}
