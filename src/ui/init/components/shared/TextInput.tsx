/**
 * TextInput - Single-line text input component.
 *
 * A styled text input with cursor, placeholder, and validation support.
 */

import { useEffect, useState } from 'react';

import { Box, Text, useInput } from 'ink';
import type { Key } from 'ink';

export interface TextInputProps {
  /** Current value */
  value: string;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Callback when Enter is pressed */
  onSubmit?: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Whether the input is focused */
  isFocused?: boolean;
  /** Whether to mask the input (for passwords) */
  mask?: boolean;
  /** Validation function - return error message or null */
  validate?: (value: string) => string | null;
  /** Label to show above the input */
  label?: string;
}

function handleCtrlInput(
  input: string,
  key: Key,
  value: string,
  cursorPosition: number,
  onChange: (v: string) => void,
  setCursorPosition: (pos: number) => void,
) {
  if (key.ctrl && input === 'a') {
    setCursorPosition(0);
    return;
  }
  if (key.ctrl && input === 'e') {
    setCursorPosition(value.length);
    return;
  }
  if (key.ctrl && input === 'u') {
    onChange('');
    setCursorPosition(0);
    return;
  }
  if (input && !key.ctrl && !key.meta) {
    const newValue = value.slice(0, cursorPosition) + input + value.slice(cursorPosition);
    onChange(newValue);
    setCursorPosition(cursorPosition + input.length);
  }
}

function handleNavigationKey(
  key: Key,
  value: string,
  cursorPosition: number,
  onChange: (v: string) => void,
  setCursorPosition: (pos: number) => void,
): boolean {
  if (key.backspace) {
    if (cursorPosition > 0) {
      const newValue = value.slice(0, cursorPosition - 1) + value.slice(cursorPosition);
      onChange(newValue);
      setCursorPosition(cursorPosition - 1);
    }
    return true;
  }
  if (key.delete) {
    if (cursorPosition < value.length) {
      const newValue = value.slice(0, cursorPosition) + value.slice(cursorPosition + 1);
      onChange(newValue);
    }
    return true;
  }
  if (key.leftArrow) {
    setCursorPosition(Math.max(0, cursorPosition - 1));
    return true;
  }
  if (key.rightArrow) {
    setCursorPosition(Math.min(value.length, cursorPosition + 1));
    return true;
  }
  return false;
}

/**
 * TextInput component for single-line text entry.
 */
export function TextInput({
  value,
  onChange,
  onSubmit,
  placeholder = '',
  isFocused = true,
  mask = false,
  validate,
  label,
}: TextInputProps) {
  const [cursorPosition, setCursorPosition] = useState(value.length);
  const [error, setError] = useState<string | null>(null);

  // Validate on value change
  useEffect(() => {
    if (validate) {
      setError(validate(value));
    }
  }, [value, validate]);

  // Keep cursor in bounds
  useEffect(() => {
    if (cursorPosition > value.length) {
      setCursorPosition(value.length);
    }
  }, [value, cursorPosition]);

  // Handle keyboard input
  useInput(
    (input, key) => {
      if (!isFocused) {
        return;
      }

      // Submit on Enter
      if (key.return) {
        if (!error && onSubmit) {
          onSubmit(value);
        }
        return;
      }

      const handled = handleNavigationKey(key, value, cursorPosition, onChange, setCursorPosition);
      if (!handled) {
        handleCtrlInput(input, key, value, cursorPosition, onChange, setCursorPosition);
      }
    },
    { isActive: isFocused },
  );

  // Render the text with cursor
  const displayValue = mask ? '*'.repeat(value.length) : value;
  const beforeCursor = displayValue.slice(0, cursorPosition);
  const afterCursor = displayValue.slice(cursorPosition);
  const showPlaceholder = value.length === 0 && placeholder;

  return (
    <Box flexDirection="column">
      {label && (
        <Box marginBottom={1}>
          <Text bold>{label}</Text>
        </Box>
      )}

      <Box>
        {showPlaceholder ? (
          <>
            <Text color="gray">█</Text>
            <Text dimColor>{placeholder}</Text>
          </>
        ) : (
          <>
            <Text>{beforeCursor}</Text>
            <Text color="gray">█</Text>
            <Text>{afterCursor}</Text>
          </>
        )}
      </Box>

      {error && (
        <Box marginTop={1}>
          <Text color="red">⚠ {error}</Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Simple static text input display (no interactivity).
 */
export function TextDisplay({
  label,
  value,
  placeholder,
}: {
  label?: string;
  value: string;
  placeholder?: string;
}) {
  return (
    <Box flexDirection="column">
      {label && <Text dimColor>{label}: </Text>}
      <Text color={value ? undefined : 'gray'}>{value || placeholder || '(empty)'}</Text>
    </Box>
  );
}
