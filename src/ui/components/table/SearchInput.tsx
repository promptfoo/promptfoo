/**
 * SearchInput - Display component for the search query in the results table.
 *
 * Note: All keyboard input is handled centrally in useTableNavigation
 * to avoid timing issues with multiple useInput hooks.
 *
 * Features:
 * - Vim-style activation (/)
 * - Real-time search display
 * - Shows match count
 */

import { Box, Text } from 'ink';

export interface SearchInputProps {
  /** Current search query */
  query: string;
  /** Whether search is active */
  isActive: boolean;
  /** Number of matches found */
  matchCount?: number;
  /** Total number of rows */
  totalCount?: number;
}

/**
 * SearchInput component for displaying search query.
 * Input handling is done in useTableNavigation.
 */
export function SearchInput({ query, isActive, matchCount, totalCount }: SearchInputProps) {
  if (!isActive) {
    return null;
  }

  return (
    <Box marginTop={1}>
      <Text color="yellow">/</Text>
      <Text>{query}</Text>
      <Text color="gray">█</Text>
      {matchCount !== undefined && totalCount !== undefined && (
        <Text dimColor>
          {' '}
          ({matchCount}/{totalCount})
        </Text>
      )}
      <Text dimColor> [Enter] apply | [Esc] cancel</Text>
    </Box>
  );
}

export default SearchInput;
