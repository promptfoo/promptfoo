/**
 * CommandInput - Input component for command-line style filters.
 *
 * Features:
 * - Vim-style activation (:)
 * - Supports :filter column operator value commands
 * - Autocomplete suggestions for columns
 * - Enter to apply, Escape to cancel
 * - Error display for invalid commands
 */

import { Box, Text, useInput } from 'ink';
import { useEffect, useRef, useState } from 'react';
import type { ColumnFilter, FilterOperator } from './types';
import type { NavigationAction } from './useTableNavigation';

export interface CommandInputProps {
  /** Current command input */
  input: string;
  /** Whether command mode is active */
  isActive: boolean;
  /** Dispatch navigation actions */
  dispatch: (action: NavigationAction) => void;
  /** Callback when a filter is parsed and applied */
  onFilterApply: (filter: ColumnFilter) => void;
  /** Callback when filters are cleared */
  onFilterClear: () => void;
}

/**
 * Valid filter operators.
 */
const VALID_OPERATORS: FilterOperator[] = ['=', '!=', '>', '>=', '<', '<=', '~', '!~'];

/**
 * Filterable column names.
 */
const FILTERABLE_COLUMNS = ['score', 'cost', 'latency', 'provider', 'output', 'status'];

/**
 * Parse a filter command string into a ColumnFilter.
 *
 * Supported formats:
 * - :filter score > 0.5
 * - :filter cost < 0.01
 * - :filter latency > 1000
 * - :filter provider ~ openai
 * - :filter status = pass
 * - :clear (clears all filters)
 */
export function parseFilterCommand(
  input: string,
): { filter: ColumnFilter; error: null } | { filter: null; error: string } | { clear: true } {
  const trimmed = input.trim();

  // Handle clear command
  if (trimmed === 'clear' || trimmed === 'reset') {
    return { clear: true };
  }

  // Parse filter command
  const filterMatch = trimmed.match(/^filter\s+(\w+)\s*([=!<>~]+)\s*(.+)$/i);
  if (!filterMatch) {
    return {
      filter: null,
      error: 'Usage: :filter column operator value (e.g., :filter score > 0.5)',
    };
  }

  const [, column, operatorStr, valueStr] = filterMatch;
  const columnLower = column.toLowerCase();

  // Validate column
  if (!FILTERABLE_COLUMNS.includes(columnLower)) {
    return {
      filter: null,
      error: `Unknown column: ${column}. Valid: ${FILTERABLE_COLUMNS.join(', ')}`,
    };
  }

  // Validate operator
  const operator = operatorStr as FilterOperator;
  if (!VALID_OPERATORS.includes(operator)) {
    return {
      filter: null,
      error: `Invalid operator: ${operatorStr}. Valid: ${VALID_OPERATORS.join(', ')}`,
    };
  }

  // Parse value (number or string)
  let value: string | number = valueStr.trim();

  // Try to parse as number for numeric columns
  if (['score', 'cost', 'latency'].includes(columnLower)) {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      value = numValue;
    } else if (operator !== '~' && operator !== '!~') {
      return {
        filter: null,
        error: `Expected numeric value for ${column}`,
      };
    }
  }

  return {
    filter: {
      column: columnLower,
      operator,
      value,
    },
    error: null,
  };
}

/**
 * CommandInput component for filter commands.
 */
export function CommandInput({
  input,
  isActive,
  dispatch,
  onFilterApply,
  onFilterClear,
}: CommandInputProps) {
  const [localInput, setLocalInput] = useState(input || '');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<string>(localInput);

  // Sync local input with prop changes
  useEffect(() => {
    setLocalInput(input || '');
    inputRef.current = input || '';
    setError(null);
  }, [input]);

  // Handle keyboard input when active
  useInput(
    (char, key) => {
      if (!isActive) {
        return;
      }

      // Handle special keys
      if (key.return) {
        // Parse and apply command
        const result = parseFilterCommand(inputRef.current);

        if ('clear' in result) {
          onFilterClear();
          dispatch({ type: 'EXECUTE_COMMAND' });
          return;
        }

        if (result.error) {
          setError(result.error);
          return;
        }

        if (result.filter) {
          onFilterApply(result.filter);
          dispatch({ type: 'EXECUTE_COMMAND' });
        }
        return;
      }

      if (key.escape) {
        dispatch({ type: 'CANCEL_COMMAND' });
        return;
      }

      if (key.backspace || key.delete) {
        const newInput = inputRef.current.slice(0, -1);
        inputRef.current = newInput;
        setLocalInput(newInput);
        dispatch({ type: 'UPDATE_COMMAND', input: newInput });
        setError(null);
        return;
      }

      // Regular character input
      if (char && !key.ctrl && !key.meta) {
        const newInput = inputRef.current + char;
        inputRef.current = newInput;
        setLocalInput(newInput);
        dispatch({ type: 'UPDATE_COMMAND', input: newInput });
        setError(null);
      }
    },
    { isActive },
  );

  if (!isActive) {
    return null;
  }

  // Generate autocomplete suggestions
  const getSuggestions = (): string[] => {
    const trimmed = localInput.trim().toLowerCase();

    // Suggest commands
    if (trimmed === '' || 'filter'.startsWith(trimmed)) {
      return ['filter <column> <op> <value>', 'clear'];
    }

    // After 'filter ', suggest columns
    if (trimmed.startsWith('filter ')) {
      const afterFilter = trimmed.slice(7).trim();
      if (afterFilter === '') {
        return FILTERABLE_COLUMNS;
      }

      // Suggest columns that match prefix
      const matchingCols = FILTERABLE_COLUMNS.filter((c) => c.startsWith(afterFilter));
      if (matchingCols.length > 0) {
        return matchingCols;
      }

      // After column, suggest operators
      const columnMatch = afterFilter.match(/^(\w+)\s*$/);
      if (columnMatch && FILTERABLE_COLUMNS.includes(columnMatch[1])) {
        return VALID_OPERATORS;
      }
    }

    return [];
  };

  const suggestions = getSuggestions();

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color="yellow">:</Text>
        <Text>{localInput}</Text>
        <Text color="gray">█</Text>
        <Text dimColor> [Enter] apply | [Esc] cancel</Text>
      </Box>

      {/* Error message */}
      {error && (
        <Box marginTop={0}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      {/* Suggestions */}
      {!error && suggestions.length > 0 && (
        <Box marginTop={0}>
          <Text dimColor>Suggestions: {suggestions.slice(0, 5).join(', ')}</Text>
        </Box>
      )}
    </Box>
  );
}

export default CommandInput;
