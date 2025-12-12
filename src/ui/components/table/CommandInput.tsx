/**
 * CommandInput - Display component for command-line style filters.
 *
 * Note: All keyboard input is handled centrally in useTableNavigation
 * to avoid timing issues with multiple useInput hooks.
 *
 * Features:
 * - Vim-style activation (:)
 * - Supports :filter column operator value commands
 * - Autocomplete suggestions for columns
 * - Error display for invalid commands
 */

import { Box, Text } from 'ink';
import type { ColumnFilter, FilterOperator } from './types';

export interface CommandInputProps {
  /** Current command input */
  input: string;
  /** Whether command mode is active */
  isActive: boolean;
  /** Error message to display */
  error?: string | null;
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
 * Parse a filter command string into a ColumnFilter or navigation command.
 *
 * Supported formats:
 * - :50 (jump to row 50, 1-indexed)
 * - :$ (jump to last row)
 * - :filter score > 0.5
 * - :filter cost < 0.01
 * - :filter latency > 1000
 * - :filter provider ~ openai
 * - :filter status = pass
 * - :clear (clears all filters)
 */
export function parseFilterCommand(
  input: string,
):
  | { filter: ColumnFilter; error: null }
  | { filter: null; error: string }
  | { clear: true }
  | { goto: number }
  | { gotoLast: true } {
  const trimmed = input.trim();

  // Handle row jump: pure number (1-indexed for user, convert to 0-indexed)
  if (/^\d+$/.test(trimmed)) {
    const rowNum = parseInt(trimmed, 10);
    if (rowNum < 1) {
      return { filter: null, error: 'Row number must be at least 1' };
    }
    return { goto: rowNum - 1 }; // Convert to 0-indexed
  }

  // Handle :$ (jump to last row)
  if (trimmed === '$') {
    return { gotoLast: true };
  }

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
 * CommandInput component for displaying filter commands.
 * Input handling is done in useTableNavigation.
 */
export function CommandInput({ input, isActive, error }: CommandInputProps) {
  if (!isActive) {
    return null;
  }

  // Generate autocomplete suggestions
  const getSuggestions = (): string[] => {
    const trimmed = input.trim().toLowerCase();

    // Suggest commands
    if (trimmed === '' || 'filter'.startsWith(trimmed)) {
      return ['{row#} goto', 'filter <column> <op> <value>', 'clear'];
    }

    // If typing a number, show goto hint
    if (/^\d+$/.test(trimmed)) {
      return [`→ row ${trimmed}`];
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
        <Text>{input}</Text>
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
