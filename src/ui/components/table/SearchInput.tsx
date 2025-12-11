/**
 * SearchInput - Input component for searching within the results table.
 *
 * Features:
 * - Vim-style activation (/)
 * - Real-time search as you type
 * - Enter to apply, Escape to cancel
 * - Shows match count
 */

import { Box, Text, useInput } from 'ink';
import { useEffect, useRef, useState } from 'react';
import type { NavigationAction } from './useTableNavigation';

export interface SearchInputProps {
  /** Current search query */
  query: string;
  /** Whether search is active */
  isActive: boolean;
  /** Number of matches found */
  matchCount?: number;
  /** Total number of rows */
  totalCount?: number;
  /** Dispatch navigation actions */
  dispatch: (action: NavigationAction) => void;
}

/**
 * SearchInput component for filtering results.
 */
export function SearchInput({
  query,
  isActive,
  matchCount,
  totalCount,
  dispatch,
}: SearchInputProps) {
  const [localQuery, setLocalQuery] = useState(query || '');
  const inputRef = useRef<string>(localQuery);

  // Sync local query with prop changes
  useEffect(() => {
    setLocalQuery(query || '');
    inputRef.current = query || '';
  }, [query]);

  // Handle keyboard input when active
  useInput(
    (input, key) => {
      if (!isActive) {
        return;
      }

      // Handle special keys
      if (key.return) {
        // Apply search and close input
        dispatch({ type: 'APPLY_SEARCH' });
        return;
      }

      if (key.escape) {
        // Cancel search without applying
        dispatch({ type: 'CANCEL_SEARCH' });
        return;
      }

      if (key.backspace || key.delete) {
        // Remove last character
        const newQuery = inputRef.current.slice(0, -1);
        inputRef.current = newQuery;
        setLocalQuery(newQuery);
        dispatch({ type: 'UPDATE_SEARCH', query: newQuery });
        return;
      }

      // Regular character input
      if (input && !key.ctrl && !key.meta) {
        const newQuery = inputRef.current + input;
        inputRef.current = newQuery;
        setLocalQuery(newQuery);
        dispatch({ type: 'UPDATE_SEARCH', query: newQuery });
      }
    },
    { isActive },
  );

  if (!isActive) {
    return null;
  }

  return (
    <Box marginTop={1}>
      <Text color="yellow">/</Text>
      <Text>{localQuery}</Text>
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
