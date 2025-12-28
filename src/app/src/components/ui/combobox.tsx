import * as React from 'react';

import { cn } from '@app/lib/utils';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Command as CommandPrimitive } from 'cmdk';
import { Check, ChevronDown, X } from 'lucide-react';

/**
 * Combobox - A searchable select component with support for single/multiple selection.
 *
 * Built on cmdk for search functionality and Radix Popover for positioning.
 *
 * @example
 * // Single select
 * <Combobox
 *   options={[
 *     { value: 'react', label: 'React' },
 *     { value: 'vue', label: 'Vue' },
 *   ]}
 *   value={selected}
 *   onValueChange={setSelected}
 *   placeholder="Select framework..."
 * />
 *
 * @example
 * // Multiple select
 * <ComboboxMultiple
 *   options={options}
 *   value={selectedItems}
 *   onValueChange={setSelectedItems}
 *   placeholder="Select frameworks..."
 * />
 *
 * @example
 * // With freeSolo (allow custom input)
 * <Combobox
 *   options={options}
 *   value={value}
 *   onValueChange={setValue}
 *   freeSolo
 *   placeholder="Type or select..."
 * />
 */

export interface ComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
}

// ============================================================================
// Command primitives (styled cmdk components)
// ============================================================================

const Command = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      'flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground',
      className,
    )}
    {...props}
  />
));
Command.displayName = CommandPrimitive.displayName;

const CommandInput = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none',
        'placeholder:text-muted-foreground',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  </div>
));
CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn('max-h-[300px] overflow-y-auto overflow-x-hidden', className)}
    {...props}
  />
));
CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className={cn('py-6 text-center text-sm text-muted-foreground', className)}
    {...props}
  />
));
CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      'overflow-hidden p-1 text-foreground',
      '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground',
      className,
    )}
    {...props}
  />
));
CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandItem = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none',
      'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
      'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
      className,
    )}
    {...props}
  />
));
CommandItem.displayName = CommandPrimitive.Item.displayName;

const CommandLoading = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Loading>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Loading>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Loading
    ref={ref}
    className={cn('py-6 text-center text-sm text-muted-foreground', className)}
    {...props}
  />
));
CommandLoading.displayName = CommandPrimitive.Loading.displayName;

// ============================================================================
// Combobox (Single Select)
// ============================================================================

interface ComboboxProps {
  /**
   * Available options to select from.
   */
  options: ComboboxOption[];
  /**
   * Currently selected value.
   */
  value?: string;
  /**
   * Callback when selection changes.
   */
  onValueChange?: (value: string) => void;
  /**
   * Placeholder text when no value is selected.
   */
  placeholder?: string;
  /**
   * Text shown when no options match the search.
   */
  emptyText?: string;
  /**
   * Whether to allow custom input (freeSolo mode).
   * @default false
   */
  freeSolo?: boolean;
  /**
   * Callback when input text changes (useful for async loading).
   */
  onInputChange?: (value: string) => void;
  /**
   * Whether options are currently loading.
   * @default false
   */
  loading?: boolean;
  /**
   * Text shown while loading.
   */
  loadingText?: string;
  /**
   * Whether the combobox is disabled.
   * @default false
   */
  disabled?: boolean;
  /**
   * Size variant.
   * @default "default"
   */
  size?: 'sm' | 'default';
  /**
   * Additional className for the trigger button.
   */
  className?: string;
  /**
   * Whether the combobox can be cleared.
   * @default true
   */
  clearable?: boolean;
}

