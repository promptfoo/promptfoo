import * as React from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FocusEvent, KeyboardEvent, MouseEvent } from 'react';

import { Popover, PopoverAnchor, PopoverContent } from '@app/components/ui/popover';
import { cn } from '@app/lib/utils';
import { Check, ChevronDown, X } from 'lucide-react';

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

interface ComboboxProps extends Omit<React.ComponentProps<'input'>, 'onChange' | 'value' | 'type'> {
  options: ComboboxOption[];
  value?: string;
  onChange: (value: string) => void;
  emptyMessage?: string;
  clearable?: boolean;
  label?: string;
}

function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Search...',
  emptyMessage = 'No results found.',
  disabled = false,
  clearable = true,
  label,
  className,
  'data-testid': testId,
  ...props
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const listboxId = useId();

  const selectedOption = options.find((option) => option.value === value);

  // Sync input value with selected option (only when not actively typing)
  useEffect(() => {
    if (!isTyping) {
      setInputValue(selectedOption?.label || '');
    }
  }, [selectedOption, isTyping]);

  // Show all options when dropdown opens, filter only when user is typing something different
  const filteredOptions = useMemo(() => {
    // If not typing or input matches selected, show all options
    if (!isTyping || inputValue === selectedOption?.label) {
      return options;
    }
    // Otherwise filter based on input
    const searchLower = inputValue.toLowerCase();
    return options.filter((option) => option.label.toLowerCase().includes(searchLower));
  }, [options, inputValue, isTyping, selectedOption?.label]);

  const handleSelect = useCallback(
    (optionValue: string) => {
      onChange(optionValue);
      const selected = options.find((option) => option.value === optionValue);
      setInputValue(selected?.label || '');
      setIsTyping(false);
      setOpen(false);
      setHighlightedIndex(-1);
    },
    [onChange, options],
  );

  const handleClear = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onChange('');
      setInputValue('');
      setIsTyping(false);
      inputRef.current?.focus();
    },
    [onChange],
  );

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInputValue(newValue);
      setIsTyping(true);
      setOpen(true);
      setHighlightedIndex(-1);

      // If input is cleared, clear the selection
      if (!newValue) {
        onChange('');
      }
    },
    [onChange],
  );

  const handleInputFocus = useCallback(() => {
    setOpen(true);
    // Select all text on focus so user can immediately type to search
    inputRef.current?.select();
  }, []);

  const handleInputClick = useCallback(() => {
    // Open dropdown on click even if already focused
    setOpen(true);
  }, []);

  const handleChevronClick = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) {
        return;
      }
      setOpen((prev) => !prev);
      inputRef.current?.focus();
    },
    [disabled],
  );

  const handleInputBlur = useCallback(
    (e: FocusEvent) => {
      // Don't close if clicking on the popover content, clear button, or chevron
      const relatedTarget = e.relatedTarget as HTMLElement;
      if (
        relatedTarget?.closest('[data-combobox-content]') ||
        relatedTarget?.closest('[data-combobox-clear]') ||
        relatedTarget?.closest('[data-combobox-chevron]')
      ) {
        return;
      }

      // On blur, reset to selected value if input doesn't match
      const matchingOption = options.find(
        (option) => option.label.toLowerCase() === inputValue.toLowerCase(),
      );

      if (matchingOption) {
        onChange(matchingOption.value);
        setInputValue(matchingOption.label);
      } else if (selectedOption) {
        setInputValue(selectedOption.label);
      } else {
        setInputValue('');
      }

      setIsTyping(false);
      setOpen(false);
      setHighlightedIndex(-1);
    },
    [options, inputValue, onChange, selectedOption],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          setOpen(true);
          e.preventDefault();
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case 'Enter':
          e.preventDefault();
          if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
            handleSelect(filteredOptions[highlightedIndex].value);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setOpen(false);
          setIsTyping(false);
          setHighlightedIndex(-1);
          if (selectedOption) {
            setInputValue(selectedOption.label);
          }
          break;
      }
    },
    [open, filteredOptions, highlightedIndex, handleSelect, selectedOption],
  );

  // Scroll highlighted option into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const highlighted = listRef.current.children[highlightedIndex] as HTMLElement;
      highlighted?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  const showDropdown = open && options.length > 0;
  const showClearButton = clearable && !!value && !disabled;
  const inputId = `${listboxId}-input`;

  return (
    <div className="flex flex-col">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 text-xs font-medium text-muted-foreground">
          {label}
        </label>
      )}
      <Popover open={showDropdown}>
        <PopoverAnchor asChild>
          <div className="relative">
            <input
              {...props}
              id={inputId}
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={showDropdown}
              aria-haspopup="listbox"
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-activedescendant={
                highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined
              }
              data-testid={testId}
              disabled={disabled}
              value={inputValue}
              onChange={handleInputChange}
              onFocus={handleInputFocus}
              onClick={handleInputClick}
              onBlur={handleInputBlur}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className={cn(
                'flex h-10 w-full rounded-md border border-input bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-foreground ring-offset-background',
                'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
                showClearButton ? 'pr-16' : 'pr-8',
                className,
              )}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {showClearButton && (
                <button
                  type="button"
                  data-combobox-clear
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleClear}
                  className="p-1 rounded hover:bg-muted transition-colors"
                  aria-label="Clear selection"
                >
                  <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
              <button
                type="button"
                data-combobox-chevron
                data-testid="combobox-chevron"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleChevronClick}
                className="p-1 rounded hover:bg-muted transition-colors"
                aria-label={open ? 'Close dropdown' : 'Open dropdown'}
                tabIndex={-1}
              >
                <ChevronDown className="h-4 w-4 opacity-50" />
              </button>
            </div>
          </div>
        </PopoverAnchor>
        <PopoverContent
          data-combobox-content
          className="w-(--radix-popover-trigger-width) p-1"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            // Don't close if clicking the input, clear button, or chevron
            const target = e.target as Node;
            if (
              inputRef.current?.contains(target) ||
              (target as HTMLElement)?.closest?.('[data-combobox-clear]') ||
              (target as HTMLElement)?.closest?.('[data-combobox-chevron]')
            ) {
              e.preventDefault();
            }
          }}
        >
          <div ref={listRef} id={listboxId} className="max-h-60 overflow-y-auto" role="listbox">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</div>
            ) : (
              filteredOptions.map((option, index) => (
                <button
                  key={option.value}
                  id={`${listboxId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  data-highlighted={index === highlightedIndex || undefined}
                  onMouseDown={(e) => e.preventDefault()} // Prevent blur
                  onClick={() => handleSelect(option.value)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={cn(
                    'relative flex w-full cursor-pointer select-none items-center rounded-sm py-2 pl-8 pr-2 text-sm outline-none',
                    'hover:bg-accent hover:text-accent-foreground',
                    index === highlightedIndex && 'bg-accent text-accent-foreground',
                    option.value === value && 'font-medium',
                  )}
                >
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    {option.value === value && <Check className="h-4 w-4" />}
                  </span>
                  <span className="truncate">{option.label}</span>
                  {option.description && (
                    <span className="ml-2 text-muted-foreground truncate">
                      · {option.description}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export { Combobox };
