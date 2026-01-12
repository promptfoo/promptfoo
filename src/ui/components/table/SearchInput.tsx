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
 * - Inline regex validation with error display
 */

import { useMemo } from 'react';

import { Box, Text } from 'ink';
import { parseSearchQuery } from './filterUtils';

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
  // Parse query to check for regex errors
  const parsed = useMemo(() => (query ? parseSearchQuery(query) : null), [query]);
  const hasRegexError = parsed?.isRegex && parsed?.error;

  if (!isActive) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color="yellow">/</Text>
        <Text color={hasRegexError ? 'red' : undefined}>{query}</Text>
        <Text color="gray">█</Text>
        {matchCount !== undefined && totalCount !== undefined && !hasRegexError && (
          <Text dimColor>
            {' '}
            ({matchCount}/{totalCount})
          </Text>
        )}
        {hasRegexError && <Text color="red"> (invalid regex)</Text>}
        <Text dimColor> [Enter] apply | [Esc] cancel</Text>
      </Box>
      {hasRegexError && (
        <Box>
          <Text color="red">⚠ {parsed?.error}</Text>
        </Box>
      )}
    </Box>
  );
}