function Combobox({
  options,
  value,
  onValueChange,
  placeholder = 'Select...',
  emptyText = 'No results found.',
  freeSolo = false,
  onInputChange,
  loading = false,
  loadingText = 'Loading...',
  disabled = false,
  size = 'default',
  className,
  clearable = true,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');

  const selectedOption = options.find((opt) => opt.value === value);
  const displayValue = selectedOption?.label || value || '';

  const handleSelect = (selectedValue: string) => {
    onValueChange?.(selectedValue);
    setOpen(false);
    setInputValue('');
  };

  const handleInputChange = (newValue: string) => {
    setInputValue(newValue);
    onInputChange?.(newValue);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onValueChange?.('');
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (freeSolo && e.key === 'Enter' && inputValue && !loading) {
      // In freeSolo mode, allow creating custom value
      const existingOption = options.find(
        (opt) => opt.label.toLowerCase() === inputValue.toLowerCase(),
      );
      if (existingOption) {
        handleSelect(existingOption.value);
      } else {
        handleSelect(inputValue);
      }
    }
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild disabled={disabled}>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          className={cn(
            'flex w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm',
            'ring-offset-background transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'hover:bg-muted/50',
            size === 'sm' ? 'h-8' : 'h-10',
            className,
          )}
          disabled={disabled}
        >
          <span className={cn('truncate', !displayValue && 'text-muted-foreground')}>
            {displayValue || placeholder}
          </span>
          <div className="flex items-center gap-1">
            {clearable && value && !disabled && (
              <span
                role="button"
                tabIndex={-1}
                onClick={handleClear}
                className="rounded-sm opacity-50 hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </div>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className={cn(
            'z-[var(--z-dropdown)] w-[var(--radix-popover-trigger-width)] rounded-md border bg-popover p-0 shadow-md',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
          )}
          align="start"
          sideOffset={4}
        >
          <Command shouldFilter={!onInputChange}>
            <CommandInput
              placeholder={placeholder}
              value={inputValue}
              onValueChange={handleInputChange}
              onKeyDown={handleKeyDown}
            />
            <CommandList>
              {loading && <CommandLoading>{loadingText}</CommandLoading>}
              {!loading && <CommandEmpty>{emptyText}</CommandEmpty>}
              {!loading && (
                <CommandGroup>
                  {options.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={option.label}
                      disabled={option.disabled}
                      onSelect={() => handleSelect(option.value)}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          value === option.value ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      {option.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
Combobox.displayName = 'Combobox';

// ============================================================================
// ComboboxMultiple
// ============================================================================

interface ComboboxMultipleProps extends Omit<ComboboxProps, 'value' | 'onValueChange'> {
  /**
   * Currently selected values.
   */
  value: string[];
  /**
   * Callback when selection changes.
   */
  onValueChange: (value: string[]) => void;
  /**
   * Maximum number of items that can be selected.
   */
  maxItems?: number;
}

function ComboboxMultiple({
  options,
  value = [],
  onValueChange,
  placeholder = 'Select...',
  emptyText = 'No results found.',
  freeSolo = false,
  onInputChange,
  loading = false,
  loadingText = 'Loading...',
  disabled = false,
  size = 'default',
  className,
  maxItems,
}: ComboboxMultipleProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');

  const selectedOptions = options.filter((opt) => value.includes(opt.value));
  const canAddMore = maxItems === undefined || value.length < maxItems;

  const handleSelect = (selectedValue: string) => {
    if (value.includes(selectedValue)) {
      // Remove if already selected
      onValueChange(value.filter((v) => v !== selectedValue));
    } else if (canAddMore) {
      // Add if not at max
      onValueChange([...value, selectedValue]);
    }
    setInputValue('');
  };

  const handleRemove = (valueToRemove: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    onValueChange(value.filter((v) => v !== valueToRemove));
  };

  const handleInputChange = (newValue: string) => {
    setInputValue(newValue);
    onInputChange?.(newValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      // Remove last item on backspace when input is empty
      handleRemove(value[value.length - 1]);
    } else if (freeSolo && e.key === 'Enter' && inputValue && !loading && canAddMore) {
      // In freeSolo mode, allow creating custom value
      const existingOption = options.find(
        (opt) => opt.label.toLowerCase() === inputValue.toLowerCase(),
      );
      if (existingOption) {
        if (!value.includes(existingOption.value)) {
          handleSelect(existingOption.value);
        }
      } else if (!value.includes(inputValue)) {
        onValueChange([...value, inputValue]);
        setInputValue('');
      }
    }
  };

  const getDisplayLabel = (val: string) => {
    const option = options.find((opt) => opt.value === val);
    return option?.label || val;
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild disabled={disabled}>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          className={cn(
            'flex w-full min-h-10 items-center justify-between rounded-md border border-input bg-background px-3 text-sm',
            'ring-offset-background transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'hover:bg-muted/50',
            size === 'sm' ? 'min-h-8' : 'min-h-10',
            className,
          )}
          disabled={disabled}
        >
          <div className="flex flex-1 flex-wrap items-center gap-1 py-1">
            {value.length === 0 && (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            {value.map((val) => (
              <span
                key={val}
                className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium"
              >
                {getDisplayLabel(val)}
                {!disabled && (
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => handleRemove(val, e)}
                    className="rounded-sm opacity-50 hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </span>
            ))}
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className={cn(
            'z-[var(--z-dropdown)] w-[var(--radix-popover-trigger-width)] rounded-md border bg-popover p-0 shadow-md',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
          )}
          align="start"
          sideOffset={4}
        >
          <Command shouldFilter={!onInputChange}>
            <CommandInput
              placeholder={canAddMore ? placeholder : 'Maximum reached'}
              value={inputValue}
              onValueChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={!canAddMore && !freeSolo}
            />
            <CommandList>
              {loading && <CommandLoading>{loadingText}</CommandLoading>}
              {!loading && <CommandEmpty>{emptyText}</CommandEmpty>}
              {!loading && (
                <CommandGroup>
                  {options.map((option) => {
                    const isSelected = value.includes(option.value);
                    return (
                      <CommandItem
                        key={option.value}
                        value={option.label}
                        disabled={option.disabled || (!isSelected && !canAddMore)}
                        onSelect={() => handleSelect(option.value)}
                      >
                        <div
                          className={cn(
                            'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                            isSelected
                              ? 'bg-primary text-primary-foreground'
                              : 'opacity-50 [&_svg]:invisible',
                          )}
                        >
                          <Check className="h-3 w-3" />
                        </div>
                        {option.label}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
ComboboxMultiple.displayName = 'ComboboxMultiple';

// Export Command primitives for custom usage
export {
  Combobox,
  ComboboxMultiple,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
};
