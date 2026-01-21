import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@app/lib/utils';
import { X } from 'lucide-react';
import { Badge } from './badge';

export interface TagInputProps {
  /** Current selected values */
  value: string[];
  /** Callback when values change */
  onChange: (values: string[]) => void;
  /** Available suggestions for autocomplete */
  suggestions?: string[];
  /** Placeholder text when no values are selected */
  placeholder?: string;
  /** Function to normalize/validate input before adding */
  normalizeValue?: (input: string) => string | null;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Additional class name for the container */
  className?: string;
  /** Label for accessibility */
  'aria-label'?: string;
}

const ITEM_HEIGHT = 32;
const MAX_HEIGHT = 256;

/**
 * A reusable tag input component with autocomplete support.
 *
 * Features:
 * - Autocomplete suggestions that filter as you type
 * - Keyboard navigation (Enter to add, Backspace to remove, Escape to close, Arrow keys to navigate)
 * - Click to add suggestions
 * - Pills/badges for selected values with remove button
 * - Scrollable suggestions dropdown
 */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = 'Type to add...',
  normalizeValue,
  disabled = false,
  className,
  'aria-label': ariaLabel,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter suggestions based on input and already selected values
  const filteredSuggestions = useMemo(() => {
    // Build a set of normalized selected values for efficient lookup
    const selectedNormalized = new Set(
      value.map((v) => (normalizeValue ? normalizeValue(v) : v) || v),
    );

    // Filter out suggestions that match already-selected values (accounting for normalization)
    const available = suggestions.filter((s) => {
      const normalizedSuggestion = normalizeValue ? normalizeValue(s) : s;
      return !selectedNormalized.has(normalizedSuggestion || s);
    });

    if (!inputValue.trim()) {
      return available;
    }

    const search = inputValue.toLowerCase();
    return available.filter((s) => s.toLowerCase().includes(search));
  }, [inputValue, value, suggestions, normalizeValue]);

  // Reset highlighted index when suggestions change
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [filteredSuggestions]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Add a value
  const addValue = useCallback(
    (val: string) => {
      const normalized = normalizeValue ? normalizeValue(val) : val.trim();
      if (normalized && !value.includes(normalized)) {
        onChange([...value, normalized]);
      }
      setInputValue('');
      setHighlightedIndex(-1);
      inputRef.current?.focus();
    },
    [value, onChange, normalizeValue],
  );

  // Remove a value
  const removeValue = useCallback(
    (val: string) => {
      onChange(value.filter((v) => v !== val));
      inputRef.current?.focus();
    },
    [value, onChange],
  );

  // Remove the last value (for backspace)
  const removeLastValue = useCallback(() => {
    if (value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }, [value, onChange]);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          if (highlightedIndex >= 0 && filteredSuggestions[highlightedIndex]) {
            addValue(filteredSuggestions[highlightedIndex]);
          } else if (inputValue.trim()) {
            addValue(inputValue.trim());
          }
          break;

        case 'Backspace':
          if (inputValue === '' && value.length > 0) {
            e.preventDefault();
            removeLastValue();
          }
          break;

        case 'Escape':
          setIsOpen(false);
          setHighlightedIndex(-1);
          break;

        case 'ArrowDown':
          e.preventDefault();
          if (!isOpen && filteredSuggestions.length > 0) {
            setIsOpen(true);
          }
          setHighlightedIndex((prev) => (prev < filteredSuggestions.length - 1 ? prev + 1 : prev));
          break;

        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
          break;

        case 'Tab':
          if (isOpen && highlightedIndex >= 0 && filteredSuggestions[highlightedIndex]) {
            e.preventDefault();
            addValue(filteredSuggestions[highlightedIndex]);
          }
          break;
      }
    },
    [inputValue, value, highlightedIndex, filteredSuggestions, isOpen, addValue, removeLastValue],
  );

  const showDropdown = isOpen && filteredSuggestions.length > 0;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div
        className={cn(
          'flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-white dark:bg-zinc-900 px-3 py-2',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
          disabled && 'cursor-not-allowed opacity-50',
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((v) => (
          <Badge key={v} variant="secondary" className="gap-1 py-0.5">
            {v}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeValue(v);
                }}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label={`Remove ${v}`}
              >
                <X className="size-3" />
              </button>
            )}
          </Badge>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
          disabled={disabled}
          className={cn(
            'min-w-32 flex-1 border-none bg-transparent outline-none',
            'placeholder:text-muted-foreground',
            'disabled:cursor-not-allowed',
          )}
          role="combobox"
          aria-expanded={showDropdown}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-controls={showDropdown ? 'tag-input-listbox' : undefined}
          aria-activedescendant={
            highlightedIndex >= 0 ? `tag-input-option-${highlightedIndex}` : undefined
          }
        />
      </div>

      {showDropdown && (
        <div
          className={cn(
            'absolute left-0 right-0 z-(--z-dropdown) mt-1',
            'overflow-hidden rounded-md border border-border bg-white dark:bg-zinc-900 shadow-lg',
          )}
        >
          <div
            ref={listRef}
            id="tag-input-listbox"
            role="listbox"
            className="overflow-y-auto p-1"
            style={{ maxHeight: MAX_HEIGHT }}
          >
            {filteredSuggestions.map((suggestion, index) => (
              <button
                key={suggestion}
                id={`tag-input-option-${index}`}
                type="button"
                role="option"
                aria-selected={highlightedIndex === index}
                onMouseDown={(e) => {
                  // Prevent input blur which would close dropdown
                  e.preventDefault();
                }}
                onClick={() => addValue(suggestion)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={cn(
                  'flex w-full cursor-pointer items-center rounded-sm px-2 text-left text-sm',
                  'hover:bg-accent hover:text-accent-foreground',
                  highlightedIndex === index && 'bg-accent text-accent-foreground',
                )}
                style={{ height: ITEM_HEIGHT }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
